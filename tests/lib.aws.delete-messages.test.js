import test from "node:test";
import assert from "node:assert/strict";

import { deleteMessages, sqs } from "../src/lib/aws.js";

test("deleteMessages deduplicates receipt handles before batching", async () => {
  const calls = [];
  const originalSend = sqs.send.bind(sqs);

  sqs.send = async (command) => {
    calls.push(command.input);
    return {};
  };

  try {
    await deleteMessages("queue-url", ["r1", "r2", "r1", "", undefined, "r3"]);
  } finally {
    sqs.send = originalSend;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].Entries.length, 3);
  assert.deepEqual(
    calls[0].Entries.map((entry) => entry.ReceiptHandle),
    ["r1", "r2", "r3"]
  );
});

test("deleteMessages chunks to max 10 entries per SQS batch", async () => {
  const calls = [];
  const originalSend = sqs.send.bind(sqs);
  const handles = Array.from({ length: 25 }, (_, i) => `r-${i}`);

  sqs.send = async (command) => {
    calls.push(command.input);
    return {};
  };

  try {
    await deleteMessages("queue-url", handles);
  } finally {
    sqs.send = originalSend;
  }

  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map((call) => call.Entries.length),
    [10, 10, 5]
  );
});
