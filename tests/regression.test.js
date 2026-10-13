import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createSaleRuntime } from "../scripts/transaction.js";
import { decoratePartyInventory } from "../scripts/ui.js";

function fixture() {
  const game = { user: { id: "gm", isGM: true, isActiveGM: true }, settings: { get: () => 50 }, users: new Map() };
  const actor = { type: "party", uuid: "Actor.test", items: new Map(), flags: {}, inventory: { addCoins() {} }, setFlag() {}, unsetFlag() {}, testUserPermission: () => true };
  const item = { id: "item", parent: actor, type: "equipment", quantity: 3, isIdentified: true, assetValue: { copperValue: 10 }, canUserModify: () => true, delete() {}, toObject: () => ({ _id: "item" }) };
  actor.items.set(item.id, item);
  return { game, actor, item, runtime: createSaleRuntime({ game, Hooks: { on() {} } }) };
}

test("partial stacks fail closed when native valuation is unavailable", async () => {
  const { runtime, actor, item } = fixture();
  await assert.rejects(runtime.sell({ actor, item, quantity: 1 }), e => e.code === "UNSUPPORTED_API");
  assert.equal(actor.items.has(item.id), true);
});

test("invalid saved percentage fails instead of silently selling for default", () => {
  const { game, runtime } = fixture();
  game.settings.get = () => 500;
  assert.throws(() => runtime.percent(), e => e.code === "INVALID_PERCENT");
});

test("nested contained equipment gets a control before native edit and delete", () => {
  const { game, actor, item, runtime } = fixture();
  const dom = new JSDOM('<form><li data-item-id="bag"><div class="data"><div class="item-controls"></div></div><ul><li data-item-id="item"><div class="data"><div class="item-controls"><a data-action="edit-item"></a><a data-action="delete-item"></a></div></div></li></ul></li></form>');
  const root = dom.window.document.querySelector("form");
  const tab = dom.window.document.createElement("div");
  tab.className = "tab inventory";
  tab.dataset.tab = "inventory";
  const stash = dom.window.document.createElement("section");
  stash.className = "inventory";
  while (root.firstChild) stash.append(root.firstChild);
  tab.append(stash);
  root.append(tab);
  decoratePartyInventory({ actor, isEditable: true }, root, runtime);
  const controls = root.querySelector('li[data-item-id="item"] .item-controls');
  assert.equal(controls.firstElementChild.dataset.pf2ePartyQuickSell, "true");
  assert.equal(controls.querySelectorAll('[data-pf2e-party-quick-sell="true"]').length, 1);
  assert.equal(root.querySelector('li[data-item-id="bag"] > .data .item-controls').children.length, 0);
});
