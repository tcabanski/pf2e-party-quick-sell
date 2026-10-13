import { createSaleRuntime, hasRequiredRuntimeFeatures, isSupportedEnvironment } from "./transaction.js";
import { decoratePartyInventory } from "./ui.js";

function registerHooks({ Hooks = globalThis.Hooks, game, logger = console } = {}) {
  if (!Hooks?.once) return null;
  let runtime;
  Hooks.once("init", () => {
    const currentGame = game ?? globalThis.game;
    runtime = createSaleRuntime({ game: currentGame, Hooks, logger, decorate: decoratePartyInventory });
    if (isSupportedEnvironment(currentGame) && hasRequiredRuntimeFeatures({ game: currentGame, Hooks })) runtime.registerSetting();
  });
  Hooks.once("ready", () => {
    const currentGame = game ?? globalThis.game;
    if (!runtime) runtime = createSaleRuntime({ game: currentGame, Hooks, logger, decorate: decoratePartyInventory });
    runtime.install();
  });
  return {
    get runtime() {
      return runtime;
    },
  };
}

const registration = globalThis.Hooks?.once ? registerHooks() : null;

function getRuntime() {
  const runtime = registration?.runtime;
  if (!runtime) throw new Error("PF2e Party Quick Sell is not initialized on a supported Foundry/PF2e runtime");
  return runtime;
}

function sell(request) {
  return getRuntime().sell(request);
}

export { getRuntime, registerHooks, registration, sell };
