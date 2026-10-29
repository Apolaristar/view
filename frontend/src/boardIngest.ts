export type ImportUrlKind = "image" | "page" | "none";

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif)(\?|$)/i;

export function classifyImportUrl(raw: string): ImportUrlKind {
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

export function urlsFromDropText(raw: string): string[] {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

export function isDropImageFile(file: { type?: string; name?: string }): boolean {
  if (file.type && file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name || "");
}

export function nativeFilePath(file: File): string {
  return String((file as File & { path?: string }).path || "");
}

export function isIngestableFile(file: File): boolean {
  if (isDropImageFile(file)) return true;
  const p = nativeFilePath(file);
  if (!p) return false;
  if (IMAGE_EXT.test(p) || IMAGE_EXT.test(file.name || "")) return true;
  return !file.type && !/\.[a-z0-9]{1,8}$/i.test(file.name || "");
}

export type TrayDropImage = {
  id: number;
  original_url: string;
  thumbnail_url: string;
  width?: number;
  height?: number;
};

export type BoardDropPlan =
  | { kind: "files" }
  | { kind: "tray"; image: TrayDropImage }
  | { kind: "urls"; urls: string[] }
  | { kind: "page" }
  | { kind: "none" };

export function parseTrayPayload(raw: string): TrayDropImage | null {
  const s = String(raw || "").trim();
  if (!s || s.startsWith("layer:")) return null;
  try {
    const image = JSON.parse(s) as TrayDropImage;
    if (!image || !Number.isFinite(Number(image.id))) return null;
    return image;
  } catch {
    return null;
  }
}

export function planBoardDrop(input: { hasImageFiles?: boolean; json?: string; text?: string }): BoardDropPlan {
  if (input.hasImageFiles) return { kind: "files" };
  const tray = parseTrayPayload(input.json || "") || parseTrayPayload(input.text || "");
  if (tray) return { kind: "tray", image: tray };
  const urls = urlsFromDropText(input.text || "");
  const kinds = urls.map(classifyImportUrl);
  const imageUrls = urls.filter((_, i) => kinds[i] === "image");
  if (imageUrls.length) return { kind: "urls", urls: imageUrls };
  if (kinds.some((k) => k === "page")) return { kind: "page" };
  return { kind: "none" };
}

export function filesFromDataTransfer(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  const listed = Array.from(data.files || []).filter(isIngestableFile);
  if (listed.length) return listed;
  const fromItems: File[] = [];
  for (const item of Array.from(data.items || [])) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file && isIngestableFile(file)) fromItems.push(file);
  }
  return fromItems;
}
