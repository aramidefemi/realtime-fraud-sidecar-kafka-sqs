import { queueNames } from "../config/queues.js";
import { deleteMessage, getQueueUrl, receiveBatch, sendJson } from "../lib/aws.js";
import { log } from "../lib/logger.js";

const replayMap = {
  [queueNames.enrichmentDlq]: queueNames.enrichment,
  [queueNames.scoringDlq]: queueNames.scoring,
};

const replayOne = async (sourceName, targetName) => {
  const sourceUrl = await getQueueUrl(sourceName);
  const targetUrl = await getQueueUrl(targetName);
  const messages = await receiveBatch(sourceUrl, 10, 1, 30);
  if (messages.length === 0) {
    return 0;
  }
  for (const message of messages) {
    const body = JSON.parse(message.Body ?? "{}");
    await sendJson(targetUrl, body);
    await deleteMessage(sourceUrl, message.ReceiptHandle);
  }
  return messages.length;
};

const run = async () => {
  let total = 0;
  for (const [sourceName, targetName] of Object.entries(replayMap)) {
    const moved = await replayOne(sourceName, targetName);
    total += moved;
    log("dlq-replay", "replayed", { source: sourceName, target: targetName, moved });
  }
  log("dlq-replay", "done", { total });
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
