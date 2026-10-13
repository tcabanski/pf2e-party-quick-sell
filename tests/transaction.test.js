import test from "node:test";
import assert from "node:assert/strict";

test("socket request identity includes authenticated sender", async () => {
  const owner = makeUser("owner");
  const outsider = makeUser("outsider");
  const item = makeItem();
  const actor = makeActor(item, { user: owner });
  const runtime = makeRuntime({ actor });
  runtime.game.users.set(owner.id, owner);
  runtime.game.users.set(outsider.id, outsider);
  const replies = [];
  runtime.game.socket.emit = (_channel, message) => replies.push(message);
  const request = { type: "sell-request", requestId: "shared-id", actorUuid: actor.uuid, itemId: item.id, quantity: 1, percent: 50, fingerprint: runtime.fingerprint(item) };
  await runtime.handleSocket(request, outsider.id);
  await runtime.handleSocket(request, owner.id);
  assert.equal(replies.at(-1).status, "sold");
  assert.equal(replies.at(-1).requesterId, owner.id);
  assert.equal(replies[0].requesterId, outsider.id);
});

test("percentage changes refresh rendered Party sheets", () => {
  const runtime = makeRuntime();
  let setting;
  let renders = 0;
  runtime.game.settings.register = (_scope, _key, value) => { setting = value; };
  runtime.game.actors = [{ type: "party", sheet: { rendered: true, render: () => { renders += 1; } } }];
  runtime.registerSetting();
  setting.onChange(60);
  assert.equal(renders, 1);
});

test("hung read-only actor lookup times out without a late sale", async () => {
  const runtime = makeRuntime();
  const replies = [];
  runtime.game.socket.emit = (_channel, message) => replies.push(message);
  let resolveLookup;
  const bounded = createSaleRuntime({ game: runtime.game, Hooks: makeHooks(), lookupTimeoutMs: 5, resolveActor: () => new Promise(resolve => { resolveLookup = resolve; }) });
  await bounded.handleSocket({ type: "sell-request", requestId: "hung", actorUuid: "Actor.none", itemId: "item", quantity: 1, percent: 50, fingerprint: "valid" }, runtime.game.user.id);
  assert.equal(replies.at(-1).code, "LOOKUP_TIMEOUT");
  resolveLookup(undefined);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(replies.length, 1);
});

test("hung lookup concurrency is capped without dropping active requests", async () => {
  const runtime = makeRuntime();
  const replies = [];
  const lookups = [];
  runtime.game.socket.emit = (_channel, message) => replies.push(message);
  const bounded = createSaleRuntime({ game: runtime.game, Hooks: makeHooks(), resolveActor: () => new Promise(resolve => lookups.push(resolve)) });
  const request = i => ({ type: "sell-request", requestId: `pending-${i}`, actorUuid: "Actor.none", itemId: "item", quantity: 1, percent: 50, fingerprint: "valid" });
  const pending = Array.from({ length: 64 }, (_, i) => bounded.handleSocket(request(i), runtime.game.user.id));
  await new Promise(resolve => setImmediate(resolve));
  await bounded.handleSocket(request(64), runtime.game.user.id);
  assert.equal(replies.at(-1).code, "RATE_LIMIT");
  assert.equal(lookups.length, 64);
  for (const resolve of lookups) resolve(undefined);
  await Promise.all(pending);
  assert.equal(replies.length, 65);
});

// Regression cases identified by independent release review.
test("rejects coerced percentage types and unavailable saved setting", () => {
  for (const value of [true, false, null, undefined, "50", [], {}]) {
    assert.throws(() => computeProceedsCp(100, value), e => e.code === "INVALID_PERCENT");
    const runtime = makeRuntime();
    runtime.game.settings.get = () => value;
    assert.throws(() => runtime.percent(), e => e.code === "INVALID_PERCENT");
  }
  const runtime = makeRuntime();
  delete runtime.game.settings.get;
  assert.throws(() => runtime.percent(), e => e.code === "UNSUPPORTED_API");
});

test("enforces the manifest minimum Foundry build at runtime", () => {
  for (const version of ["14", "14.0", "14.360", "14.bad", "15.361"]) {
    assert.equal(isSupportedEnvironment({ system: { id: "pf2e", version: "8.6.1" }, version }), false);
  }
  assert.equal(isSupportedEnvironment({ system: { id: "pf2e", version: "8.6.1" }, version: "14.361" }), true);
});

