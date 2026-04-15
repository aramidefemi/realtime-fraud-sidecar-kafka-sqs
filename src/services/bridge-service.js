import { env } from "../config/env.js";
import { queueNames } from "../config/queues.js";
import { validatePaymentAttempt } from "../contracts/messages.js";
import { getQueueUrl, sendJson } from "../lib/aws.js";
import { MongoIdempotencyStore } from "../lib/idempotency-store.js";
import { createKafkaConsumer } from "../lib/kafka.js";
import { log } from "../lib/logger.js";
 
const nextOffset = (offset) => String(BigInt(offset) + 1n);

const main = async () => {
  const intakeQueueUrl = await getQueueUrl(queueNames.intake);
  const store = new MongoIdempotencyStore();
  const consumer = createKafkaConsumer(env.kafkaConsumerGroupBridge);

  await consumer.connect();
  await consumer.subscribe({ topic: env.kafkaTopicPaymentAttempt, fromBeginning: true });
  log("bridge", "consumer started", { topic: env.kafkaTopicPaymentAttempt });

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message }) => {
      const rawBody = message.value?.toString() ?? "{}";
      const paymentAttempt = validatePaymentAttempt(JSON.parse(rawBody));
      const isNew = await store.markIfNew(`bridge:${paymentAttempt.attempt_id}`);
      if (!isNew) {
        log("bridge", "duplicate suppressed", { attempt_id: paymentAttempt.attempt_id });
      } else {
        await sendJson(intakeQueueUrl, paymentAttempt);
        log("bridge", "published to intake", { attempt_id: paymentAttempt.attempt_id });
      }

      await consumer.commitOffsets([
        { topic, partition, offset: nextOffset(message.offset) },
      ]);
    },
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
