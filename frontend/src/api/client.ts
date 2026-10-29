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

type OverlayState = { locked?: boolean; opacity?: number; clickThrough?: boolean };

type WindowBridge = {
  setAlwaysOnTop?: (flag: boolean) => Promise<boolean>;
  setMenuVisible?: (visible: boolean) => Promise<boolean>;
  setMaximized?: (flag: boolean) => Promise<boolean>;
  setFocusChrome?: (flag: boolean) => Promise<boolean>;
  setFullScreen?: (flag: boolean) => Promise<boolean>;
  windowMinimize?: () => Promise<boolean>;
  windowMaximize?: () => Promise<boolean>;
  windowClose?: () => Promise<boolean>;
  windowIsMaximized?: () => Promise<boolean>;
  windowEnterFloat?: () => Promise<boolean | OverlayState>;
  windowLeaveFloat?: () => Promise<boolean>;
  windowToggleFloatHalf?: () => Promise<boolean>;
  windowLockPosition?: (flag: boolean) => Promise<boolean>;
  windowSetOpacity?: (value: number) => Promise<number>;
  windowSetClickThrough?: (flag: boolean) => Promise<boolean>;
  windowToggleTools?: () => Promise<boolean>;
  windowSetTools?: (flag: boolean) => Promise<boolean>;
  windowDragBegin?: () => Promise<boolean>;
  windowDragEnd?: () => Promise<boolean>;
  onMaximizedChange?: (cb: (value: boolean) => void) => () => void;
  onOverlayChange?: (cb: (value: OverlayState) => void) => () => void;
  onSoloStep?: (cb: (delta: number) => void) => () => void;
  onToolsChange?: (cb: (open: boolean) => void) => () => void;
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

export function hasWindowControls() {
  return Boolean(windowBridge().windowMinimize);
}

export async function windowMinimize() {
  const api = windowBridge();
  if (api.windowMinimize) await api.windowMinimize();
}

export async function windowToggleMax() {
  const api = windowBridge();
  if (api.windowMaximize) return Boolean(await api.windowMaximize());
  return false;
}

export async function windowClose() {
  const api = windowBridge();
  if (api.windowClose) await api.windowClose();
}

export function subscribeMaximized(cb: (value: boolean) => void) {
  const api = windowBridge();
  if (api.onMaximizedChange) return api.onMaximizedChange(cb);
  return () => undefined;
}

export async function windowIsMaximized() {
  const api = windowBridge();
  if (api.windowIsMaximized) return Boolean(await api.windowIsMaximized());
  return false;
}

export async function windowEnterFloat() {
  const api = windowBridge();
  if (api.windowEnterFloat) return Boolean(await api.windowEnterFloat());
  return false;
}

export async function windowLeaveFloat() {
  const api = windowBridge();
  if (api.windowLeaveFloat) return Boolean(await api.windowLeaveFloat());
  return false;
}

export async function windowToggleFloatHalf() {
  const api = windowBridge();
  if (api.windowToggleFloatHalf) return Boolean(await api.windowToggleFloatHalf());
  return false;
}

export async function windowLockPosition(flag: boolean) {
  const api = windowBridge();
  if (api.windowLockPosition) return Boolean(await api.windowLockPosition(flag));
  return flag;
}

export async function windowSetOpacity(value: number) {
  const api = windowBridge();
  if (api.windowSetOpacity) return Number(await api.windowSetOpacity(value));
  return value;
}

export async function windowSetClickThrough(flag: boolean) {
  const api = windowBridge();
  if (api.windowSetClickThrough) return Boolean(await api.windowSetClickThrough(flag));
  return flag;
}

export function subscribeOverlay(cb: (value: OverlayState) => void) {
  const api = windowBridge();
  if (api.onOverlayChange) return api.onOverlayChange(cb);
  return () => undefined;
}

export function subscribeSoloStep(cb: (delta: number) => void) {
  const api = windowBridge();
  if (api.onSoloStep) return api.onSoloStep(cb);
  return () => undefined;
}

export async function windowToggleTools() {
  const api = windowBridge();
  if (api.windowToggleTools) return Boolean(await api.windowToggleTools());
  return null;
}

export async function windowSetTools(flag: boolean) {
  const api = windowBridge();
  if (api.windowSetTools) return Boolean(await api.windowSetTools(flag));
  return flag;
}

export async function windowDragBegin() {
  const api = windowBridge();
  if (api.windowDragBegin) return Boolean(await api.windowDragBegin());
  return false;
}

export async function windowDragEnd() {
  const api = windowBridge();
  if (api.windowDragEnd) await api.windowDragEnd();
}

export function subscribeTools(cb: (open: boolean) => void) {
  const api = windowBridge();
  if (api.onToolsChange) return api.onToolsChange(cb);
  return () => undefined;
}
