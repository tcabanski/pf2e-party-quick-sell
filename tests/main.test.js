import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "../scripts/main.js";

test("lifecycle resolves the live game rather than the pre-init placeholder", () => {
  const previous = globalThis.game;
  const callbacks = new Map();
  const Hooks = { once: (name, fn) => callbacks.set(name, fn), on() {} };
  try {
    globalThis.game = {};
    const registration = registerHooks({ Hooks });
    const live = { version: "14.369", system: { id: "pf2e", version: "8.6.1" }, settings: { register() {}, get: () => 50 }, socket: { on() {}, emit() {} } };
    globalThis.game = live;
    callbacks.get("init")();
    callbacks.get("ready")();
    assert.equal(registration.runtime.game, live);
    assert.equal(registration.runtime.installed, true);
    assert.equal(registration.runtime.percent(), 50);
  } finally { globalThis.game = previous; }
});
