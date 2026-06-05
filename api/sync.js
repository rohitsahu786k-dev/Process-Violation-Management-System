const { getDb } = require("./_lib/db");

const ALLOWED_STATE_KEYS = new Set([
  "users",
  "violations",
  "warnings",
  "auditLogs",
  "notifications",
  "masterDepts",
  "masterCats",
  "masterRCs",
  "masterDesigs",
  "emailTemplates",
  "permMatrix",
  "seeded",
  "seq_VMS",
  "seq_WL"
]);

function isAllowedStateKey(key) {
  const value = String(key || "").trim();
  if (!value || value.includes(".") || value.includes("$")) return false;
  if (!/^[A-Za-z0-9_]+$/.test(value)) return false;
  return ALLOWED_STATE_KEYS.has(value);
}

module.exports = async function handler(req, res) {
  try {
    const db = await getDb();
    const collection = db.collection("appState");

    if (req.method === "GET") {
      const state = await collection.findOne({ _id: "global" }) || {};
      delete state._id;
      delete state.currentUser;
      return res.status(200).json(state);
    } 
    
    if (req.method === "POST") {
      const { key, data } = req.body;
      if (!key) return res.status(400).json({ error: "Missing key" });
      if (!isAllowedStateKey(key)) return res.status(400).json({ error: "Invalid state key" });
      
      await collection.updateOne(
        { _id: "global" },
        { $set: { [key]: data } },
        { upsert: true }
      );
      
      return res.status(200).json({ ok: true });
    }
    
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Sync API Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
