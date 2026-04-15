import { env } from "../config/env.js";
import { getMongoDb } from "./mongo.js";

const expiryDate = () => new Date(Date.now() + env.idempotencyTtlSeconds * 1000);

export class MongoIdempotencyStore {
  constructor(collectionName = env.idempotencyCollection) {
    this.collectionName = collectionName;
    this.collectionPromise = null;
  }

  async collection() {
    if (!this.collectionPromise) {
      this.collectionPromise = (async () => {
        const db = await getMongoDb();
        const collection = db.collection(this.collectionName);
        await collection.createIndex({ key: 1 }, { unique: true });
        await collection.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
        return collection;
      })();
    }
    return this.collectionPromise;
  }

  async markIfNew(key) {
    const collection = await this.collection();
    const result = await collection.updateOne(
      { key },
      { $setOnInsert: { key, createdAt: new Date(), expireAt: expiryDate() } },
      { upsert: true }
    );
    return result.upsertedCount === 1;
  }
}
