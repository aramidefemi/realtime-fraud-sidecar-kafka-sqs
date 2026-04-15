import { env } from "../config/env.js";
import { queueNames } from "../config/queues.js";
import { validatePaymentAttempt } from "../contracts/messages.js";
import { getQueueUrl, sendJsonBatch } from "../lib/aws.js";
import { MongoIdempotencyStore } from "../lib/idempotency-store.js";
import { createKafkaConsumer } from "../lib/kafka.js";
import { log, logError } from "../lib/logger.js";
 
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_BRIDGE_RETRY_MS = 10_000;

const nextRetryMs = (attempt) => {
  const exponential = env.workerSleepMs * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * env.workerSleepMs);
  return Math.min(MAX_BRIDGE_RETRY_MS, exponential + jitter);
};

const sendToIntakeWithRetry = async (intakeQueueUrl, paymentAttempts) => {
  let attempt = 0;
  while (true) {
    try {
      await sendJsonBatch(intakeQueueUrl, paymentAttempts);
      return;
    } catch (error) {
      attempt += 1;
      const delayMs = nextRetryMs(attempt);
      logError("bridge", `send to intake failed, retrying in ${delayMs}ms`, error);
      await sleep(delayMs);
    }
  }
};

const main = async () => {
  const intakeQueueUrl = await getQueueUrl(queueNames.intake);
  const store = new MongoIdempotencyStore();
  const consumer = createKafkaConsumer(env.kafkaConsumerGroupBridge);

  await consumer.connect();
  await consumer.subscribe({ topic: env.kafkaTopicPaymentAttempt, fromBeginning: true });
  log("bridge", "consumer started", { topic: env.kafkaTopicPaymentAttempt });

  await consumer.run({
    autoCommit: false,
    eachBatchAutoResolve: false,
    eachBatch: async ({ batch, resolveOffset, heartbeat, commitOffsetsIfNecessary }) => {
      const publishable = [];

      for (const message of batch.messages) {
        const rawBody = message.value?.toString() ?? "{}";
        const paymentAttempt = validatePaymentAttempt(JSON.parse(rawBody));
        const isNew = await store.markIfNew(`bridge:${paymentAttempt.attempt_id}`);
        if (!isNew) {
          log("bridge", "duplicate suppressed", { attempt_id: paymentAttempt.attempt_id });
        } else {
          publishable.push(paymentAttempt);
        }
        await heartbeat();
      }

      if (publishable.length > 0) {
        await sendToIntakeWithRetry(intakeQueueUrl, publishable);
        for (const paymentAttempt of publishable) {
          log("bridge", "published to intake", { attempt_id: paymentAttempt.attempt_id });
        }
      }

      for (const message of batch.messages) {
        resolveOffset(message.offset);
      }
      await commitOffsetsIfNecessary();
    },
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
