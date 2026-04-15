import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";

import { env } from "../src/config/env.js";
import { queueNames, withDlq } from "../src/config/queues.js";
import { validateDecisionEvent } from "../src/contracts/messages.js";
import {
  deleteMessages,
  ensureQueue,
  getQueueArn,
  getQueueUrl,
  receiveBatch,
  setRedrivePolicy,
} from "../src/lib/aws.js";
import { createKafkaProducer, ensureKafkaTopic } from "../src/lib/kafka.js";

const TOTAL_MESSAGES = Number.parseInt(process.env.E2E_1K_COUNT ?? "1000", 10);
const CHUNK_SIZE = 500;
const DECISION_TIMEOUT_MS = Number.parseInt(process.env.E2E_1K_TIMEOUT_MS ?? "180000", 10);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const workerScripts = [
  "../src/services/bridge-service.js",
  "../src/services/intake-worker.js",
  "../src/services/enrichment-worker.js",
  "../src/services/scoring-worker.js",
];

const toAbsoluteScriptPath = (relativePath) => new URL(relativePath, import.meta.url).pathname;

const startWorkers = () =>
  workerScripts.map((relativePath) =>
    spawn(process.execPath, [toAbsoluteScriptPath(relativePath)], {
      stdio: "ignore",
      env: process.env,
    })
  );

const stopWorkers = async (processes) => {
  await Promise.all(
    processes.map(async (proc) => {
      if (proc.exitCode !== null) return;
      proc.kill("SIGTERM");
      await Promise.race([once(proc, "exit"), sleep(3000)]);
      if (proc.exitCode === null) proc.kill("SIGKILL");
    })
  );
};

const bootstrapQueues = async () => {
  const allNames = [
    queueNames.intake,
    queueNames.enrichment,
    queueNames.scoring,
    queueNames.decision,
    queueNames.enrichmentDlq,
    queueNames.scoringDlq,
  ];
  const urls = {};
  for (const queueName of allNames) {
    urls[queueName] = await ensureQueue(queueName);
  }
  for (const mapping of withDlq) {
    const dlqArn = await getQueueArn(urls[mapping.dlq]);
    await setRedrivePolicy(urls[mapping.queue], dlqArn, "3");
  }
};

const drainQueue = async (queueUrl) => {
  while (true) {
    const messages = await receiveBatch(queueUrl, 10, 1, 1);
    if (messages.length === 0) return;
    await deleteMessages(
      queueUrl,
      messages.map((message) => message.ReceiptHandle)
    );
  }
};

const buildMessage = (prefix, index) => ({
  key: `${prefix}_${index}`,
  value: JSON.stringify({
    attempt_id: `${prefix}_${index}`,
    user_id: `u_${index}`,
    amount: 120.5,
    currency: "USD",
    email: "normal@example.com",
    ip: "10.0.0.10",
  }),
});

const sendLoad = async ({ prefix, total }) => {
  const producer = createKafkaProducer();
  await producer.connect();
  try {
    for (let index = 0; index < total; index += CHUNK_SIZE) {
      const end = Math.min(total, index + CHUNK_SIZE);
      const messages = [];
      for (let cursor = index; cursor < end; cursor += 1) {
        messages.push(buildMessage(prefix, cursor));
      }
      await producer.send({
        topic: env.kafkaTopicPaymentAttempt,
        messages,
      });
    }
  } finally {
    await producer.disconnect();
  }
};

const waitForDecisions = async ({ decisionQueueUrl, prefix, expectedCount, timeoutMs }) => {
  const seenAttemptIds = new Set();
  const startedAt = Date.now();

  while (seenAttemptIds.size < expectedCount) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(
        `Timed out waiting for decisions. got=${seenAttemptIds.size} expected=${expectedCount}`
      );
    }

    const messages = await receiveBatch(decisionQueueUrl, 10, 2, 30);
    if (messages.length === 0) continue;

    const receiptHandles = [];
    for (const message of messages) {
      receiptHandles.push(message.ReceiptHandle);
      const body = JSON.parse(message.Body ?? "{}");
      const event = validateDecisionEvent(body);
      if (!event.attempt_id.startsWith(prefix)) continue;
      assert.equal(event.decision, "approved");
      seenAttemptIds.add(event.attempt_id);
    }
    await deleteMessages(decisionQueueUrl, receiptHandles);
  }

  return seenAttemptIds.size;
};

test(
  "1k end-to-end Kafka->SQS->decision throughput",
  { timeout: DECISION_TIMEOUT_MS + 60000 },
  async (t) => {
    await ensureKafkaTopic(env.kafkaTopicPaymentAttempt);
    await bootstrapQueues();

    const decisionQueueUrl = await getQueueUrl(queueNames.decision);
    await drainQueue(decisionQueueUrl);

    const workers = startWorkers();
    t.after(async () => {
      await stopWorkers(workers);
    });

    await sleep(2000);

    const prefix = `e2e1k_${Date.now()}`;
    const startedAt = Date.now();
    await sendLoad({ prefix, total: TOTAL_MESSAGES });
    const received = await waitForDecisions({
      decisionQueueUrl,
      prefix,
      expectedCount: TOTAL_MESSAGES,
      timeoutMs: DECISION_TIMEOUT_MS,
    });
    const elapsedMs = Date.now() - startedAt;
    const throughput = Math.round((received / (elapsedMs / 1000)) * 100) / 100;

    process.stdout.write(
      `E2E_1K_RESULT received=${received} elapsed_ms=${elapsedMs} throughput_msg_s=${throughput}\n`
    );

    assert.equal(received, TOTAL_MESSAGES);
  }
);
