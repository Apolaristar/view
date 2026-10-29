const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif)(\?|$)/i;

function classifyImportUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "none";
  if (/^data:image\//i.test(s)) return "image";
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "none";
    if (IMAGE_EXT.test(u.pathname)) return "image";
    return "page";
  } catch {
    return "none";
  }
}

function imageExtFrom(url, contentType) {
  const type = String(contentType || "").toLowerCase();
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  if (type.includes("gif")) return ".gif";
  if (type.includes("bmp")) return ".bmp";
  if (type.includes("jpeg") || type.includes("jpg")) return ".jpg";
  const m = String(url || "").match(/\.(jpe?g|png|webp|gif|bmp|avif)(\?|$)/i);
  if (!m) return ".png";
  const ext = m[1].toLowerCase();
  if (ext === "jpeg" || ext === "jpg") return ".jpg";
  return `.${ext}`;
}

function urlsFromDropText(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

module.exports = { classifyImportUrl, imageExtFrom, urlsFromDropText };
