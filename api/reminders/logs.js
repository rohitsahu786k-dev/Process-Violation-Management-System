const { getDb } = require("../_lib/db");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const db = await getDb();
    const logs = await db.collection("emailLogs").find({}).sort({ createdAt: -1 }).limit(200).toArray();
    return res.status(200).json({ logs });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
