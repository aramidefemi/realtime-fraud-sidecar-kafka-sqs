import { queueNames } from "../config/queues.js";
import { validateScoringJob } from "../contracts/messages.js";
import { scorePayment } from "../domain/scoring.js";
import { getQueueUrl, sendJson } from "../lib/aws.js";
import { log } from "../lib/logger.js";
import { runWorkerLoop } from "../lib/worker.js";

const main = async () => {
  const scoringQueueUrl = await getQueueUrl(queueNames.scoring);
  const decisionQueueUrl = await getQueueUrl(queueNames.decision);

  await runWorkerLoop({
    scope: "scoring",
    queueUrl: scoringQueueUrl,
    onMessage: async (body) => {
      const payload = validateScoringJob(body);
      const scored = scorePayment(payload);
      const event = {
        attempt_id: payload.payment_attempt.attempt_id,
        ...scored,
        evidence: payload.enrichment.evidence ?? [],
        data_completeness: payload.enrichment.data_completeness ?? {},
        feature_snapshot_id: `feat_${payload.payment_attempt.attempt_id}`,
        timestamp: new Date().toISOString(),
      };
      await sendJson(decisionQueueUrl, event);
      log("scoring", "decision published to queue", {
        attempt_id: event.attempt_id,
        decision: event.decision,
      });
    },
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
