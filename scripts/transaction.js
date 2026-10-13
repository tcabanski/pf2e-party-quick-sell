const MODULE_ID = "pf2e-party-quick-sell";
const SOCKET_CHANNEL = `module.${MODULE_ID}`;
const JOURNAL_KEY = "saleJournal";
const DEFAULT_RESALE_PERCENT = 50;
const MIN_SYSTEM_VERSION = [8, 6, 1];

// PF2e 8.6.1's PHYSICAL_ITEM_TYPES, minus treasure because native PF2e already
// provides treasure selling and its value semantics are intentionally preserved.
const PHYSICAL_ITEM_TYPES = new Set([
  "ammo",
  "armor",
  "backpack",
  "book",
  "consumable",
  "equipment",
  "shield",
  "weapon",
]);

class SaleError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "SaleError";
    this.code = code;
    Object.assign(this, details);
  }
}

function parseVersion(value) {
  const match = String(value ?? "").match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function isSupportedEnvironment(gameLike = globalThis.game) {
  const systemVersion = parseVersion(gameLike?.system?.version);
  const foundryVersion = String(gameLike?.version ?? "");
  const foundryMajor = Number(foundryVersion.match(/^\d+/)?.[0]);
  return gameLike?.system?.id === "pf2e" && foundryMajor === 14 && systemVersion !== null && compareVersions(systemVersion, MIN_SYSTEM_VERSION) >= 0;
}

function hasRequiredRuntimeFeatures({ game = globalThis.game, Hooks = globalThis.Hooks } = {}) {
  return Boolean(game?.settings?.register && game?.socket?.on && game?.socket?.emit && Hooks?.on);
}

function normalizePercent(percent) {
  const value = Number(percent);
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new SaleError("INVALID_PERCENT", "Resale percentage must be an integer from 0 to 100");
  }
  return value;
}

function toBigIntInteger(value, field = "value") {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  throw new SaleError("INVALID_VALUE", `${field} must be a non-negative integer`);
}

function copperValueOf(coins, field = "assetValue") {
  const value = coins?.copperValue ?? coins?.cp ?? coins;
  const result = toBigIntInteger(value, field);
  if (result < 0n) throw new SaleError("INVALID_VALUE", `${field} must not be negative`);
  return result;
}

function computeProceedsCp(assetValueCp, percent) {
  const value = copperValueOf(assetValueCp, "assetValue");
  const resalePercent = normalizePercent(percent);
  return (value * BigInt(resalePercent)) / 100n;
}

function stableSerialize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

function itemSource(item) {
  if (typeof item?.toObject === "function") return item.toObject();
  return { id: item?.id, uuid: item?.uuid, type: item?.type, quantity: item?.quantity, assetValue: String(item?.assetValue?.copperValue ?? "") };
}

function itemFingerprint(item, requestedQuantity = item?.quantity) {
  let assetValueCp = "";
  try {
    assetValueCp = copperValueOf(item?.assetValue, "assetValue").toString();
  } catch {
    // canSellItem reports malformed values; fingerprints remain serializable.
  }
  const quantity = Number.isSafeInteger(requestedQuantity) ? requestedQuantity : null;
  const stackQuantity = Number.isSafeInteger(item?.quantity) ? item.quantity : null;
  return stableSerialize({
    source: itemSource(item),
    assetValueCp,
    stackQuantity,
    requestedQuantity: quantity,
    requestedQuantityPercent: stackQuantity && quantity !== null ? `${quantity}/${stackQuantity}` : null,
  });
}

function collectionGet(collection, id) {
  if (!collection) return undefined;
  if (typeof collection.get === "function") return collection.get(id);
  return collection[id];
}

function collectionValues(collection) {
  if (!collection) return [];
  if (typeof collection.values === "function") return [...collection.values()];
  if (Array.isArray(collection)) return collection;
  return Object.values(collection);
}

function contentsCount(item) {
  const contents = item?.contents;
  if (!contents) return 0;
  if (typeof contents.size === "number") return contents.size;
  if (Array.isArray(contents)) return contents.length;
  return collectionValues(contents).length;
}

function isCurrency(item) {
  return Boolean(item?.isCurrency || item?.isCoinage || item?.type === "treasure" || item?.system?.category === "coin" || item?.system?.category === "credstick" || item?.system?.slug === "upb");
}

function isDirectActorItem(actor, item) {
  if (!actor || !item || item.parentItem) return false;
  const stored = collectionGet(actor.items, item.id);
  return stored === item && (!item.parent || item.parent === actor);
}

