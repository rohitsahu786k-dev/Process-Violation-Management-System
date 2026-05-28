const { getDb } = require("./_lib/db");

module.exports = async function handler(req, res) {
  try {
    const db = await getDb();
    const collection = db.collection("appState");

    if (req.method === "GET") {
      const state = await collection.findOne({ _id: "global" }) || {};
      delete state._id;
      return res.status(200).json(state);
    } 
    
    if (req.method === "POST") {
      const { key, data } = req.body;
      if (!key) return res.status(400).json({ error: "Missing key" });
      
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
