const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
  awsRegion: process.env.AWS_DEFAULT_REGION ?? "us-east-1",
  awsEndpoint: process.env.AWS_ENDPOINT_URL ?? "http://localhost:4566",
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? "localhost:9092")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  kafkaTopicPaymentAttempt: process.env.KAFKA_TOPIC_PAYMENT_ATTEMPT ?? "payment_attempt",
  kafkaConsumerGroupBridge: process.env.KAFKA_CONSUMER_GROUP_BRIDGE ?? "bridge-service",
  mongoUri: process.env.MONGO_URI ?? "mongodb://localhost:27017",
  mongoDbName: process.env.MONGO_DB_NAME ?? "fraud_detection",
  idempotencyCollection: process.env.IDEMPOTENCY_COLLECTION ?? "idempotency_keys",
  idempotencyTtlSeconds: toInt(process.env.IDEMPOTENCY_TTL_SECONDS, 86400),
  pollWaitSeconds: toInt(process.env.POLL_WAIT_SECONDS, 5),
  visibilityTimeoutSeconds: toInt(process.env.VISIBILITY_TIMEOUT_SECONDS, 30),
  workerSleepMs: toInt(process.env.WORKER_SLEEP_MS, 500),
  workerBatchSize: toInt(process.env.WORKER_BATCH_SIZE, 10),
  workerConcurrency: toInt(process.env.WORKER_CONCURRENCY, 10),
  bridgeBatchSize: toInt(process.env.BRIDGE_BATCH_SIZE, 5),
};
