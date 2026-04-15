import { env } from "../config/env.js";
import { createKafkaProducer } from "../lib/kafka.js";
import { log } from "../lib/logger.js";

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toFloat = (value, fallback) => {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
};

const intBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const pick = (values) => values[intBetween(0, values.length - 1)];

const maybe = (chance) => Math.random() < chance;

const buildAttemptId = (prefix, index) => `${prefix}_${Date.now()}_${index}_${intBetween(100, 999)}`;

const buildBaseEvent = (attemptId) => ({
  attempt_id: attemptId,
  user_id: maybe(0.2) ? `new_${intBetween(10, 99)}` : `u_${intBetween(100, 999)}`,
  amount: Number((Math.random() * 9000 + 20).toFixed(2)),
  currency: "USD",
  email: pick(["normal@example.com", "buyer@example.com", "risk@mailinator.com"]),
  ip: `10.0.0.${intBetween(2, 254)}`,
});

const generateTwoCaseEvents = (idPrefix) => {
  const seed = Date.now();
  const safeId = `${idPrefix}_${seed}_safe`;
  const riskyId = `${idPrefix}_${seed}_risky`;
  const safe = applyRiskProfile(buildBaseEvent(safeId), "safe");
  const risky = applyRiskProfile(buildBaseEvent(riskyId), "risky");
  return [safe, risky];
};

const applyRiskProfile = (event, profile) => {
  if (profile === "safe") {
    return { ...event, amount: Number((Math.random() * 300 + 20).toFixed(2)), email: "normal@example.com" };
  }
  if (profile === "risky") {
    return {
      ...event,
      amount: Number((Math.random() * 5000 + 5000).toFixed(2)),
      email: pick(["fraudster@example.com", "blocked@example.com", "risk@mailinator.com"]),
      ip: `10.0.0.${intBetween(81, 99)}`,
    };
  }
  if (profile === "timeout") {
    return { ...event, force_vendor_timeout: true };
  }
  return event;
};

const parseProfileWeights = () => {
  const raw = process.env.SAMPLE_PROFILE_WEIGHTS ?? "safe:0.5,risky:0.35,timeout:0.15";
  const parsed = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, weight] = part.split(":");
      return { name: name?.trim(), weight: toFloat(weight, 0) };
    })
    .filter((item) => ["safe", "risky", "timeout"].includes(item.name) && item.weight > 0);
  return parsed.length > 0 ? parsed : [{ name: "safe", weight: 1 }];
};

const pickProfile = (weightedProfiles) => {
  const total = weightedProfiles.reduce((sum, item) => sum + item.weight, 0);
  const target = Math.random() * total;
  let cursor = 0;
  for (const item of weightedProfiles) {
    cursor += item.weight;
    if (target <= cursor) return item.name;
  }
  return weightedProfiles[weightedProfiles.length - 1].name;
};

const generateEvents = ({ count, duplicateRate, idPrefix }) => {
  const profiles = parseProfileWeights();
  const events = [];
  const emittedAttemptIds = [];

  for (let i = 0; i < count; i += 1) {
    const useDuplicate = emittedAttemptIds.length > 0 && maybe(duplicateRate);
    const attemptId = useDuplicate ? pick(emittedAttemptIds) : buildAttemptId(idPrefix, i);
    if (!useDuplicate) emittedAttemptIds.push(attemptId);
    const profile = pickProfile(profiles);
    const event = applyRiskProfile(buildBaseEvent(attemptId), profile);
    events.push(event);
  }

  return events;
};

const run = async () => {
  const count = Math.max(1, toInt(process.env.SAMPLE_COUNT, 2));
  const duplicateRate = Math.max(0, Math.min(1, toFloat(process.env.SAMPLE_DUPLICATE_RATE, 0)));
  const idPrefix = process.env.SAMPLE_ID_PREFIX ?? "pay";
  const useTwoCasePreset = (process.env.SAMPLE_PRESET ?? "two-case") === "two-case";
  const events = useTwoCasePreset ? generateTwoCaseEvents(idPrefix) : generateEvents({ count, duplicateRate, idPrefix });
  const producer = createKafkaProducer();
  await producer.connect();
  for (const event of events) {
    await producer.send({
      topic: env.kafkaTopicPaymentAttempt,
      messages: [{ key: event.attempt_id, value: JSON.stringify(event) }],
    });
    log("sample", "sent payment_attempt", { attempt_id: event.attempt_id });
  }
  await producer.disconnect();
  log("sample", "done", {
    count,
    duplicate_rate: duplicateRate,
    unique_attempt_ids: new Set(events.map((item) => item.attempt_id)).size,
  });
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
