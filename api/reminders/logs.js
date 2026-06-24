const { getDb } = require("../_lib/db");

module.exports = async function handler(req, res) {
  try {
    const db = await getDb();
    if (req.method === "GET") {
      const logs = await db.collection("emailLogs").find({}).sort({ createdAt: -1 }).limit(200).toArray();
      return res.status(200).json({ logs });
    }
    if (req.method === "DELETE") {
      await db.collection("emailLogs").deleteMany({});
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
