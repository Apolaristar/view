type PoseBoard = {
  copyText?: (text: string) => Promise<boolean>;
  copyImageFromFile?: (filePath: string) => Promise<boolean>;
  showInFolder?: (filePath: string) => Promise<boolean>;
  saveDataUrl?: (fileName: string, dataUrl: string) => Promise<boolean>;
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

export async function saveDataUrl(fileName: string, dataUrl: string) {
  const api = bridge();
  if (api.saveDataUrl) {
    return Boolean(await api.saveDataUrl(fileName, dataUrl));
  }
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName;
  a.click();
  return true;
}