test("partial sale requires update API before writing a journal", async () => {
  const item = makeItem({ quantity: 5, value: 500 });
  const actor = makeActor(item);
  delete item.update;
  const runtime = makeRuntime({ actor });
  await assert.rejects(runtime.sell({ actor, item, quantity: 2 }), e => e.code === "UNSUPPORTED_API");
  assert.equal(actor.getFlag(MODULE_ID, "saleJournal"), undefined);
  assert.equal(item.quantity, 5);
  assert.equal(actor.inventory.addCoinsCalls.length, 0);
});

test("bounds unique socket request retention and processing", async () => {
  const runtime = makeRuntime();
  const messages = [];
  let resolved = 0;
  runtime.game.socket.emit = (_channel, message) => messages.push(message);
  const bounded = createSaleRuntime({ game: runtime.game, Hooks: makeHooks(), resolveActor: async () => { resolved += 1; } });
  for (let i = 0; i < 1025; i += 1) {
    await bounded.handleSocket({ type: "sell-request", requestId: `spam-${i}`, actorUuid: "Actor.none", itemId: "item", quantity: 1, percent: 50, fingerprint: "valid" }, runtime.game.user.id);
  }
  assert.equal(resolved, 1024);
  assert.equal(messages.at(-1).code, "RATE_LIMIT");
});
import { MODULE_ID, PHYSICAL_ITEM_TYPES, canSellItem, computeProceedsCp, createSaleRuntime, hasRequiredRuntimeFeatures, isSupportedEnvironment } from "../scripts/transaction.js";

function makeUser(id, { isGM = false } = {}) { return { id, name: id, isGM, isActiveGM: isGM }; }
function makeHooks() { const listeners = new Map(); return { on(name, fn) { const list = listeners.get(name) ?? []; list.push(fn); listeners.set(name, list); return fn; }, off(name, fn) { listeners.set(name, (listeners.get(name) ?? []).filter((entry) => entry !== fn)); }, emit(name, ...args) { for (const fn of listeners.get(name) ?? []) fn(...args); } }; }
function makeItem({ id = "item-1", type = "equipment", quantity = 1, value = 100, identified = true, temporary = false, isTemporary = false, systemTemporary = false, parent, parentItem, contents = [], subitems = [], deleteError } = {}) { return { id, uuid: `${parent?.uuid ?? "Actor.actor-1"}.Item.${id}`, name: "Test item", type, quantity, isIdentified: identified, temporary, isTemporary, parentItem, system: { temporary: systemTemporary }, contents, subitems, assetValue: { copperValue: value }, price: { value: value / quantity, per: 1 }, toObject: function toObject() { return { _id: id, type: this.type, system: { quantity: this.quantity, price: { value } }, name: "Test item" }; }, canUserModify: (user, action) => action === "delete" && user.id !== "blocked", async delete() { if (deleteError) throw deleteError; this.parent.items.delete(id); return this; }, async update(changes) { const next = changes["system.quantity"]; if (next !== undefined) this.quantity = next; return this; } }; }
function makeActor(item, { permission = true, user = makeUser("owner"), setFlagError, addCoinsError, hookBus = makeHooks() } = {}) { const actor = { id: "actor-1", uuid: "Actor.actor-1", type: "party", _hookBus: hookBus, items: new Map(), flags: { [MODULE_ID]: {} }, inventory: { addCoinsCalls: [], async addCoins(coins, options) { this.addCoinsCalls.push({ coins, options }); if (addCoinsError) throw addCoinsError; const coin = { id: `coin-${this.addCoinsCalls.length}`, uuid: "Actor.actor-1.Item.coin", type: "treasure", isCurrency: true, isCoinage: true, system: { category: "coin", slug: "cp", quantity: coins.cp }, assetValue: { copperValue: coins.cp }, parent: actor, toObject: () => ({ _id: "coin", type: "treasure" }) }; actor.items.set(coin.id, coin); hookBus.emit("preCreateItem", coin, {}, {}, user.id); } }, testUserPermission: (candidate) => permission && (candidate.isGM || candidate.id === user.id), async setFlag(scope, key, value) { if (setFlagError) throw setFlagError; this.flags[scope] ??= {}; this.flags[scope][key] = value; return value; }, getFlag(scope, key) { return this.flags[scope]?.[key]; }, async unsetFlag(scope, key) { delete this.flags[scope]?.[key]; } }; item.parent = actor; actor.items.set(item.id, item); return actor; }
function makeRuntime({ actor, gameUser = makeUser("gm", { isGM: true }), hooks = makeHooks(), socket } = {}) { const game = { pf2e: { Coins: { fromPrice: (price, quantity) => ({ copperValue: price.value * quantity }) } }, user: gameUser, users: new Map([[gameUser.id, gameUser]]), system: { id: "pf2e", version: "8.6.1" }, version: "14.369", settings: { get: () => 50 }, socket: socket ?? { emit() {}, on() {} } }; return createSaleRuntime({ game, Hooks: actor?._hookBus ?? hooks, resolveActor: async () => actor, logger: { error() {}, warn() {} } }); }

