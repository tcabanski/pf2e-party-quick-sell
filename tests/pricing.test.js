import test from "node:test";
import assert from "node:assert/strict";
import { computeProceedsCp } from "../scripts/transaction.js";

// Values below are PF2e-prepared stack assetValue inputs, not copied base prices.
for (const [name, assetCp, proceedsCp] of [
  ["1 gp longsword", 100, 50],
  ["6 gp chain mail", 600, 300],
  ["15 gp equipment", 1500, 750],
  ["1 sp item", 10, 5],
  ["five 1 gp items", 500, 250],
  ["600 gp +1 striking flaming weapon", 60000, 30000],
  ["custom 23 gp 4 sp price", 2340, 1170],
  ["ten arrows at 1 sp per ten", 10, 5],
  ["three consumables with combined 12 gp value", 1200, 600],
  ["ABP-suppressed fundamental runes", 100, 50],
  ["odd copper rounds down", 101, 50],
]) {
  test(`50% proceeds: ${name}`, () => assert.equal(computeProceedsCp(assetCp, 50), BigInt(proceedsCp)));
}

test("invalid percentage range or fraction is rejected", () => {
  for (const percent of [-1, 101, 50.5, NaN, "not-a-number"]) {
    assert.throws(() => computeProceedsCp(100, percent), error => error.code === "INVALID_PERCENT");
  }
});
