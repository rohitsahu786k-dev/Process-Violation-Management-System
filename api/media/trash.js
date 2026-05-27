const { ObjectId } = require("mongodb");
const { getDb } = require("../_lib/db");

module.exports = async function handler(req, res) {
  try {
    const db = await getDb();
    const media = db.collection("media");

    if (req.method === "GET") {
      const items = await media.find({ deletedAt: { $ne: null } }).sort({ deletedAt: -1 }).limit(200).toArray();
      return res.status(200).json({ items });
    }

    if (req.method === "POST") {
      const { id } = req.body || {};
      if (!id || !ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Valid id is required" });
      }
      await media.updateOne(
        { _id: new ObjectId(id) },
        { $set: { deletedAt: null, updatedAt: new Date() } }
      );
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