test("computes exact floored resale proceeds for zero, fractional, and large values", () => { assert.equal(computeProceedsCp(0n, 50), 0n); assert.equal(computeProceedsCp(99n, 50), 49n); assert.equal(computeProceedsCp(101n, 50), 50n); assert.equal(computeProceedsCp(1000n, 50), 500n); assert.equal(computeProceedsCp(999999999999999n, 37), 369999999999999n); });
test("recognizes PF2e physical item types and rejects unsupported runtime versions", () => { assert.deepEqual([...PHYSICAL_ITEM_TYPES], ["ammo", "armor", "backpack", "book", "consumable", "equipment", "shield", "weapon"]); assert.equal(isSupportedEnvironment({ system: { id: "pf2e", version: "8.6.1" }, version: "14.369" }), true); assert.equal(isSupportedEnvironment({ system: { id: "pf2e", version: "8.7.0" }, version: "14.369" }), true); assert.equal(isSupportedEnvironment({ system: { id: "pf2e", version: "8.6.0" }, version: "14.369" }), false); assert.equal(isSupportedEnvironment({ system: { id: "dnd5e", version: "8.6.1" }, version: "14.369" }), false); });
test("allows an identified item for an actor owner but not a party member owner", () => { const owner = makeUser("owner"); const item = makeItem({ identified: true }); const actor = makeActor(item, { user: owner }); assert.equal(canSellItem({ actor, item, user: owner }).ok, true); assert.equal(canSellItem({ actor, item, user: makeUser("member") }).ok, false); });
test("requires GM or identification and excludes invalid item roots", () => { const gm = makeUser("gm", { isGM: true }); const player = makeUser("player"); const actor = makeActor(makeItem({ identified: false })); const unidentified = actor.items.get("item-1"); assert.equal(canSellItem({ actor, item: unidentified, user: player }).ok, false); assert.equal(canSellItem({ actor, item: unidentified, user: gm }).ok, true); for (const options of [{ type: "treasure" }, { type: "equipment", isTemporary: true }, { type: "backpack", contents: [{}] }]) { const item = makeItem(options); const nextActor = makeActor(item); assert.equal(canSellItem({ actor: nextActor, item, user: gm }).ok, false); } });
test("does not sell a zero-value item", async () => { const gm = makeUser("gm", { isGM: true }); const item = makeItem({ value: 0 }); const actor = makeActor(item); const runtime = makeRuntime({ actor }); const result = await runtime.sell({ actor, item, user: gm, quantity: 1, percent: 50 }); assert.equal(result.status, "no-sale"); assert.equal(actor.items.has(item.id), true); assert.equal(actor.inventory.addCoinsCalls.length, 0); });
test("uses asset value including attached subitems for a whole-stack sale", async () => { const gm = makeUser("gm", { isGM: true }); const item = makeItem({ value: 1234, subitems: [{ id: "rune" }] }); const actor = makeActor(item); const runtime = makeRuntime({ actor }); const result = await runtime.sell({ actor, item, user: gm, quantity: 1, percent: 50 }); assert.equal(result.status, "sold"); assert.equal(result.proceedsCp, "617"); assert.equal(actor.inventory.addCoinsCalls[0].coins.cp, 617); assert.equal(actor.inventory.addCoinsCalls[0].options.combineStacks, false); });
test("sells part of a plain stack and preserves the remaining quantity", async () => { const gm = makeUser("gm", { isGM: true }); const item = makeItem({ quantity: 5, value: 500 }); const actor = makeActor(item); const runtime = makeRuntime({ actor }); const result = await runtime.sell({ actor, item, user: gm, quantity: 2, percent: 50 }); assert.equal(result.status, "sold"); assert.equal(result.proceedsCp, "100"); assert.equal(item.quantity, 3); assert.equal(actor.items.has(item.id), true); });
test("rejects partial sales when attached subitems would be split", async () => { const gm = makeUser("gm", { isGM: true }); const item = makeItem({ quantity: 2, value: 200, subitems: [{ id: "rune" }] }); const actor = makeActor(item); const runtime = makeRuntime({ actor }); await assert.rejects(runtime.sell({ actor, item, user: gm, quantity: 1, percent: 50 }), (error) => error.code === "PARTIAL_SUBITEMS"); assert.equal(actor.items.has(item.id), true); assert.equal(actor.inventory.addCoinsCalls.length, 0); });
test("serializes same-actor requests and rejects a stale second fingerprint", async () => { const gm = makeUser("gm", { isGM: true }); const item = makeItem({ quantity: 2, value: 200 }); const actor = makeActor(item); const runtime = makeRuntime({ actor }); const [a, b] = await Promise.all([runtime.sell({ actor, item, user: gm, quantity: 1, percent: 50 }), runtime.sell({ actor, item, user: gm, quantity: 2, percent: 50 })]); assert.equal(a.status, "sold"); assert.equal(b.status, "stale"); assert.equal(actor.inventory.addCoinsCalls.length, 1); assert.equal(item.quantity, 1); });
test("keeps an unresolved journal and never credits twice after an ambiguous credit failure", async () => { const gm = makeUser("gm", { isGM: true }); const item = makeItem({ value: 100 }); const actor = makeActor(item, { addCoinsError: new Error("timeout") }); const runtime = makeRuntime({ actor }); await assert.rejects(runtime.sell({ actor, item, user: gm, quantity: 1, percent: 50 }), (error) => error.code === "RECONCILIATION_REQUIRED"); assert.equal(actor.getFlag(MODULE_ID, "saleJournal").stage, "crediting"); assert.equal(actor.items.has(item.id), false); assert.equal(actor.inventory.addCoinsCalls.length, 1); await assert.rejects(runtime.sell({ actor, item, user: gm, quantity: 1, percent: 50 }), (error) => error.code === "JOURNAL_BLOCKED"); assert.equal(actor.inventory.addCoinsCalls.length, 1); });
test("clears a prepared journal only when the original item is still unchanged", async () => { const gm = makeUser("gm", { isGM: true }); const item = makeItem({ value: 100 }); const actor = makeActor(item); const runtime = makeRuntime({ actor }); await actor.setFlag(MODULE_ID, "saleJournal", { stage: "prepared", itemId: item.id, fingerprint: runtime.fingerprint(item) }); const result = await runtime.reconcileJournal(actor); assert.equal(result.status, "cleared"); assert.equal(actor.getFlag(MODULE_ID, "saleJournal"), undefined); });
test("uses authenticated socket sender identity and ignores untrusted payload userId", async () => { const owner = makeUser("owner"); const forged = makeUser("forged"); const item = makeItem({ value: 100 }); const actor = makeActor(item, { user: owner }); const runtime = makeRuntime({ actor, gameUser: makeUser("gm", { isGM: true }) }); runtime.game.users = new Map([[owner.id, owner], [forged.id, forged]]); await runtime.handleSocket({ type: "sell-request", userId: "owner", actorUuid: actor.uuid, itemId: item.id, quantity: 1, percent: 50, fingerprint: runtime.fingerprint(item) }, "forged"); assert.equal(actor.items.has(item.id), true); assert.equal(actor.inventory.addCoinsCalls.length, 0); });
test("rejects a queued request when its quantity fingerprint is stale", async () => { const gm = makeUser("gm", { isGM: true }); const item = makeItem({ quantity: 3, value: 300 }); const actor = makeActor(item); const runtime = makeRuntime({ actor }); const pending = runtime.sell({ actor, item, user: gm, quantity: 2, percent: 50 }); item.quantity = 1; const result = await pending; assert.equal(result.status, "stale"); assert.equal(actor.inventory.addCoinsCalls.length, 0); });
test("serializes two socket senders and applies ownership separately", async () => { const owner = makeUser("owner"); const member = makeUser("member"); const item = makeItem({ value: 100 }); const actor = makeActor(item, { user: owner }); const runtime = makeRuntime({ actor, gameUser: makeUser("gm", { isGM: true }) }); runtime.game.users = new Map([[owner.id, owner], [member.id, member]]); const messages = []; runtime.game.socket.emit = (_channel, message) => messages.push(message); const request = { type: "sell-request", actorUuid: actor.uuid, itemId: item.id, quantity: 1, percent: 50, fingerprint: runtime.fingerprint(item) }; await Promise.all([runtime.handleSocket({ ...request, requestId: "owner" }, owner.id), runtime.handleSocket({ ...request, requestId: "member" }, member.id)]); assert.equal(actor.inventory.addCoinsCalls.length, 1); assert.equal(messages.filter((message) => message.status === "sold").length, 1); assert.equal(messages.filter((message) => message.status === "error" && message.code === "NOT_ELIGIBLE").length, 1); });
test("does not credit when deletion reports a no-op", async () => { const gm = makeUser("gm", { isGM: true }); const item = makeItem({ value: 100 }); const actor = makeActor(item); item.delete = async function deleteNoOp() { return this; }; const runtime = makeRuntime({ actor }); await assert.rejects(runtime.sell({ actor, item, user: gm, quantity: 1, percent: 50 }), (error) => error.code === "RECONCILIATION_REQUIRED"); assert.equal(actor.items.has(item.id), true); assert.equal(actor.inventory.addCoinsCalls.length, 0); });
test("installs only on the supported runtime and registers the setting once", () => { const hooks = makeHooks(); const socket = { onCalls: 0, on() { this.onCalls += 1; }, emit() {} }; const settings = []; const game = { user: makeUser("gm", { isGM: true }), system: { id: "pf2e", version: "8.6.1" }, version: "14.369", settings: { register: (...args) => settings.push(args), get: () => 50 }, socket }; const runtime = createSaleRuntime({ game, Hooks: hooks, decorate: () => {} }); assert.equal(hasRequiredRuntimeFeatures({ game, Hooks: hooks }), true); assert.equal(hasRequiredRuntimeFeatures({ game: { ...game, socket: { on() {}, emit() {} } }, Hooks: {} }), false); assert.equal(runtime.install(), true); assert.equal(runtime.install(), false); assert.equal(settings.length, 1); assert.equal(settings[0][0], MODULE_ID); assert.equal(settings[0][1], "resalePercent"); assert.equal(settings[0][2].name, "Equipment resale percentage"); assert.deepEqual(settings[0][2].range, { min: 0, max: 100, step: 1 }); assert.equal(socket.onCalls, 1); });

