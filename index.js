import { CloudWatchClient, GetMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import {
  CreateQueueCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

const endpoint = process.env.AWS_ENDPOINT_URL ?? "http://localhost:4566";
const region = process.env.AWS_DEFAULT_REGION ?? "us-east-1";
const queueName = process.env.SQS_QUEUE_NAME ?? "demo-queue";

const awsOpts = { region, endpoint, credentials: { accessKeyId: "test", secretAccessKey: "test" } };
const sqs = new SQSClient(awsOpts);
const cloudwatch = new CloudWatchClient(awsOpts);

/** @param {string} id @param {string} name @param {"Average"|"Sum"} stat */
const queueMetric = (id, name, stat) => ({
  Id: id,
  Label: name,
  MetricStat: {
    Metric: {
      Namespace: "AWS/SQS",
      MetricName: name,
      Dimensions: [{ Name: "QueueName", Value: queueName }],
    },
    Period: 300,
    Stat: stat,
  },
});

const queueMetricQueries = () => [
  queueMetric("visible", "ApproximateNumberOfMessagesVisible", "Average"),
  queueMetric("sent", "NumberOfMessagesSent", "Sum"),
  queueMetric("received", "NumberOfMessagesReceived", "Sum"),
  queueMetric("deleted", "NumberOfMessagesDeleted", "Sum"),
];

const formatMetricData = (results) =>
  Object.fromEntries(
    (results ?? []).map((r) => {
      const label = r.Label ?? r.Id ?? "metric";
      const values = r.Values ?? [];
      const latest = values.length ? values[values.length - 1] : null;
      return [label, { latest, points: values.length, status: r.StatusCode }];
    })
  );

const main = async () => {
  const end = new Date();
  const start = new Date(end.getTime() - 60 * 60 * 1000);

  const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: queueName }));
  await sqs.send(new SendMessageCommand({ QueueUrl, MessageBody: "hello from localstack" }));
  const recv = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 5,
    })
  );
  const m = recv.Messages?.[0];
  if (!m?.Body) {
    console.error("no message received");
    process.exit(1);
  }
  console.log(m.Body);
  await sqs.send(new DeleteMessageCommand({ QueueUrl, ReceiptHandle: m.ReceiptHandle }));

  try {
    const { MetricDataResults } = await cloudwatch.send(
      new GetMetricDataCommand({
        StartTime: start,
        EndTime: end,
        MetricDataQueries: queueMetricQueries(),
      })
    );
    console.log("cloudwatch (last hour, 5m period):", formatMetricData(MetricDataResults));
  } catch (e) {
    console.log("cloudwatch metrics unavailable on this LocalStack image/version:", e?.name ?? "error");
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
