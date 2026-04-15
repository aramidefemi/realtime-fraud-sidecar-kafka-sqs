import { env } from "../config/env.js";
import { queueNames } from "../config/queues.js";
import { validatePaymentAttempt } from "../contracts/messages.js";
import { getQueueUrl, sendJson } from "../lib/aws.js";
import { MongoIdempotencyStore } from "../lib/idempotency-store.js";
import { log } from "../lib/logger.js";
import { runWorkerLoop } from "../lib/worker.js";

const main = async () => {
  const intakeQueueUrl = await getQueueUrl(queueNames.intake);
  const enrichmentQueueUrl = await getQueueUrl(queueNames.enrichment);
  const store = new MongoIdempotencyStore();

  await runWorkerLoop({
    scope: "intake",
    queueUrl: intakeQueueUrl,
    onMessage: async (body) => {
      const paymentAttempt = validatePaymentAttempt(body);
      const isNew = await store.markIfNew(`intake:${paymentAttempt.attempt_id}`);
      if (!isNew) {
        log("intake", "duplicate suppressed", { attempt_id: paymentAttempt.attempt_id });
        return;
      }
      await sendJson(enrichmentQueueUrl, {
        payment_attempt: paymentAttempt,
        ingest_timestamp: new Date().toISOString(),
      });
      log("intake", "queued for enrichment", { attempt_id: paymentAttempt.attempt_id });
    },
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
