import { request } from "./api/client";
import { captureScreenshot, writeTempDataUrl } from "./desktop";
import { imageIdFromImport, imageIdsFromImport } from "./importResult";
import type { ImageItem } from "./types";

export class ScreenshotCanceledError extends Error {
  canceled = true;
  constructor(message: string) {
    super(message);
    this.name = "ScreenshotCanceledError";
  }
}

export function isScreenshotHotkey(e: KeyboardEvent): boolean {
  if (e.repeat) return false;
  if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return false;
  return e.code === "KeyS";
}

export function isEditableHotkeyTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
  return Boolean(target instanceof HTMLElement && target.isContentEditable);
}

export async function importImageFromPath(
  filePath: string,
  options?: { extract?: boolean; inLibrary?: boolean }
): Promise<ImageItem> {
  const extract = options?.extract !== false;
  const inLibrary = options?.inLibrary !== false;
  const imported = await request<{ imported?: { id?: number }[]; skipped?: { image_id?: number }[] }>("/api/v1/images/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths: [filePath], in_library: inLibrary }),
  });
  const imageId = imageIdFromImport(imported);
  if (!imageId) throw new Error("截图未能保存");
  if (!extract) return request<ImageItem>(`/api/v1/images/${imageId}`);
  return request<ImageItem>(`/api/v1/images/${imageId}/reprocess`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pose: true, color: true }),
  });
}

export async function importImagesFromPaths(paths: string[]): Promise<{ items: ImageItem[]; failed: number }> {
  if (!paths.length) return { items: [], failed: 0 };
  const imported = await request<{
    imported?: { id?: number }[];
    skipped?: { image_id?: number }[];
    failed?: unknown[];
    failed_count?: number;
  }>("/api/v1/images/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths, in_library: true }),
  });
  const ids = imageIdsFromImport(imported);
  const items: ImageItem[] = [];
  for (const id of ids) {
    items.push(await request<ImageItem>(`/api/v1/images/${id}`));
  }
  return { items, failed: Number(imported.failed_count) || imported.failed?.length || 0 };
}

export async function importCroppedDataUrl(
  dataUrl: string,
  options?: { extract?: boolean; inLibrary?: boolean }
): Promise<ImageItem> {
  const saved = await writeTempDataUrl(dataUrl);
  if (!saved?.ok || !saved.path) throw new Error(saved?.error || "截图未能保存");
  return importImageFromPath(saved.path, options);
}

export async function importScreenshotImage(): Promise<ImageItem> {
  const shot = await captureScreenshot();
  if (!shot?.ok || !shot.path) {
    if (shot?.error) throw new ScreenshotCanceledError("打不开系统截图");
    throw new ScreenshotCanceledError("已取消截图");
  }
  return importImageFromPath(shot.path, { extract: false, inLibrary: false });
}
