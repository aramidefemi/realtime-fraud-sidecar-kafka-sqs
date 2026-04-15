import { queueNames } from "../config/queues.js";
import { validateDecisionEvent } from "../contracts/messages.js";
import { getQueueUrl } from "../lib/aws.js";
import { log } from "../lib/logger.js";
import { runWorkerLoop } from "../lib/worker.js";

const main = async () => {
  const decisionQueueUrl = await getQueueUrl(queueNames.decision);
  await runWorkerLoop({
    scope: "decision-publisher",
    queueUrl: decisionQueueUrl,
    onMessage: async (body) => {
      const event = validateDecisionEvent(body);
      log("decision-publisher", "decision_event", event);
    },
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
