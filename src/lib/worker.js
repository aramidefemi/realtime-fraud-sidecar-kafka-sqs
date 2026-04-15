import { env } from "../config/env.js";
import { deleteMessages, receiveBatch } from "./aws.js";
import { log, logError } from "./logger.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_ERROR_BACKOFF_MS = 10_000;

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

const nextBackoffMs = (attempt) => {
  const exponential = env.workerSleepMs * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * env.workerSleepMs);
  return Math.min(MAX_ERROR_BACKOFF_MS, exponential + jitter);
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
  let infraErrorAttempt = 0;
  log(scope, "worker started");

  while (true) {
    let messages = [];
    try {
      messages = await receiveBatch(
        queueUrl,
        normalizedBatchSize,
        env.pollWaitSeconds,
        env.visibilityTimeoutSeconds
      );
      infraErrorAttempt = 0;
    } catch (error) {
      infraErrorAttempt += 1;
      const backoffMs = nextBackoffMs(infraErrorAttempt);
      logError(scope, `receive failed, retrying in ${backoffMs}ms`, error);
      await sleep(backoffMs);
      continue;
    }

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

    if (successfulReceiptHandles.length === 0) continue;

    try {
      await deleteMessages(queueUrl, successfulReceiptHandles);
      infraErrorAttempt = 0;
    } catch (error) {
      infraErrorAttempt += 1;
      const backoffMs = nextBackoffMs(infraErrorAttempt);
      logError(scope, `delete failed, retrying in ${backoffMs}ms`, error);
      await sleep(backoffMs);
    }
  }
};