function actorOwns(actor, user) {
  if (user?.isGM) return true;
  return Boolean(actor?.testUserPermission?.(user, "OWNER"));
}

function canModifyDelete(item, user) {
  return Boolean(item?.canUserModify?.(user, "delete"));
}

function canSellItem({ actor, item, user }) {
  if (actor?.type !== "party") return { ok: false, reason: "not-party" };
  if (!PHYSICAL_ITEM_TYPES.has(item?.type)) return { ok: false, reason: "unsupported-type" };
  if (isCurrency(item)) return { ok: false, reason: "currency" };
  if (item?.isTemporary === true || item?.system?.temporary === true) return { ok: false, reason: "temporary" };
  if (!isDirectActorItem(actor, item)) return { ok: false, reason: "not-root-item" };
  if (item.type === "backpack" && contentsCount(item) > 0) return { ok: false, reason: "nonempty-container" };
  if (!Number.isSafeInteger(item?.quantity) || item.quantity <= 0) return { ok: false, reason: "invalid-quantity" };
  if (!actorOwns(actor, user)) return { ok: false, reason: "not-owner" };
  if (!canModifyDelete(item, user)) return { ok: false, reason: "cannot-delete" };
  if (!user?.isGM && item.isIdentified !== true) return { ok: false, reason: "unidentified" };
  let assetValueCp;
  try {
    assetValueCp = copperValueOf(item.assetValue, "assetValue");
  } catch (error) {
    return { ok: false, reason: "invalid-asset-value", error };
  }
  return { ok: true, assetValueCp };
}

function partialAssetValueCp(game, item, requestedQuantity, totalAssetCp) {
  const Coins = game?.pf2e?.Coins;
  if (item?.price !== undefined && typeof Coins?.fromPrice === "function") {
    try {
      return copperValueOf(Coins.fromPrice(item.price, requestedQuantity), "partial assetValue");
    } catch {
      // Some PF2e versions expose assetValue but not a compatible Price object.
    }
  }
  throw new SaleError("UNSUPPORTED_API", "PF2e's native partial-stack valuation API is unavailable; no item was sold");
}

function getFlag(actor) {
  return actor?.getFlag?.(MODULE_ID, JOURNAL_KEY) ?? actor?.flags?.[MODULE_ID]?.[JOURNAL_KEY];
}

async function setFlag(actor, value) {
  if (typeof actor?.setFlag === "function") return actor.setFlag(MODULE_ID, JOURNAL_KEY, value);
  actor.flags ??= {};
  actor.flags[MODULE_ID] ??= {};
  actor.flags[MODULE_ID][JOURNAL_KEY] = value;
  return value;
}

async function clearFlag(actor) {
  if (typeof actor?.unsetFlag === "function") return actor.unsetFlag(MODULE_ID, JOURNAL_KEY);
  return setFlag(actor, undefined);
}

async function persistJournal(actor, journal, failureCode = "JOURNAL_FAILED") {
  try {
    await setFlag(actor, journal);
    const stored = getFlag(actor);
    if (!stored || stored.transactionId !== journal.transactionId || stored.stage !== journal.stage) {
      throw new Error("Journal flag was not persisted");
    }
  } catch (error) {
    throw new SaleError(failureCode, "Sale journal could not be persisted", { cause: error, journal });
  }
}

function getUser(users, id) {
  if (typeof users?.get === "function") return users.get(id);
  return collectionValues(users).find((user) => user.id === id);
}

function currentSettingPercent(game) {
  const value = game?.settings?.get?.(MODULE_ID, "resalePercent");
  return value === undefined ? DEFAULT_RESALE_PERCENT : normalizePercent(value);
}

function taggedSaleId(item) {
  return item?.getFlag?.(MODULE_ID, "saleId") ?? item?.flags?.[MODULE_ID]?.saleId;
}

function isCopperCoin(item) {
  const unit = item?.unit ?? item?.system?.slug;
  return unit === "cp" || item?.system?.price?.value?.cp !== undefined;
}

function tagCoin(item, saleId) {
  const path = `flags.${MODULE_ID}.saleId`;
  if (typeof item?.updateSource === "function") item.updateSource({ [path]: saleId });
  else {
    item.flags ??= {};
    item.flags[MODULE_ID] ??= {};
    item.flags[MODULE_ID].saleId = saleId;
  }
}

