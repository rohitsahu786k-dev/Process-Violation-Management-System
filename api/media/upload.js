const { IncomingForm } = require("formidable");
const fs = require("fs");
const { getDb } = require("../_lib/db");
const { uploadBuffer, detectFileType, buildThumbnailUrl } = require("../_lib/cloudinaryService");
const { validateUpload, buildMediaDoc } = require("../_lib/mediaHelpers");

module.exports.config = { api: { bodyParser: false } };

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ multiples: true, maxFileSize: 100 * 1024 * 1024 });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

function collectFiles(files) {
  const list = [];
  Object.values(files || {}).forEach((entry) => {
    if (Array.isArray(entry)) list.push(...entry);
    else if (entry) list.push(entry);
  });
  return list;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { fields, files } = await parseForm(req);
    const fileList = collectFiles(files);
    if (!fileList.length) {
      return res.status(400).json({ error: "No files provided" });
    }

    const uploadedBy = (fields.uploadedBy && fields.uploadedBy[0]) || "system";
    const folderOverride = fields.folder && fields.folder[0];
    const tagsRaw = fields.tags && fields.tags[0];
    const tags = tagsRaw ? JSON.parse(tagsRaw) : ["pvms"];

    const db = await getDb();
    const media = db.collection("media");
    const results = [];
    const errors = [];

    for (const file of fileList) {
      try {
        const buffer = fs.readFileSync(file.filepath);
        const mimeType = file.mimetype || "";
        const originalName = file.originalFilename || file.newFilename || "upload";
        const extension = originalName.split(".").pop() || "";
        const fileType = detectFileType(mimeType, extension);

        const validation = validateUpload({
          mimeType,
          size: buffer.length,
          originalName,
          fileType,
        });
        if (!validation.ok) {
          errors.push({ name: originalName, error: validation.error });
          continue;
        }

        const cloudResult = await uploadBuffer(buffer, {
          mimeType,
          extension,
          fileType,
          folder: folderOverride,
          tags,
        });

        const thumbnailUrl = buildThumbnailUrl(cloudResult.public_id, fileType, cloudResult.secure_url);
        const doc = buildMediaDoc(cloudResult, {
          originalName,
          fileName: originalName,
          mimeType,
          fileType,
          folder: folderOverride || cloudResult.folder,
          tags,
          uploadedBy,
          thumbnailUrl,
          size: buffer.length,
        });

        const insert = await media.insertOne(doc);
        results.push({ id: insert.insertedId, ...doc });
      } catch (e) {
        errors.push({ name: file.originalFilename || "file", error: e.message });
      } finally {
        try {
          fs.unlinkSync(file.filepath);
        } catch (_) {}
      }
    }

    return res.status(201).json({
      uploaded: results,
      errors,
      count: results.length,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
