import test from "node:test";
import assert from "node:assert/strict";

test("idempotency keys are scope-isolated by prefix contract", () => {
  const attemptId = "pay_same_1";
  const bridgeKey = `bridge:${attemptId}`;
  const intakeKey = `intake:${attemptId}`;

  assert.notEqual(bridgeKey, intakeKey);
  assert.ok(bridgeKey.startsWith("bridge:"));
  assert.ok(intakeKey.startsWith("intake:"));
});
