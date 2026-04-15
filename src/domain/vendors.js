const blacklistEmails = new Set(["fraudster@example.com", "blocked@example.com"]);

const ipRiskScore = (ip) => {
  const tail = Number.parseInt(String(ip).split(".").at(-1) ?? "0", 10);
  if (Number.isNaN(tail)) return 50;
  return Math.max(1, Math.min(99, tail));
};

const velocityRisk = (amount) => (amount > 5000 ? "high" : amount > 1000 ? "medium" : "low");

const normalizeVendorIdentity = (paymentAttempt) => ({
  source: "vendor_identity",
  status: "ok",
  checks: {
    email_blacklist_match: blacklistEmails.has(paymentAttempt.email),
    user_known: !String(paymentAttempt.user_id).startsWith("new_"),
  },
});

const normalizeVendorDevice = (paymentAttempt) => ({
  source: "vendor_device",
  status: "ok",
  checks: {
    ip_risk_score: ipRiskScore(paymentAttempt.ip),
    device_mismatch: Boolean(paymentAttempt.device_mismatch),
  },
});

const normalizeVendorEmail = (paymentAttempt) => ({
  source: "vendor_email",
  status: "ok",
  checks: {
    domain_reputation: paymentAttempt.email.endsWith("@mailinator.com") ? "high_risk" : "normal",
    velocity_bucket: velocityRisk(paymentAttempt.amount),
  },
});

export const runVendorEnrichment = async (paymentAttempt) => {
  if (paymentAttempt.force_vendor_timeout === true) {
    return {
      vendor_identity: normalizeVendorIdentity(paymentAttempt),
      vendor_device: normalizeVendorDevice(paymentAttempt),
      vendor_email: { source: "vendor_email", status: "timeout", checks: {} },
      evidence: [],
      data_completeness: {
        vendor_identity: "ok",
        vendor_device: "ok",
        vendor_email: "timeout",
      },
    };
  }

  const vendorIdentity = normalizeVendorIdentity(paymentAttempt);
  const vendorDevice = normalizeVendorDevice(paymentAttempt);
  const vendorEmail = normalizeVendorEmail(paymentAttempt);

  return {
    vendor_identity: vendorIdentity,
    vendor_device: vendorDevice,
    vendor_email: vendorEmail,
    evidence: [
      { source: "vendor_identity", key: "email_blacklist_match", value: vendorIdentity.checks.email_blacklist_match },
      { source: "vendor_device", key: "ip_risk_score", value: vendorDevice.checks.ip_risk_score },
    ],
    data_completeness: {
      vendor_identity: "ok",
      vendor_device: "ok",
      vendor_email: "ok",
    },
  };
};
