import { MongoClient } from "mongodb";
import { env } from "../config/env.js";

let clientPromise;

const createClient = async () => {
  const client = new MongoClient(env.mongoUri);
  await client.connect();
  return client;
};

export const getMongoClient = async () => {
  if (!clientPromise) {
    clientPromise = createClient();
  }
  return clientPromise;
};

export const getMongoDb = async () => {
  const client = await getMongoClient();
  return client.db(env.mongoDbName);
};
