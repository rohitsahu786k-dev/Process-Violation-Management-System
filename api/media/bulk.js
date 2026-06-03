const { ObjectId } = require("mongodb");
const { getDb } = require("../_lib/db");
const { deleteFromCloudinary } = require("../_lib/cloudinaryService");
const { cloudinaryResourceType } = require("../_lib/mediaHelpers");

module.exports = async function handler(req, res) {
  if (req.method !== "DELETE" && req.method !== "PATCH" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { ids = [], action, tags, isFavorite } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: "ids array is required" });
    }

    const objectIds = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    const db = await getDb();
    const media = db.collection("media");

    if (req.method === "PATCH" || (req.method === "POST" && action !== "trash" && action !== "permanent")) {
      const updates = { updatedAt: new Date() };
      if (tags !== undefined) updates.tags = tags;
      if (isFavorite !== undefined) updates.isFavorite = !!isFavorite;

      const result = await media.updateMany({ _id: { $in: objectIds }, deletedAt: null }, { $set: updates });
      return res.status(200).json({ modified: result.modifiedCount });
    }

    const permanent = action === "permanent";
    const docs = await media.find({ _id: { $in: objectIds } }).toArray();

    if (permanent) {
      for (const doc of docs) {
        if (doc.publicId) {
          await deleteFromCloudinary(doc.publicId, cloudinaryResourceType(doc.fileType));
        }
      }
      const result = await media.deleteMany({ _id: { $in: objectIds } });
      return res.status(200).json({ deleted: result.deletedCount, permanent: true });
    }

    const result = await media.updateMany(
      { _id: { $in: objectIds } },
      { $set: { deletedAt: new Date(), updatedAt: new Date() } }
    );
    return res.status(200).json({ trashed: result.modifiedCount });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
