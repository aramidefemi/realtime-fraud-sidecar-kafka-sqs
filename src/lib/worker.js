import { env } from "../config/env.js";
import { deleteMessages, receiveBatch } from "./aws.js";
import { log, logError } from "./logger.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chunk = (values, size) => {
  const list = [];
  for (let index = 0; index < values.length; index += size) {
    list.push(values.slice(index, index + size));
  }
  return list;
};

const normalizePositiveInt = (value, fallback) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.trunc(value));
};

export const runWorkerLoop = async ({
  scope,
  queueUrl,
  batchSize = env.workerBatchSize,
  concurrency = env.workerConcurrency,
  onMessage,
}) => {
  const normalizedBatchSize = Math.min(10, normalizePositiveInt(batchSize, env.workerBatchSize));
  const normalizedConcurrency = normalizePositiveInt(concurrency, env.workerConcurrency);
  log(scope, "worker started");

  while (true) {
    const messages = await receiveBatch(
      queueUrl,
      normalizedBatchSize,
      env.pollWaitSeconds,
      env.visibilityTimeoutSeconds
    );
    if (messages.length === 0) {
      await sleep(env.workerSleepMs);
      continue;
    }

    const successfulReceiptHandles = [];
    const messageChunks = chunk(messages, normalizedConcurrency);

    for (const messageChunk of messageChunks) {
      const results = await Promise.allSettled(
        messageChunk.map(async (message) => {
          const body = JSON.parse(message.Body ?? "{}");
          await onMessage(body, message);
          return message.ReceiptHandle;
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          successfulReceiptHandles.push(result.value);
        } else {
          logError(scope, "message processing failed (will retry via SQS redrive)", result.reason);
        }
      }
    }

    await deleteMessages(queueUrl, successfulReceiptHandles);
  }
};
