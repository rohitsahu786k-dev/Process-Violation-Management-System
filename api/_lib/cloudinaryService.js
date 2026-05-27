const cloudinary = require("cloudinary").v2;

function ensureConfig() {
  if (!process.env.CLOUDINARY_URL) throw new Error("CLOUDINARY_URL is not configured");
}

function folderForType(fileType) {
  const map = {
    image: "pvms/images",
    video: "pvms/videos",
    document: "pvms/documents",
    raw: "pvms/documents",
  };
  return map[fileType] || "pvms/documents";
}

function detectFileType(mimeType = "", extension = "") {
  const ext = extension.toLowerCase().replace(/^\./, "");
  const mime = mimeType.toLowerCase();
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "svg", "gif", "avif"].includes(ext)) {
    return "image";
  }
  if (mime.startsWith("video/") || ["mp4", "mov", "avi", "webm"].includes(ext)) {
    return "video";
  }
  return "document";
}

function buildThumbnailUrl(publicId, fileType, secureUrl) {
  if (fileType === "image") {
    return cloudinary.url(publicId, {
      secure: true,
      transformation: [{ width: 320, height: 240, crop: "fill", quality: "auto", fetch_format: "auto" }],
    });
  }
  if (fileType === "video") {
    return cloudinary.url(publicId, {
      secure: true,
      resource_type: "video",
      transformation: [{ width: 320, height: 240, crop: "fill", quality: "auto" }],
      format: "jpg",
    });
  }
  if (fileType === "document") {
    const ext = (secureUrl || "").split(".").pop()?.toLowerCase();
    if (ext === "pdf") {
      return cloudinary.url(publicId, {
        secure: true,
        resource_type: "image",
        format: "jpg",
        transformation: [{ page: 1, width: 320, crop: "scale" }],
      });
    }
  }
  return secureUrl;
}

async function uploadBuffer(buffer, options = {}) {
  ensureConfig();
  const fileType = options.fileType || detectFileType(options.mimeType, options.extension);
  const folder = options.folder || folderForType(fileType);
  const resourceType = fileType === "video" ? "video" : fileType === "image" ? "image" : "raw";

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        use_filename: true,
        unique_filename: true,
        overwrite: false,
        tags: options.tags || ["pvms"],
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

async function deleteFromCloudinary(publicId, resourceType = "image") {
  ensureConfig();
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

async function renameOnCloudinary(publicId, newPublicId, resourceType = "image") {
  ensureConfig();
  return cloudinary.uploader.rename(publicId, newPublicId, { resource_type: resourceType });
}

module.exports = {
  ensureConfig,
  uploadBuffer,
  deleteFromCloudinary,
  renameOnCloudinary,
  detectFileType,
  folderForType,
  buildThumbnailUrl,
};
