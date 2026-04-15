const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const hasString = (value) => typeof value === "string" && value.length > 0;

const assert = (ok, message) => {
  if (!ok) {
    throw new Error(message);
  }
};

export const validatePaymentAttempt = (value) => {
  assert(isObject(value), "payment_attempt must be an object");
  assert(hasString(value.attempt_id), "payment_attempt.attempt_id is required");
  assert(hasString(value.user_id), "payment_attempt.user_id is required");
  assert(typeof value.amount === "number", "payment_attempt.amount must be a number");
  assert(hasString(value.currency), "payment_attempt.currency is required");
  assert(hasString(value.email), "payment_attempt.email is required");
  assert(hasString(value.ip), "payment_attempt.ip is required");
  return value;
};

export const validateEnrichmentJob = (value) => {
  assert(isObject(value), "enrichment_job must be an object");
  validatePaymentAttempt(value.payment_attempt);
  return value;
};

export const validateScoringJob = (value) => {
  assert(isObject(value), "scoring_job must be an object");
  validatePaymentAttempt(value.payment_attempt);
  assert(isObject(value.enrichment), "scoring_job.enrichment is required");
  return value;
};

export const validateDecisionEvent = (value) => {
  assert(isObject(value), "decision_event must be an object");
  assert(hasString(value.attempt_id), "decision_event.attempt_id is required");
  assert(hasString(value.decision), "decision_event.decision is required");
  assert(Array.isArray(value.reason_codes), "decision_event.reason_codes must be an array");
  return value;
};
