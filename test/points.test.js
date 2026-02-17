import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateBasePoints,
  calculateEarnedPoints,
  convertPointsToRewards,
  currencyExponent,
  earnIdempotencyKey,
  redeemIdempotencyKey,
  monthlyGrantIdempotencyKey,
} from "../src/lib/points.js";

test("currency exponent supports zero-decimal currencies", () => {
  assert.equal(currencyExponent("GBP"), 2);
  assert.equal(currencyExponent("JPY"), 0);
});

test("base points round down by major currency unit", () => {
  assert.equal(calculateBasePoints(999, "GBP"), 9);
  assert.equal(calculateBasePoints(1001, "GBP"), 10);
  assert.equal(calculateBasePoints(1500, "JPY"), 1500);
});

test("membership multiplier doubles earn points", () => {
  assert.equal(calculateEarnedPoints(1234, "GBP", 1), 12);
  assert.equal(calculateEarnedPoints(1234, "GBP", 2), 24);
});

test("conversion converts every 100 points to one reward", () => {
  assert.deepEqual(convertPointsToRewards(99), { rewardsConverted: 0, remainingPoints: 99 });
  assert.deepEqual(convertPointsToRewards(100), { rewardsConverted: 1, remainingPoints: 0 });
  assert.deepEqual(convertPointsToRewards(235), { rewardsConverted: 2, remainingPoints: 35 });
});

test("idempotency keys are deterministic", () => {
  assert.equal(earnIdempotencyKey("o1", "p1"), "earn:o1:p1");
  assert.equal(redeemIdempotencyKey("o1", "p2"), "redeem:o1:p2");
  assert.equal(monthlyGrantIdempotencyKey("sub_1", "2026-02-01T00:00:00.000Z"), "grant:sub_1:2026-02-01");
});