test("requires a party actor, recognizes real temporary flags, and allows physical contained items", () => { const gm = makeUser("gm", { isGM: true }); const contained = makeItem({ id: "contained", type: "equipment" }); const actor = makeActor(contained); contained.container = { id: "bag" }; assert.equal(canSellItem({ actor, item: contained, user: gm }).ok, true); contained.parentItem = { id: "attachment" }; assert.equal(canSellItem({ actor, item: contained, user: gm }).ok, false); const legacyTemporary = makeActor(makeItem({ temporary: true })); assert.equal(canSellItem({ actor: legacyTemporary, item: legacyTemporary.items.get("item-1"), user: gm }).ok, true); const actualTemporary = makeActor(makeItem({ isTemporary: true })); assert.equal(canSellItem({ actor: actualTemporary, item: actualTemporary.items.get("item-1"), user: gm }).ok, false); const nonParty = makeActor(makeItem()); nonParty.type = "character"; assert.equal(canSellItem({ actor: nonParty, item: nonParty.items.get("item-1"), user: gm }).ok, false); });

test("public sell uses the current user and world percentage, not spoofed request fields", async () => { const gm = makeUser("gm", { isGM: true }); const item = makeItem({ value: 100 }); const actor = makeActor(item); const runtime = makeRuntime({ actor, gameUser: gm }); const result = await runtime.sell({ actor, item, user: makeUser("spoof"), percent: 0, quantity: 1 }); assert.equal(result.proceedsCp, "50"); });

