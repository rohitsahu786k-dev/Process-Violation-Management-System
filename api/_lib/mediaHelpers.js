const LIMITS = {
  image: 10 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  document: 25 * 1024 * 1024,
};

const ALLOWED = {
  image: ["image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/gif", "image/avif"],
  video: ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"],
  document: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
  ],
};

const BLOCKED_EXT = [".exe", ".bat", ".cmd", ".sh", ".msi", ".dll", ".js", ".html", ".php"];

function validateUpload({ mimeType, size, originalName, fileType }) {
  const ext = "." + (originalName || "").split(".").pop()?.toLowerCase();
  if (BLOCKED_EXT.includes(ext)) {
    return { ok: false, error: "Executable or script files are not allowed" };
  }
  const limit = LIMITS[fileType] || LIMITS.document;
  if (size > limit) {
    const mb = Math.round(limit / (1024 * 1024));
    return { ok: false, error: `File exceeds ${mb}MB limit for ${fileType}s` };
  }
  const allowed = ALLOWED[fileType] || ALLOWED.document;
  if (mimeType && !allowed.includes(mimeType) && fileType !== "document") {
    return { ok: false, error: `MIME type ${mimeType} is not allowed` };
  }
  return { ok: true };
}

function cloudinaryResourceType(fileType) {
  if (fileType === "video") return "video";
  if (fileType === "image") return "image";
  return "raw";
}

function buildMediaDoc(result, meta = {}) {
  const fileType = meta.fileType || "image";
  const extension = (meta.originalName || "").split(".").pop()?.toLowerCase() || "";
  return {
    fileName: meta.fileName || result.original_filename || result.public_id.split("/").pop(),
    originalName: meta.originalName || result.original_filename || "",
    publicId: result.public_id,
    url: result.url,
    secureUrl: result.secure_url,
    thumbnailUrl: meta.thumbnailUrl || result.secure_url,
    fileType,
    mimeType: meta.mimeType || "",
    extension,
    size: result.bytes || meta.size || 0,
    width: result.width || null,
    height: result.height || null,
    duration: result.duration || null,
    folder: meta.folder || result.folder || "",
    tags: meta.tags || [],
    uploadedBy: meta.uploadedBy || "system",
    isFavorite: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function parseListQuery(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 24));
  const skip = (page - 1) * limit;
  const filter = { deletedAt: null };

  if (query.type && query.type !== "all") filter.fileType = query.type;
  if (query.folder) filter.folder = query.folder;
  if (query.favorites === "true") filter.isFavorite = true;
  if (query.search) {
    const re = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ fileName: re }, { originalName: re }, { tags: re }];
  }

  let sort = { createdAt: -1 };
  if (query.sort === "oldest") sort = { createdAt: 1 };
  else if (query.sort === "name") sort = { fileName: 1 };
  else if (query.sort === "size") sort = { size: -1 };
  else if (query.sort === "type") sort = { fileType: 1, createdAt: -1 };

  return { filter, sort, page, limit, skip };
}

module.exports = {
  LIMITS,
  validateUpload,
  cloudinaryResourceType,
  buildMediaDoc,
  parseListQuery,
};
