import {
  CreateQueueCommand,
  DeleteMessageBatchCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SetQueueAttributesCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { env } from "../config/env.js";

const client = new SQSClient({
  region: env.awsRegion,
  endpoint: env.awsEndpoint,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

export const sqs = client;

export const ensureQueue = async (queueName) => {
  await sqs.send(new CreateQueueCommand({ QueueName: queueName }));
  const result = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
  return result.QueueUrl;
};

export const getQueueUrl = async (queueName) => {
  const result = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
  return result.QueueUrl;
};

export const setRedrivePolicy = async (queueUrl, deadLetterTargetArn, maxReceiveCount = "3") => {
  await sqs.send(
    new SetQueueAttributesCommand({
      QueueUrl: queueUrl,
      Attributes: {
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn,
          maxReceiveCount,
        }),
      },
    })
  );
};

export const getQueueArn = async (queueUrl) => {
  const result = await sqs.send(
    new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ["QueueArn"],
    })
  );
  return result.Attributes?.QueueArn;
};

export const sendJson = async (queueUrl, message) =>
  sqs.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
    })
  );

export const receiveBatch = async (queueUrl, maxMessages, waitSeconds, visibilityTimeoutSeconds) => {
  const clampedMaxMessages = Math.max(1, Math.min(10, maxMessages));
  const result = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: clampedMaxMessages,
      WaitTimeSeconds: waitSeconds,
      VisibilityTimeout: visibilityTimeoutSeconds,
    })
  );
  return result.Messages ?? [];
};

export const deleteMessage = async (queueUrl, receiptHandle) =>
  sqs.send(
    new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    })
  );

const toDeleteBatchEntries = (receiptHandles) =>
  receiptHandles.map((receiptHandle, index) => ({
    Id: `msg-${index}`,
    ReceiptHandle: receiptHandle,
  }));

const chunk = (values, size) => {
  const list = [];
  for (let index = 0; index < values.length; index += size) {
    list.push(values.slice(index, index + size));
  }
  return list;
};

export const deleteMessages = async (queueUrl, receiptHandles) => {
  const uniqueHandles = [...new Set(receiptHandles.filter(Boolean))];
  if (uniqueHandles.length === 0) return;

  for (const handlesChunk of chunk(uniqueHandles, 10)) {
    await sqs.send(
      new DeleteMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: toDeleteBatchEntries(handlesChunk),
      })
    );
  }
};
