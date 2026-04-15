import { queueNames } from "../config/queues.js";
import { validateEnrichmentJob } from "../contracts/messages.js";
import { runVendorEnrichment } from "../domain/vendors.js";
import { getQueueUrl, sendJson } from "../lib/aws.js";
import { log } from "../lib/logger.js";
import { runWorkerLoop } from "../lib/worker.js";

const main = async () => {
  const enrichmentQueueUrl = await getQueueUrl(queueNames.enrichment);
  const scoringQueueUrl = await getQueueUrl(queueNames.scoring);

  await runWorkerLoop({
    scope: "enrichment",
    queueUrl: enrichmentQueueUrl,
    onMessage: async (body) => {
      const payload = validateEnrichmentJob(body);
      const enrichment = await runVendorEnrichment(payload.payment_attempt);
      await sendJson(scoringQueueUrl, {
        payment_attempt: payload.payment_attempt,
        enrichment,
      });
      log("enrichment", "queued for scoring", { attempt_id: payload.payment_attempt.attempt_id });
    },
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
