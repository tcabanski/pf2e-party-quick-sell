import { canSellItem, computeProceedsCp, PHYSICAL_ITEM_TYPES } from "./transaction.js";

const stateByRoot = new WeakMap();

function rootElement(html) {
  return html?.[0] ?? html;
}

function actorItem(actor, id) {
  if (typeof actor?.items?.get === "function") return actor.items.get(id);
  return actor?.items?.[id];
}

function isEditable(app) {
  return Boolean(app?.isEditable ?? app?.options?.editable);
}

function stashRoot(root) {
  return root.querySelector?.("[data-section=party-stash], .party-stash, .party-inventory") ?? root;
}

function isMemberRow(row) {
  return Boolean(row.closest?.(".party-members, .member-inventory, [data-member-id], [data-member-uuid]"));
}

function directItemRows(root) {
  return [...stashRoot(root).querySelectorAll?.("li[data-item-id]") ?? []]
    .filter((row) => !isMemberRow(row));
}

function directControls(row) {
  return row.querySelector?.(":scope > .data > .item-controls") ?? row.querySelector?.(":scope > .item-controls");
}

function isSellableRowItem(item, actor, runtime) {
  if (!item || actor?.type !== "party" || !PHYSICAL_ITEM_TYPES.has(item.type)) return false;
  const user = runtime.game?.user ?? globalThis.game?.user;
  return Boolean((runtime.canSellItem ?? canSellItem)({ actor, item, user }).ok);
}

function formatCopper(cp, runtime) {
  const Coins = runtime.game?.pf2e?.Coins ?? globalThis.game?.pf2e?.Coins;
  if (typeof Coins === "function") {
    try {
      const coins = new Coins({ cp: Number(cp) });
      return coins.normalized?.().toString?.() ?? coins.toString();
    } catch {
      // Fall through for test doubles and unsupported PF2e APIs.
    }
  }
  return `${cp} cp`;
}

function proceedsTooltip(item, percent, runtime) {
  let proceeds;
  try {
    proceeds = formatCopper(computeProceedsCp(item.assetValue, percent), runtime);
  } catch {
    return null;
  }
  return `Sell whole stack for ${proceeds} (${percent}%)`;
}

function makeControl(document, item, percent, runtime) {
  const tooltip = proceedsTooltip(item, percent, runtime);
  if (!tooltip) return null;
  const control = document.createElement("a");
  control.className = "pf2e-party-quick-sell";
  control.dataset.action = "pf2e-party-quick-sell";
  control.dataset.pf2ePartyQuickSell = "true";
  control.dataset.itemId = item.id;
  control.dataset.quantity = String(item.quantity);
  control.setAttribute("role", "button");
  control.setAttribute("tabindex", "0");
  control.setAttribute("aria-label", "Sell item");
  control.setAttribute("data-tooltip", tooltip);
  control.title = tooltip;
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-coins fa-fw";
  icon.setAttribute("aria-hidden", "true");
  control.append(icon);
  return control;
}

function removeControls(root) {
  for (const control of root.querySelectorAll?.('[data-pf2e-party-quick-sell="true"]') ?? []) control.remove();
}

function notify(runtime, level, message) {
  const notifications = runtime.game?.ui?.notifications ?? globalThis.ui?.notifications;
  notifications?.[level]?.(message);
  runtime.logger?.[level === "warn" ? "warn" : "error"]?.(message);
}

async function confirmSale(runtime, item, tooltip) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2 ?? globalThis.DialogV2;
  if (typeof DialogV2?.confirm !== "function") return true;
  const paragraph = globalThis.document?.createElement("p");
  if (paragraph) paragraph.textContent = tooltip;
  const result = await DialogV2.confirm({
    window: { title: "PF2E.SellItemConfirmHeader" },
    content: paragraph?.outerHTML ?? "Sell this item stack?",
    yes: { default: true },
    no: { default: false },
    rejectClose: false,
  });
  return result === true;
}

function insertControl(controls, control) {
  const before = controls.querySelector?.(":scope > [data-action=edit-item], :scope > [data-action=delete-item], :scope > .item-edit, :scope > .item-delete");
  if (before) controls.insertBefore(control, before);
  else controls.append(control);
}

function attachListener(root, app, runtime) {
  if (stateByRoot.has(root)) return;
  const state = { pending: new Set() };
  const activate = async (event) => {
    const target = event.target?.closest?.('[data-pf2e-party-quick-sell="true"]');
    if (!target || !root.contains(target)) return;
    if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    const item = actorItem(app.actor, target.dataset.itemId);
    if (!item || state.pending.has(item.id)) return;
    state.pending.add(item.id);
    target.setAttribute("aria-busy", "true");
    target.classList.add("disabled");
    try {
      const tooltip = target.getAttribute("data-tooltip") ?? "Sell item";
      if (!event.ctrlKey && !(await confirmSale(runtime, item, tooltip))) return;
      const request = { actor: app.actor, item, quantity: Number(target.dataset.quantity) };
      const result = runtime.requestSale ? await runtime.requestSale(request) : await runtime.sell(request);
      if (result?.status === "sold") app.render?.(false);
      else if (result?.status === "stale") notify(runtime, "warn", "The item changed before it could be sold. Refresh the party inventory and try again.");
      else if (result?.status === "no-sale") notify(runtime, "warn", "This item has no resale value at the current percentage.");
    } catch (error) {
      notify(runtime, "error", error?.message ?? "The item could not be sold.");
    } finally {
      state.pending.delete(item.id);
      target.removeAttribute("aria-busy");
      target.classList.remove("disabled");
    }
  };
  root.addEventListener("click", activate);
  root.addEventListener("keydown", activate);
  stateByRoot.set(root, { ...state, listener: activate });
}

function decoratePartyInventory(app, html, runtime) {
  const root = rootElement(html);
  if (!root?.querySelectorAll || app?.actor?.type !== "party") {
    if (root?.querySelectorAll) removeControls(root);
    return;
  }
  if (!isEditable(app)) {
    removeControls(root);
    return;
  }
  attachListener(root, app, runtime);
  removeControls(root);
  const percent = runtime.percent();
  for (const row of directItemRows(root)) {
    const item = actorItem(app.actor, row.dataset.itemId);
    if (!isSellableRowItem(item, app.actor, runtime)) continue;
    const controls = directControls(row);
    if (!controls) continue;
    const control = makeControl(root.ownerDocument, item, percent, runtime);
    if (control) insertControl(controls, control);
  }
}

export { decoratePartyInventory };
