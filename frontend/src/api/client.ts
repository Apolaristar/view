type ApiEnvelope<T> = { code: number; data: T; msg: string };

function fromQuery(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("api") || "";
}

export async function apiBase(): Promise<string> {
  const w = window as unknown as { poseBoard?: { getApiBase: () => Promise<string> } };
  if (w.poseBoard?.getApiBase) {
    return w.poseBoard.getApiBase();
  }
  return fromQuery();
}

let cachedBase: string | null = null;

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (cachedBase === null) {
    cachedBase = await apiBase();
  }
  const res = await fetch(`${cachedBase}${path}`, init);
  const body = (await res.json()) as ApiEnvelope<T> & { detail?: unknown };
  if (!res.ok || (body.code !== undefined && body.code !== 0)) {
    const detail = typeof body.detail === "string" ? body.detail : "";
    throw new Error(body.msg || detail || "请求失败");
  }
  return body.data;
}

export async function ensureApiBase(): Promise<string> {
  if (!cachedBase) {
    cachedBase = (await apiBase()) || fromQuery();
  }
  return cachedBase || "";
}

export function mediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const base = cachedBase || fromQuery();
  return `${base}${path}`;
}

export async function selectLocalPaths(): Promise<string[]> {
  const w = window as unknown as {
    poseBoard?: { selectFiles: () => Promise<string[]>; selectFolder: () => Promise<string[]> };
  };
  if (!w.poseBoard) return [];
  return w.poseBoard.selectFiles();
}

export async function selectLocalFolder(): Promise<string[]> {
  const w = window as unknown as { poseBoard?: { selectFolder: () => Promise<string[]> } };
  if (!w.poseBoard) return [];
  return w.poseBoard.selectFolder();
}

type WindowBridge = {
  setAlwaysOnTop?: (flag: boolean) => Promise<boolean>;
  setMenuVisible?: (visible: boolean) => Promise<boolean>;
  setMaximized?: (flag: boolean) => Promise<boolean>;
  setFocusChrome?: (flag: boolean) => Promise<boolean>;
  setFullScreen?: (flag: boolean) => Promise<boolean>;
};

function windowBridge(): WindowBridge {
  return (window as unknown as { poseBoard?: WindowBridge }).poseBoard || {};
}

export async function setAlwaysOnTop(flag: boolean): Promise<boolean> {
  const api = windowBridge();
  if (!api.setAlwaysOnTop) return flag;
  return Boolean(await api.setAlwaysOnTop(flag));
}

export async function setMenuVisible(visible: boolean): Promise<void> {
  const api = windowBridge();
  if (api.setMenuVisible) await api.setMenuVisible(visible);
}

export async function setMaximized(flag: boolean): Promise<boolean> {
  const api = windowBridge();
  if (!api.setMaximized) return flag;
  return Boolean(await api.setMaximized(flag));
}

export async function setFocusChrome(flag: boolean): Promise<void> {
  const api = windowBridge();
  if (api.setFocusChrome) await api.setFocusChrome(flag);
  else await setMenuVisible(!flag);
}

export async function setFullScreen(flag: boolean): Promise<boolean> {
  const api = windowBridge();
  if (!api.setFullScreen) return flag;
  return Boolean(await api.setFullScreen(flag));
}
