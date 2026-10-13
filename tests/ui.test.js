import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { decoratePartyInventory } from "../scripts/ui.js";

test("missing confirmation API never executes a normal-click sale", async () => {
  const { root, app } = setup();
  const previous = globalThis.DialogV2;
  delete globalThis.DialogV2;
  let sales = 0;
  const errors = [];
  const runtime = { percent: () => 50, logger: { error: message => errors.push(message) }, requestSale: async () => { sales += 1; return { status: "sold" }; } };
  try {
    decoratePartyInventory(app, root, runtime);
    root.querySelector('[data-pf2e-party-quick-sell="true"]').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(sales, 0);
    assert.match(errors[0], /confirmation.*unavailable/i);
  } finally { globalThis.DialogV2 = previous; }
});

test("only actual Party Stash rows receive controls", () => {
  const { root, app } = setup();
  const outside = root.ownerDocument.createElement("div");
  outside.dataset.tab = "orphaned";
  outside.innerHTML = '<li data-item-id="a"><div class="item-controls"></div></li>';
  root.append(outside);
  decoratePartyInventory(app, root, { percent: () => 50 });
  assert.equal(outside.querySelectorAll('[data-pf2e-party-quick-sell="true"]').length, 0);
  assert.equal(root.querySelectorAll('[data-pf2e-party-quick-sell="true"]').length, 1);
});

