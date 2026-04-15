import test from "node:test";
import assert from "node:assert/strict";

import {
  validateDecisionEvent,
  validateEnrichmentJob,
  validatePaymentAttempt,
  validateScoringJob,
} from "../src/contracts/messages.js";

const validPayment = () => ({
  attempt_id: "pay_123",
  user_id: "u_456",
  amount: 120.55,
  currency: "USD",
  email: "buyer@example.com",
  ip: "10.0.0.10",
});

test("validatePaymentAttempt accepts a valid payload", () => {
  const payload = validPayment();
  assert.equal(validatePaymentAttempt(payload), payload);
});

test("validatePaymentAttempt rejects missing attempt_id", () => {
  const payload = { ...validPayment(), attempt_id: "" };
  assert.throws(() => validatePaymentAttempt(payload), /attempt_id is required/);
});

test("validateEnrichmentJob rejects missing payment_attempt", () => {
  assert.throws(() => validateEnrichmentJob({}), /payment_attempt must be an object/);
});

test("validateScoringJob rejects missing enrichment", () => {
  assert.throws(
    () => validateScoringJob({ payment_attempt: validPayment() }),
    /scoring_job\.enrichment is required/
  );
});

test("validateDecisionEvent rejects non-array reason_codes", () => {
  assert.throws(
    () =>
      validateDecisionEvent({
        attempt_id: "pay_1",
        decision: "approved",
        reason_codes: "BAD_TYPE",
      }),
    /reason_codes must be an array/
  );
});

test("breakpoint: NaN amount currently passes validation", () => {
  const payload = { ...validPayment(), amount: Number.NaN };
  assert.equal(validatePaymentAttempt(payload), payload);
});