function coinValue(item) {
  try {
    return isCurrency(item) ? copperValueOf(item.assetValue, "coin assetValue") : 0n;
  } catch {
    return 0n;
  }
}

function makeRequestId(idFactory) {
  return idFactory?.() ?? `sale-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createSaleRuntime(options = {}) {
  const game = options.game ?? globalThis.game;
  const Hooks = options.Hooks ?? globalThis.Hooks;
  const resolveActor = options.resolveActor ?? (async (uuid) => globalThis.fromUuid?.(uuid));
  const logger = options.logger ?? console;
  const idFactory = options.idFactory;
  const requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
  const queues = new Map();
  const currencyContexts = new Map();
  const pendingRequests = new Map();
  const receivedRequestIds = new Set();
  const completedSaleIds = new Set();
  let saleSequence = 0;
  const installedHooks = new Set();
  let installed = false;
  let settingRegistered = false;

  if (Hooks?.on) {
    const coinTagger = (item) => {
      for (const context of currencyContexts.values()) {
        if (context.actor === item?.parent && context.active && item?.type === "treasure" && isCurrency(item) && isCopperCoin(item)) {
          tagCoin(item, context.saleId);
          break;
        }
      }
    };
    Hooks.on("preCreateItem", coinTagger);
    installedHooks.add(coinTagger);
  }

  function fingerprint(item, requestedQuantity = item?.quantity) {
    return itemFingerprint(item, requestedQuantity);
  }

  function notify(level, message) {
    const notifications = game?.ui?.notifications ?? globalThis.ui?.notifications;
    notifications?.[level]?.(message);
  }

  function requireActiveGM(code = "NO_ACTIVE_GM") {
    if (!game?.user?.isActiveGM) throw new SaleError(code, code === "NO_ACTIVE_GM" ? "An active GM is required to process sales" : "Active GM authority changed; GM reconciliation is required");
  }

  function hasActiveGM() {
    return Boolean(game?.user?.isActiveGM) || collectionValues(game?.users).some((user) => user?.isActiveGM === true);
  }

  function allocateSaleId(actor) {
    for (let attempts = 0; attempts < 100; attempts += 1) {
      saleSequence += 1;
      const saleId = `sale-${makeRequestId(idFactory)}-${saleSequence}`;
      if (!completedSaleIds.has(saleId) && !collectionValues(actor.items).some((candidate) => taggedSaleId(candidate) === saleId)) return saleId;
    }
    throw new SaleError("SALE_ID_COLLISION", "A unique sale transaction id could not be allocated");
  }

  function emitResult(requestId, result) {
    if (!requestId) return;
    game?.socket?.emit?.(SOCKET_CHANNEL, { type: "sell-result", requestId, ...result });
  }

  function deletionResultMatches(result, expectedId) {
    if (result === undefined || result === null) return false;
    if (Array.isArray(result)) return result.length === 1 && result[0]?.id === expectedId;
    return result?.id === expectedId;
  }

  function currentJournalIs(actor, transactionId, stage = "prepared") {
    const current = getFlag(actor);
    return current?.transactionId === transactionId && current?.stage === stage;
  }

  function enqueue(actor, operation) {
    const key = actor?.uuid ?? actor?.id;
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    const cleanup = () => { if (queues.get(key) === next) queues.delete(key); };
    queues.set(key, next);
    next.then(cleanup, cleanup);
    return next;
  }

  async function executeSale({ actor, item, user, quantity, expectedFingerprint, expectedPercent }) {
    requireActiveGM();
    const existingJournal = getFlag(actor);
    if (existingJournal) throw new SaleError("JOURNAL_BLOCKED", "An unresolved sale requires GM reconciliation", { journal: existingJournal });
    const requestedQuantity = quantity ?? item?.quantity;
    if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity <= 0) {
      throw new SaleError("INVALID_QUANTITY", "Requested quantity is not a valid part of the current stack");
    }
    const capturedFingerprint = itemFingerprint(item, requestedQuantity);
    if (expectedFingerprint && capturedFingerprint !== expectedFingerprint) return { status: "stale", reason: "fingerprint" };
    if (requestedQuantity > item?.quantity) {
      throw new SaleError("INVALID_QUANTITY", "Requested quantity is not a valid part of the current stack");
    }
    const permission = canSellItem({ actor, item, user });
    if (!permission.ok) throw new SaleError("NOT_ELIGIBLE", `Item cannot be sold: ${permission.reason}`, permission);
    const resalePercent = currentSettingPercent(game);
    if (expectedPercent !== undefined && resalePercent !== expectedPercent) return { status: "stale", reason: "percentage" };
    if (typeof actor.setFlag !== "function" || typeof actor.unsetFlag !== "function" || typeof actor.inventory?.addCoins !== "function" || typeof item.delete !== "function") {
      throw new SaleError("UNSUPPORTED_API", "Required PF2e document/currency APIs are unavailable; no item was sold");
    }
    const fullStack = requestedQuantity === item.quantity;
    const expectedRemaining = item.quantity - requestedQuantity;
    if (!fullStack && (item.subitems?.length || contentsCount({ contents: item.subitems }) > 0)) {
      throw new SaleError("PARTIAL_SUBITEMS", "Attached subitems cannot be split from a partial sale");
    }
    const totalAssetCp = permission.assetValueCp;
    const assetCp = fullStack ? totalAssetCp : partialAssetValueCp(game, item, requestedQuantity, totalAssetCp);
    const proceedsCp = computeProceedsCp(assetCp, resalePercent);
    if (proceedsCp === 0n) return { status: "no-sale", reason: "zero-proceeds", proceedsCp: "0" };
    if (proceedsCp > BigInt(Number.MAX_SAFE_INTEGER)) throw new SaleError("VALUE_TOO_LARGE", "Proceeds exceed Foundry's safe integer currency range");

    const saleId = allocateSaleId(actor);
    const journal = {
      transactionId: saleId,
      stage: "prepared",
      actorUuid: actor.uuid,
      itemId: item.id,
      quantity: requestedQuantity,
      proceedsCp: proceedsCp.toString(),
      percent: resalePercent,
      assetCp: assetCp.toString(),
      assetValueCp: assetCp.toString(),
      requesterId: user?.id,
      source: itemSource(item),
      originalSource: itemSource(item),
      fingerprint: capturedFingerprint,
      createdAt: new Date().toISOString(),
    };
    await persistJournal(actor, journal);

    // Flag persistence yields to Foundry hooks and socket work. Re-read the
    // document and derived values before making the irreversible mutation.
    const freshItem = collectionGet(actor.items, item.id);
    if (freshItem !== item || !currentJournalIs(actor, saleId)) {
      throw new SaleError("RECONCILIATION_REQUIRED", "The item or sale journal changed before deletion", { journal });
    }
    const freshPermission = canSellItem({ actor, item: freshItem, user });
    if (!freshPermission.ok || itemFingerprint(freshItem, requestedQuantity) !== capturedFingerprint || currentSettingPercent(game) !== resalePercent) {
      throw new SaleError("RECONCILIATION_REQUIRED", "The sale changed before deletion", { journal });
    }
    if (!currentJournalIs(actor, saleId)) throw new SaleError("RECONCILIATION_REQUIRED", "Sale journal changed before deletion", { journal });

    let deletionResult;
    try {
      requireActiveGM("RECONCILIATION_REQUIRED");
      if (fullStack) deletionResult = await item.delete();
      else deletionResult = await item.update({ "system.quantity": item.quantity - requestedQuantity });
    } catch (error) {
      throw new SaleError("RECONCILIATION_REQUIRED", "Sale deletion failed; GM reconciliation is required", { cause: error, journal });
    }
    if (!deletionResultMatches(deletionResult, item.id)) throw new SaleError("RECONCILIATION_REQUIRED", "Deletion result did not identify the expected item", { journal });

    const remaining = collectionGet(actor.items, item.id);
    if (fullStack && remaining) throw new SaleError("RECONCILIATION_REQUIRED", "Item deletion was not confirmed", { journal });
    if (!fullStack && (!remaining || remaining.quantity !== expectedRemaining)) {
      throw new SaleError("RECONCILIATION_REQUIRED", "Partial item update was not confirmed", { journal });
    }

    requireActiveGM("RECONCILIATION_REQUIRED");
    journal.stage = "crediting";
    await persistJournal(actor, journal, "RECONCILIATION_REQUIRED");
    if (!currentJournalIs(actor, saleId, "crediting")) throw new SaleError("RECONCILIATION_REQUIRED", "Sale journal changed before credit", { journal });
    requireActiveGM("RECONCILIATION_REQUIRED");
    if (collectionValues(actor.items).some((candidate) => taggedSaleId(candidate) === saleId)) {
      throw new SaleError("RECONCILIATION_REQUIRED", "Currency for this sale already exists; GM reconciliation is required", { journal });
    }
    const context = { actor, saleId, active: true };
    currencyContexts.set(actor.uuid ?? actor.id, context);
    try {
      await actor.inventory.addCoins({ cp: Number(proceedsCp) }, { combineStacks: false });
    } catch (error) {
      throw new SaleError("RECONCILIATION_REQUIRED", "Currency credit is ambiguous; GM reconciliation is required", { cause: error, journal });
    } finally {
      context.active = false;
      currencyContexts.delete(actor.uuid ?? actor.id);
    }

    requireActiveGM("RECONCILIATION_REQUIRED");
    const tagged = collectionValues(actor.items).filter((candidate) => taggedSaleId(candidate) === saleId);
    const taggedValue = tagged.reduce((sum, candidate) => sum + coinValue(candidate), 0n);
    if (taggedValue !== proceedsCp) {
      throw new SaleError("RECONCILIATION_REQUIRED", "Currency credit could not be verified; GM reconciliation is required", { journal, taggedValue: taggedValue.toString() });
    }
    await clearFlag(actor);
    if (getFlag(actor)) throw new SaleError("RECONCILIATION_REQUIRED", "Sale completed but its journal could not be cleared", { journal });
    completedSaleIds.add(saleId);
    return { status: "sold", saleId, quantity: requestedQuantity, proceedsCp: proceedsCp.toString() };
  }

  async function requestSale(request) {
    const actor = request?.actor;
    const item = request?.item;
    const user = game?.user;
    const quantity = request?.quantity ?? item?.quantity;
    if (!hasActiveGM()) throw new SaleError("NO_ACTIVE_GM", "No active GM is available to process this sale");
    const permission = canSellItem({ actor, item, user });
    if (!permission.ok) throw new SaleError("NOT_ELIGIBLE", `Item cannot be sold: ${permission.reason}`, permission);
    if (user?.isActiveGM) return sell({ actor, item, quantity });
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > item.quantity) {
      throw new SaleError("INVALID_QUANTITY", "Requested quantity is not a valid part of the current stack");
    }
    const requestId = makeRequestId(idFactory);
    if (pendingRequests.has(requestId)) throw new SaleError("DUPLICATE_REQUEST", "A sale request with this id is already pending");
    const expectedFingerprint = itemFingerprint(item, quantity);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (pendingRequests.get(requestId)?.timeout !== timeout) return;
        pendingRequests.delete(requestId);
        logger.warn?.("Quick sell request timed out; no sale was replayed", { requestId });
        reject(new SaleError("REQUEST_TIMEOUT", "The sale request timed out. Verify the party inventory before trying again."));
      }, requestTimeoutMs);
      pendingRequests.set(requestId, { resolve, reject, timeout });
      try {
        game?.socket?.emit?.(SOCKET_CHANNEL, {
          type: "sell-request",
          requestId,
          actorUuid: actor.uuid,
          itemId: item.id,
          quantity,
          percent: currentSettingPercent(game),
          fingerprint: expectedFingerprint,
        });
      } catch (error) {
        clearTimeout(timeout);
        pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  async function sell(request) {
    const actor = request?.actor;
    const item = request?.item;
    const quantity = request?.quantity ?? item?.quantity;
    const capturedFingerprint = item ? itemFingerprint(item, quantity) : undefined;
    const expectedPercent = currentSettingPercent(game);
    return enqueue(actor, () => executeSale({ actor, item, user: game?.user, quantity, expectedFingerprint: capturedFingerprint, expectedPercent }));
  }

  async function reconcileJournal(actor) {
    requireActiveGM();
    const journal = getFlag(actor);
    if (!journal) return { status: "clear" };
    if (journal.stage !== "prepared") throw new SaleError("JOURNAL_BLOCKED", "Only an untouched prepared sale can be cleared automatically", { journal });
    const item = collectionGet(actor.items, journal.itemId);
    if (!item || fingerprint(item, journal.quantity) !== journal.fingerprint) throw new SaleError("JOURNAL_BLOCKED", "Prepared sale no longer matches its original item", { journal });
    await clearFlag(actor);
    if (getFlag(actor)) throw new SaleError("JOURNAL_BLOCKED", "Prepared journal could not be cleared", { journal });
    return { status: "cleared" };
  }

  function validSocketRequest(message) {
    return Boolean(
      message && message.type === "sell-request" &&
      typeof message.requestId === "string" && message.requestId.length > 0 && message.requestId.length <= 200 &&
      typeof message.actorUuid === "string" && message.actorUuid.length > 0 &&
      typeof message.itemId === "string" && message.itemId.length > 0 &&
      Number.isSafeInteger(message.quantity) && message.quantity > 0 &&
      Number.isInteger(message.percent) && message.percent >= 0 && message.percent <= 100 &&
      typeof message.fingerprint === "string" && message.fingerprint.length > 0
    );
  }

  async function handleSocket(message, senderId) {
    if (message?.type === "sell-result") {
      const sender = getUser(game.users, senderId);
      if (!sender?.isActiveGM) return;
      const pending = pendingRequests.get(message.requestId);
      if (pending) {
        pendingRequests.delete(message.requestId);
        clearTimeout(pending.timeout);
        if (message.status === "error") pending.reject(new SaleError(message.code ?? "SALE_FAILED", message.message ?? "Sale failed"));
        else pending.resolve(message);
      }
      return;
    }
    if (!game?.user?.isActiveGM || !validSocketRequest(message)) {
      if (game?.user?.isActiveGM && typeof message?.requestId === "string") emitResult(message.requestId, { status: "error", code: "INVALID_REQUEST", message: "The sale request was malformed" });
      return;
    }
    const sender = getUser(game.users, senderId);
    if (!sender || sender.id !== senderId) {
      emitResult(message.requestId, { status: "error", code: "UNAUTHENTICATED", message: "The sale requester could not be authenticated" });
      return;
    }
    if (receivedRequestIds.has(message.requestId)) {
      emitResult(message.requestId, { status: "error", code: "DUPLICATE_REQUEST", message: "This sale request was already processed" });
      return;
    }
    receivedRequestIds.add(message.requestId);
    let result;
    try {
      const actor = await resolveActor(message.actorUuid);
      const item = collectionGet(actor?.items, message.itemId);
      if (!actor || !item) throw new SaleError("NOT_FOUND", "The requested party item no longer exists");
      if (currentSettingPercent(game) !== message.percent) throw new SaleError("STALE_REQUEST", "The world resale percentage changed; try again");
      if (itemFingerprint(item, message.quantity) !== message.fingerprint) return emitResult(message.requestId, { status: "stale", reason: "fingerprint" });
      result = await enqueue(actor, () => executeSale({ actor, item, user: sender, quantity: message.quantity, expectedFingerprint: message.fingerprint, expectedPercent: message.percent }));
    } catch (error) {
      result = { status: "error", code: error.code ?? "SALE_FAILED", message: error.message };
    }
    emitResult(message.requestId, result);
  }

  function registerSetting() {
    if (settingRegistered) return;
    settingRegistered = true;
    game?.settings?.register?.(MODULE_ID, "resalePercent", {
      name: "Equipment resale percentage",
      hint: "Percentage of an item's PF2e asset value returned when sold.",
      scope: "world",
      config: true,
      type: Number,
      default: DEFAULT_RESALE_PERCENT,
      range: { min: 0, max: 100, step: 1 },
      onChange: (value) => {
        try {
          normalizePercent(value);
        } catch (error) {
          notify("error", error.message);
        }
      },
    });
  }

  function install() {
    if (installed) return false;
    if (!isSupportedEnvironment(game)) {
      notify("warn", "PF2e Party Quick Sell requires Foundry VTT 14 and PF2e 8.6.1 or newer.");
      return false;
    }
    if (!hasRequiredRuntimeFeatures({ game, Hooks })) {
      notify("warn", "PF2e Party Quick Sell could not install because required Foundry APIs are unavailable.");
      return false;
    }
    installed = true;
    registerSetting();
    game.socket?.on?.(SOCKET_CHANNEL, handleSocket);
    Hooks?.on?.("renderPartySheetPF2e", (app, html) => options.decorate?.(app, html, api));
    return true;
  }

  const api = {
    game,
    logger,
    sell,
    requestSale,
    handleSocket,
    reconcileJournal,
    fingerprint,
    percent: () => currentSettingPercent(game),
    install,
    registerSetting,
    get installed() { return installed; },
    socketChannel: SOCKET_CHANNEL,
    canSellItem,
  };
  return api;
}

export {
  DEFAULT_RESALE_PERCENT,
  JOURNAL_KEY,
  MODULE_ID,
  PHYSICAL_ITEM_TYPES,
  SOCKET_CHANNEL,
  SaleError,
  canSellItem,
  computeProceedsCp,
  createSaleRuntime,
  hasRequiredRuntimeFeatures,
  isSupportedEnvironment,
  stableSerialize,
};
