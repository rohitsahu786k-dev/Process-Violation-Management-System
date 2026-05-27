const { MongoClient } = require("mongodb");

let cachedClient;
let cachedDb;

async function getDb() {
  if (cachedDb) return cachedDb;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");
  cachedClient = cachedClient || new MongoClient(uri);
  if (!cachedClient.topology || !cachedClient.topology.isConnected?.()) {
    await cachedClient.connect();
  }
  cachedDb = cachedClient.db(process.env.MONGODB_DB || "pvms");
  return cachedDb;
}

module.exports = { getDb };