test("records recovery source, requester, and asset value in the prepared journal", async () => { const gm = makeUser("gm", { isGM: true }); const item = makeItem({ value: 100 }); const actor = makeActor(item, { addCoinsError: new Error("credit failed") }); const runtime = makeRuntime({ actor }); await assert.rejects(runtime.sell({ actor, item, quantity: 1 }), (error) => error.code === "RECONCILIATION_REQUIRED"); const journal = actor.getFlag(MODULE_ID, "saleJournal"); assert.equal(journal.requesterId, gm.id); assert.equal(journal.assetCp, "100"); assert.deepEqual(journal.originalSource, item.toObject()); assert.notEqual(journal.transactionId, "undefined"); });

test("uses native Coins valuation for partial stacks instead of scaling floored totals", async () => { const gm = makeUser("gm", { isGM: true }); const item = makeItem({ quantity: 3, value: 10 }); item.price = { value: 10 }; const actor = makeActor(item); const runtime = makeRuntime({ actor }); runtime.game.pf2e = { Coins: { fromPrice: (_price, quantity) => ({ copperValue: quantity === 1 ? 4 : 8 }) } }; const result = await runtime.sell({ actor, item, quantity: 1 }); assert.equal(result.proceedsCp, "2"); });

test("revalidates item identity and derived value after journal persistence", async () => { const gm = makeUser("gm", { isGM: true }); const item = makeItem({ value: 100 }); const actor = makeActor(item); const originalSetFlag = actor.setFlag.bind(actor); actor.setFlag = async (scope, key, value) => { if (value.stage === "prepared") item.assetValue.copperValue = 200; return originalSetFlag(scope, key, value); }; const runtime = makeRuntime({ actor }); await assert.rejects(runtime.sell({ actor, item, quantity: 1 }), (error) => error.code === "RECONCILIATION_REQUIRED"); assert.equal(actor.items.has(item.id), true); assert.equal(actor.inventory.addCoinsCalls.length, 0); });
test("treats an undefined delete result as reconciliation failure", async () => { const gm = makeUser("gm", { isGM: true }); const item = makeItem({ value: 100 }); const actor = makeActor(item); item.delete = async () => undefined; const runtime = makeRuntime({ actor }); await assert.rejects(runtime.sell({ actor, item, quantity: 1 }), (error) => error.code === "RECONCILIATION_REQUIRED"); assert.equal(actor.items.has(item.id), true); assert.equal(actor.inventory.addCoinsCalls.length, 0); });
test("rejects spoofed direct GM identity and reports missing socket targets", async () => { const player = makeUser("player"); const gm = makeUser("gm", { isGM: true }); const item = makeItem(); const actor = makeActor(item, { user: gm }); const runtime = makeRuntime({ actor, gameUser: player }); await assert.rejects(runtime.sell({ actor, item, user: gm }), (error) => error.code === "NO_ACTIVE_GM"); const messages = []; const game = { user: gm, users: new Map([[gm.id, gm], [player.id, player]]), system: { id: "pf2e", version: "8.6.1" }, version: "14.369", settings: { get: () => 50 }, socket: { emit: (_channel, message) => messages.push(message), on() {} } }; const socketRuntime = createSaleRuntime({ game, Hooks: makeHooks(), resolveActor: async () => undefined }); await socketRuntime.handleSocket({ type: "sell-request", requestId: "missing", actorUuid: actor.uuid, itemId: item.id, quantity: 1, percent: 50, fingerprint: "valid-shape" }, player.id); assert.equal(messages.at(-1).code, "NOT_FOUND"); });

test("expires a player request without replaying it", async () => { const player = makeUser("player"); const gm = makeUser("gm", { isGM: true }); const item = makeItem(); const actor = makeActor(item, { user: player }); const runtime = makeRuntime({ actor, gameUser: player }); runtime.game.users.set(gm.id, gm); const warnings = []; const shortRuntime = createSaleRuntime({ game: runtime.game, Hooks: makeHooks(), resolveActor: async () => actor, requestTimeoutMs: 5, logger: { warn: (message) => warnings.push(message) } }); await assert.rejects(shortRuntime.requestSale({ actor, item, quantity: 1 }), (error) => error.code === "REQUEST_TIMEOUT"); assert.equal(warnings.length, 1); assert.equal(actor.inventory.addCoinsCalls.length, 0); });
