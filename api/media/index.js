const { getDb } = require("../_lib/db");
const { parseListQuery } = require("../_lib/mediaHelpers");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const db = await getDb();
    const media = db.collection("media");
    const { filter, sort, page, limit, skip } = parseListQuery(req.query || {});

    const [items, total, stats] = await Promise.all([
      media.find(filter).sort(sort).skip(skip).limit(limit).toArray(),
      media.countDocuments(filter),
      media
        .aggregate([
          { $match: { deletedAt: null } },
          {
            $group: {
              _id: null,
              totalSize: { $sum: "$size" },
              count: { $sum: 1 },
              images: { $sum: { $cond: [{ $eq: ["$fileType", "image"] }, 1, 0] } },
              videos: { $sum: { $cond: [{ $eq: ["$fileType", "video"] }, 1, 0] } },
              documents: { $sum: { $cond: [{ $eq: ["$fileType", "document"] }, 1, 0] } },
            },
          },
        ])
        .toArray(),
    ]);

    const storage = stats[0] || { totalSize: 0, count: 0, images: 0, videos: 0, documents: 0 };

    return res.status(200).json({
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      storage,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
