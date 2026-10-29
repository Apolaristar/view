type PoseBoard = {
  copyText?: (text: string) => Promise<boolean>;
  copyImageFromFile?: (filePath: string) => Promise<boolean>;
  showInFolder?: (filePath: string) => Promise<boolean>;
  saveDataUrl?: (fileName: string, dataUrl: string, title?: string) => Promise<boolean>;
  captureScreenshot?: () => Promise<{ ok?: boolean; path?: string; canceled?: boolean; error?: string }>;
  cancelScreenshot?: () => Promise<boolean>;
  writeTempDataUrl?: (dataUrl: string) => Promise<{ ok?: boolean; path?: string; error?: string }>;
  capturePageRect?: (rect: { x: number; y: number; width: number; height: number }) => Promise<{ ok?: boolean; dataUrl?: string; error?: string }>;
  clipboardIngest?: () => Promise<{ ok?: boolean; kind?: string; path?: string; text?: string; error?: string }>;
  downloadImageUrl?: (url: string) => Promise<{ ok?: boolean; path?: string; error?: string }>;
};

function bridge(): PoseBoard {
  return (window as unknown as { poseBoard?: PoseBoard }).poseBoard || {};
}

export async function copyText(text: string) {
  const api = bridge();
  if (api.copyText) {
    await api.copyText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}

export async function copyImageFromFile(filePath: string) {
  const api = bridge();
  if (!api.copyImageFromFile) throw new Error("仅桌面应用支持复制原图");
  const ok = await api.copyImageFromFile(filePath);
  if (!ok) throw new Error("复制原图失败");
}

export async function showInFolder(filePath: string) {
  const api = bridge();
  if (!api.showInFolder) throw new Error("仅桌面应用支持打开文件夹");
  const ok = await api.showInFolder(filePath);
  if (!ok) throw new Error("找不到原文件");
}

export async function saveDataUrl(fileName: string, dataUrl: string, title = "导出图片") {
  const api = bridge();
  if (api.saveDataUrl) {
    return Boolean(await api.saveDataUrl(fileName, dataUrl, title));
  }
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName;
  a.click();
  return true;
}

export async function captureScreenshot() {
  const api = bridge();
  if (!api.captureScreenshot) throw new Error("仅桌面应用支持截图");
  return api.captureScreenshot();
}

export async function cancelScreenshot() {
  const api = bridge();
  if (api.cancelScreenshot) await api.cancelScreenshot();
}

export async function writeTempDataUrl(dataUrl: string) {
  const api = bridge();
  if (!api.writeTempDataUrl) throw new Error("仅桌面应用支持截图");
  return api.writeTempDataUrl(dataUrl);
}

export async function capturePageRect(rect: { x: number; y: number; width: number; height: number }) {
  const api = bridge();
  if (!api.capturePageRect) throw new Error("仅桌面应用支持截图");
  const shot = await api.capturePageRect(rect);
  if (!shot?.ok || !shot.dataUrl) throw new Error(shot?.error || "截取预览失败");
  return shot.dataUrl;
}

export async function clipboardIngest() {
  const api = bridge();
  if (!api.clipboardIngest) return { ok: false as const, error: "仅桌面应用支持粘贴图片" };
  return api.clipboardIngest();
}

export async function downloadImageUrl(url: string) {
  const api = bridge();
  if (!api.downloadImageUrl) throw new Error("仅桌面应用支持下载图片链接");
  const saved = await api.downloadImageUrl(url);
  if (!saved?.ok || !saved.path) throw new Error(saved?.error || "下载失败");
  return saved.path;
}