test("stale whole-stack control never silently sells a partial quantity", async () => {
  const { root, app, item } = setup();
  let sales = 0;
  const warnings = [];
  const runtime = { percent: () => 50, logger: { warn: m => warnings.push(m) }, requestSale: async () => { sales += 1; return { status: "sold" }; } };
  decoratePartyInventory(app, root, runtime);
  item.quantity = 3;
  root.querySelector('[data-pf2e-party-quick-sell="true"]').dispatchEvent(new root.ownerDocument.defaultView.MouseEvent("click", { bubbles: true, ctrlKey: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sales, 0);
  assert.equal(warnings.length, 1);
});

function setup(html = `<form><ol class="inventory-list"><li data-item-id="a"><div class="item-controls"></div></li><li data-item-id="treasure"><div class="item-controls"><a class="item-sell-treasure" data-action="sell-treasure"><i class="fa-solid fa-coins"></i></a></div></li></ol></form>`) {
  const dom = new JSDOM(html);
  const form = dom.window.document.querySelector("form");
  const tab = dom.window.document.createElement("div");
  tab.className = "tab inventory";
  tab.dataset.tab = "inventory";
  const stash = dom.window.document.createElement("section");
  stash.className = "inventory";
  while (form.firstChild) stash.append(form.firstChild);
  tab.append(stash);
  form.append(tab);
  const item = {
    id: "a",
    type: "equipment",
    quantity: 2,
    isIdentified: true,
    assetValue: { copperValue: 100 },
    parent: { type: "party", uuid: "Actor.party", items: new Map(), testUserPermission: () => true },
    canUserModify: (_user, action) => action === "delete",
  };
  item.parent.items.set(item.id, item);
  const actor = item.parent;
  const app = { actor, isEditable: true, options: { editable: true }, renderCalls: 0, render() { this.renderCalls += 1; } };
  return { dom, root: dom.window.document.querySelector("form"), app, item };
}

test("adds one accessible whole-stack sell control with current proceeds tooltip", () => {
  const { root, app, item } = setup();
  const runtime = { percent: () => 50, requestSale: async () => ({ status: "sold" }) };
  decoratePartyInventory(app, root, runtime);
  const control = root.querySelector('[data-pf2e-party-quick-sell="true"]');
  assert.ok(control);
  assert.equal(control.dataset.itemId, item.id);
  assert.equal(control.dataset.quantity, "2");
  assert.equal(control.getAttribute("aria-label"), "Sell item");
  assert.equal(control.getAttribute("role"), "button");
  assert.equal(control.getAttribute("tabindex"), "0");
  assert.match(control.getAttribute("data-tooltip"), /50%/);
  assert.equal(control.querySelector(".fa-coins")?.classList.contains("fa-solid"), true);
});

test("does not duplicate controls or listeners on rerender", async () => {
  const { root, app } = setup();
  let calls = 0;
  const runtime = { percent: () => 50, requestSale: async () => { calls += 1; return { status: "sold" }; } };
  decoratePartyInventory(app, root, runtime);
  decoratePartyInventory(app, root, runtime);
  assert.equal(root.querySelectorAll('[data-pf2e-party-quick-sell="true"]').length, 1);
  const control = root.querySelector('[data-pf2e-party-quick-sell="true"]');
  control.dispatchEvent(new root.ownerDocument.defaultView.MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
});

test("removes module controls from readonly renders and leaves native treasure control untouched", () => {
  const { root, app } = setup();
  const runtime = { percent: () => 50, requestSale: async () => ({ status: "sold" }) };
  decoratePartyInventory(app, root, runtime);
  assert.equal(root.querySelectorAll('[data-pf2e-party-quick-sell="true"]').length, 1);
  app.isEditable = false;
  app.options.editable = false;
  decoratePartyInventory(app, root, runtime);
  assert.equal(root.querySelectorAll('[data-pf2e-party-quick-sell="true"]').length, 0);
  assert.equal(root.querySelectorAll('.item-sell-treasure').length, 1);
});

test("does not add a quick-sell control to native treasure rows", () => {
  const { root, app, item } = setup();
  item.type = "treasure";
  const runtime = { percent: () => 50, requestSale: async () => ({ status: "sold" }) };
  decoratePartyInventory(app, root, runtime);
  assert.equal(root.querySelectorAll('[data-pf2e-party-quick-sell="true"]').length, 0);
});

test("uses full authorization and removes controls for unidentified, member, and nonempty items", () => {
  const { root, app, item } = setup();
  const runtime = { game: { user: { id: "owner" } }, percent: () => 50, requestSale: async () => ({ status: "sold" }) };
  item.isIdentified = false;
  decoratePartyInventory(app, root, runtime);
  assert.equal(root.querySelectorAll('[data-pf2e-party-quick-sell="true"]').length, 0);
  item.isIdentified = true;
  app.actor.testUserPermission = () => false;
  decoratePartyInventory(app, root, runtime);
  assert.equal(root.querySelectorAll('[data-pf2e-party-quick-sell="true"]').length, 0);
  app.actor.testUserPermission = () => true;
  item.type = "backpack";
  item.contents = [{}];
  decoratePartyInventory(app, root, runtime);
  assert.equal(root.querySelectorAll('[data-pf2e-party-quick-sell="true"]').length, 0);
});

test("confirms normal activation and supports keyboard and control-click bypass", async () => {
  const { root, app } = setup();
  let confirmations = 0;
  let sales = 0;
  const previous = globalThis.DialogV2;
  globalThis.DialogV2 = { confirm: async () => { confirmations += 1; return true; } };
  const runtime = { game: { user: { id: "owner" } }, percent: () => 50, requestSale: async () => { sales += 1; return { status: "sold" }; } };
  decoratePartyInventory(app, root, runtime);
  const control = root.querySelector('[data-pf2e-party-quick-sell="true"]');
  control.dispatchEvent(new root.ownerDocument.defaultView.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(confirmations, 1);
  assert.equal(sales, 1);
  decoratePartyInventory(app, root, runtime);
  const refreshed = root.querySelector('[data-pf2e-party-quick-sell="true"]');
  refreshed.dispatchEvent(new root.ownerDocument.defaultView.MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(confirmations, 1);
  assert.equal(sales, 2);
  globalThis.DialogV2 = previous;
});

test("locks duplicate rapid activation before confirmation", async () => {
  const { root, app } = setup();
  let resolveConfirmation;
  let confirmations = 0;
  let sales = 0;
  const previous = globalThis.DialogV2;
  globalThis.DialogV2 = { confirm: () => { confirmations += 1; return new Promise((resolve) => { resolveConfirmation = resolve; }); } };
  const runtime = { game: { user: { id: "owner" } }, percent: () => 50, requestSale: async () => { sales += 1; return { status: "sold" }; } };
  decoratePartyInventory(app, root, runtime);
  const control = root.querySelector('[data-pf2e-party-quick-sell="true"]');
  control.click();
  control.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(confirmations, 1);
  resolveConfirmation(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sales, 1);
  globalThis.DialogV2 = previous;
});

test("handles a zero-value response without rendering a deletion and preserves native denomination formatting", async () => {
  const { root, app, item } = setup();
  let calls = 0;
  item.assetValue.copperValue = 0;
  const runtime = { game: { user: { id: "owner" }, pf2e: { Coins: class { constructor() {} normalized() { return { toString: () => "0 cp" }; } } } }, percent: () => 50, requestSale: async () => { calls += 1; return { status: "no-sale" }; } };
  decoratePartyInventory(app, root, runtime);
  const control = root.querySelector('[data-pf2e-party-quick-sell="true"]');
  control.dispatchEvent(new root.ownerDocument.defaultView.MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(app.renderCalls, 0);
  item.assetValue.copperValue = 100;
  runtime.game.pf2e.Coins = class { constructor() {} normalized() { return { toString: () => "5 sp" }; } };
  decoratePartyInventory(app, root, runtime);
  assert.match(root.querySelector('[data-pf2e-party-quick-sell="true"]').getAttribute("data-tooltip"), /5 sp/);
});
