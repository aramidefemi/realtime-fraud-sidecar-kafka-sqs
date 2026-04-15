import test from "node:test";
import assert from "node:assert/strict";

import { scorePayment } from "../src/domain/scoring.js";

const payment = (overrides = {}) => ({
  attempt_id: "pay_1",
  user_id: "u_1",
  amount: 100,
  currency: "USD",
  email: "normal@example.com",
  ip: "10.0.0.5",
  ...overrides,
});

const enrichment = (overrides = {}) => ({
  vendor_identity: { checks: { email_blacklist_match: false } },
  vendor_device: { checks: { ip_risk_score: 10 } },
  vendor_email: { checks: { velocity_bucket: "low" } },
  ...overrides,
});

test("high combined signals result in blocked decision", () => {
  const result = scorePayment({
    payment_attempt: payment({ amount: 9000 }),
    enrichment: enrichment({
      vendor_identity: { checks: { email_blacklist_match: true } },
      vendor_device: { checks: { ip_risk_score: 95 } },
      vendor_email: { checks: { velocity_bucket: "high" } },
    }),
  });

  assert.equal(result.decision, "blocked");
  assert.ok(result.risk_score >= 0.85);
});

test("signal-poor payload remains approved (breakpoint probe)", () => {
  const result = scorePayment({
    payment_attempt: payment(),
    enrichment: enrichment({
      vendor_identity: { checks: {} },
      vendor_device: { checks: {} },
      vendor_email: { checks: {} },
    }),
  });

  assert.equal(result.decision, "approved");
  assert.deepEqual(result.reason_codes, []);
});

test("score is always clamped to [0, 1]", () => {
  const result = scorePayment({
    payment_attempt: payment({ amount: 99999 }),
    enrichment: enrichment({
      vendor_identity: { checks: { email_blacklist_match: true } },
      vendor_device: { checks: { ip_risk_score: 99 } },
      vendor_email: { checks: { velocity_bucket: "high" } },
    }),
  });

  assert.ok(result.risk_score >= 0);
  assert.ok(result.risk_score <= 1);
});
