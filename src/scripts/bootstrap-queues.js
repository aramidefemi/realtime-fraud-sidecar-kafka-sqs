import { getQueueArn, ensureQueue, setRedrivePolicy } from "../lib/aws.js";
import { queueNames, withDlq } from "../config/queues.js";
import { log } from "../lib/logger.js";

const bootstrap = async () => {
  const allNames = [
    queueNames.intake,
    queueNames.enrichment,
    queueNames.scoring,
    queueNames.decision,
    queueNames.enrichmentDlq,
    queueNames.scoringDlq,
  ];
  const urls = {};
  for (const name of allNames) {
    urls[name] = await ensureQueue(name);
  }
  for (const item of withDlq) {
    const dlqArn = await getQueueArn(urls[item.dlq]);
    await setRedrivePolicy(urls[item.queue], dlqArn, "3");
  }
  log("bootstrap", "queues ready", urls);
};

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
