import { Kafka, Partitioners } from "kafkajs";
import { env } from "../config/env.js";

const kafka = new Kafka({
  clientId: "fraud-detection-sidecar",
  brokers: env.kafkaBrokers,
  requestTimeout: 30000,
  retry: { initialRetryTime: 300, retries: 8 },
  enforceRequestTimeout: false,
});

export const createKafkaProducer = () =>
  kafka.producer({
    createPartitioner: Partitioners.LegacyPartitioner,
  });

export const createKafkaConsumer = (groupId) => kafka.consumer({ groupId });

export const ensureKafkaTopic = async (topic) => {
  const admin = kafka.admin();
  await admin.connect();
  try {
    await admin.createTopics({
      waitForLeaders: true,
      topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
    });
  } finally {
    await admin.disconnect();
  }
};
