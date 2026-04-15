const toReasonSummary = (reasonCodes) => {
  if (reasonCodes.length === 0) return "No significant risk signals detected.";
  return reasonCodes.join(", ");
};

export const scorePayment = ({ payment_attempt, paymentAttempt, enrichment }) => {
  const payment = payment_attempt ?? paymentAttempt;
  const reasons = [];
  const ruleHits = [];
  let score = 0.15;

  if (enrichment.vendor_identity?.checks?.email_blacklist_match) {
    score += 0.55;
    reasons.push("BLACKLIST_EMAIL_MATCH");
    ruleHits.push("R12_BLACKLIST");
  }
  if ((enrichment.vendor_device?.checks?.ip_risk_score ?? 0) > 80) {
    score += 0.25;
    reasons.push("IP_HIGH_RISK");
    ruleHits.push("R21_IP_RISK");
  }
  if (enrichment.vendor_email?.checks?.velocity_bucket === "high") {
    score += 0.2;
    reasons.push("VELOCITY_SPIKE");
    ruleHits.push("R33_VELOCITY");
  }
  if ((payment?.amount ?? 0) > 7000) {
    score += 0.1;
    reasons.push("HIGH_AMOUNT");
    ruleHits.push("R44_AMOUNT");
  }

  const bounded = Math.max(0, Math.min(1, score));
  const decision = bounded >= 0.85 ? "blocked" : bounded >= 0.6 ? "manual_review" : "approved";

  return {
    decision,
    risk_score: Number(bounded.toFixed(4)),
    confidence: Number((0.75 + bounded * 0.2).toFixed(4)),
    reason_codes: reasons,
    reason_summary: toReasonSummary(reasons),
    rule_hits: ruleHits,
    model_version: "fraud-model-v1-local",
    rule_version: "rules-v1-local",
  };
};
