import test from "node:test";
import assert from "node:assert/strict";

import { runVendorEnrichment } from "../src/domain/vendors.js";

const basePayment = () => ({
  attempt_id: "pay_123",
  user_id: "u_200",
  amount: 120,
  currency: "USD",
  email: "normal@example.com",
  ip: "10.0.0.10",
});

test("timeout profile produces incomplete vendor_email data", async () => {
  const result = await runVendorEnrichment({ ...basePayment(), force_vendor_timeout: true });

  assert.equal(result.vendor_email.status, "timeout");
  assert.deepEqual(result.vendor_email.checks, {});
  assert.equal(result.data_completeness.vendor_email, "timeout");
});

test("mailinator domain is flagged high_risk", async () => {
  const result = await runVendorEnrichment({
    ...basePayment(),
    email: "risk@mailinator.com",
  });
  assert.equal(result.vendor_email.checks.domain_reputation, "high_risk");
});

test("IP tail above 80 is high-risk input for scoring path", async () => {
  const result = await runVendorEnrichment({
    ...basePayment(),
    ip: "10.0.0.99",
  });
  assert.equal(result.vendor_device.checks.ip_risk_score, 99);
});
