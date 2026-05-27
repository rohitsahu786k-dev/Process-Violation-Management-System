const { getDb } = require("../_lib/db");

module.exports = async function handler(req, res) {
  try {
    const db = await getDb();
    const media = db.collection("media");

    if (req.method === "GET") {
      const folders = await media
        .aggregate([
          { $match: { deletedAt: null, folder: { $ne: null, $ne: "" } } },
          { $group: { _id: "$folder", count: { $sum: 1 }, size: { $sum: "$size" } } },
          { $sort: { _id: 1 } },
        ])
        .toArray();

      return res.status(200).json({
        folders: folders.map((f) => ({ name: f._id, count: f.count, size: f.size })),
      });
    }

    if (req.method === "POST") {
      const { name } = req.body || {};
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Folder name is required" });
      }
      return res.status(201).json({ folder: name.trim() });
    }

    if (req.method === "PUT") {
      const { oldName, newName } = req.body || {};
      if (!oldName || !newName) {
        return res.status(400).json({ error: "oldName and newName are required" });
      }
      const result = await media.updateMany(
        { folder: oldName, deletedAt: null },
        { $set: { folder: newName, updatedAt: new Date() } }
      );
      return res.status(200).json({ modified: result.modifiedCount });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
