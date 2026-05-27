const { ObjectId } = require("mongodb");
const { getDb } = require("../_lib/db");
const { deleteFromCloudinary } = require("../_lib/cloudinaryService");
const { cloudinaryResourceType } = require("../_lib/mediaHelpers");

module.exports = async function handler(req, res) {
  const { id } = req.query;
  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Valid media id is required" });
  }

  try {
    const db = await getDb();
    const media = db.collection("media");
    const _id = new ObjectId(id);

    if (req.method === "GET") {
      const doc = await media.findOne({ _id, deletedAt: null });
      if (!doc) return res.status(404).json({ error: "Media not found" });
      return res.status(200).json({ item: doc });
    }

    if (req.method === "PUT") {
      const { fileName, tags, folder, isFavorite } = req.body || {};
      const updates = { updatedAt: new Date() };
      if (fileName !== undefined) updates.fileName = fileName;
      if (tags !== undefined) updates.tags = tags;
      if (folder !== undefined) updates.folder = folder;
      if (isFavorite !== undefined) updates.isFavorite = !!isFavorite;

      const result = await media.findOneAndUpdate(
        { _id, deletedAt: null },
        { $set: updates },
        { returnDocument: "after" }
      );
      if (!result) return res.status(404).json({ error: "Media not found" });
      return res.status(200).json({ item: result });
    }

    if (req.method === "DELETE") {
      const doc = await media.findOne({ _id });
      if (!doc) return res.status(404).json({ error: "Media not found" });

      const permanent = req.query.permanent === "true";
      if (permanent && doc.publicId) {
        await deleteFromCloudinary(doc.publicId, cloudinaryResourceType(doc.fileType));
        await media.deleteOne({ _id });
        return res.status(200).json({ ok: true, permanent: true });
      }

      await media.updateOne({ _id }, { $set: { deletedAt: new Date(), updatedAt: new Date() } });
      return res.status(200).json({ ok: true, trashed: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
