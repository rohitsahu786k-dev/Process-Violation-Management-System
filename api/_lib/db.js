const { MongoClient } = require("mongodb");

let cachedClient;
let cachedDb;

async function getDb() {
  if (cachedDb) return cachedDb;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!cachedClient) {
    cachedClient = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    await cachedClient.connect();
  }
  cachedDb = cachedClient.db(process.env.MONGODB_DB || "pvms");
  return cachedDb;
}

module.exports = { getDb };
