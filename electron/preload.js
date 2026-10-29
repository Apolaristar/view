const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("poseBoard", {
  selectFiles: () => ipcRenderer.invoke("select-files"),
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  getApiBase: () => ipcRenderer.invoke("get-api-base"),
  copyText: (text) => ipcRenderer.invoke("copy-text", text),
  copyImageFromFile: (filePath) => ipcRenderer.invoke("copy-image-from-file", filePath),
  showInFolder: (filePath) => ipcRenderer.invoke("show-in-folder", filePath),
  saveDataUrl: (fileName, dataUrl, title) => ipcRenderer.invoke("save-data-url", fileName, dataUrl, title),
  captureScreenshot: () => ipcRenderer.invoke("capture-screenshot"),
  cancelScreenshot: () => ipcRenderer.invoke("cancel-screenshot"),
  writeTempDataUrl: (dataUrl) => ipcRenderer.invoke("write-temp-data-url", dataUrl),
  clipboardIngest: () => ipcRenderer.invoke("clipboard-ingest"),
  downloadImageUrl: (url) => ipcRenderer.invoke("download-image-url", url),
  capturePageRect: (rect) => ipcRenderer.invoke("capture-page-rect", rect),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke("set-always-on-top", flag),
  setMenuVisible: (visible) => ipcRenderer.invoke("set-menu-visible", visible),
  setMaximized: (flag) => ipcRenderer.invoke("set-maximized", flag),
  setFocusChrome: (flag) => ipcRenderer.invoke("set-focus-chrome", flag),
  setFullScreen: (flag) => ipcRenderer.invoke("set-full-screen", flag),
  windowMinimize: () => ipcRenderer.invoke("win-minimize"),
  windowMaximize: () => ipcRenderer.invoke("win-maximize"),
  windowClose: () => ipcRenderer.invoke("win-close"),
  windowIsMaximized: () => ipcRenderer.invoke("win-is-maximized"),
  windowEnterFloat: () => ipcRenderer.invoke("win-enter-float"),
  windowLeaveFloat: () => ipcRenderer.invoke("win-leave-float"),
  windowToggleFloatHalf: () => ipcRenderer.invoke("win-toggle-float-half"),
  windowLockPosition: (flag) => ipcRenderer.invoke("win-lock-position", flag),
  windowSetOpacity: (value) => ipcRenderer.invoke("win-set-opacity", value),
  windowSetClickThrough: (flag) => ipcRenderer.invoke("win-set-click-through", flag),
  windowToggleTools: () => ipcRenderer.invoke("win-toggle-tools"),
  windowSetTools: (flag) => ipcRenderer.invoke("win-set-tools", flag),
  windowDragBegin: () => ipcRenderer.invoke("win-drag-begin"),
  windowDragEnd: () => ipcRenderer.invoke("win-drag-end"),
  onMaximizedChange: (cb) => {
    const listener = (_e, value) => cb(Boolean(value));
    ipcRenderer.on("win-maximized", listener);
    return () => ipcRenderer.removeListener("win-maximized", listener);
  },
  onOverlayChange: (cb) => {
    const listener = (_e, value) => cb(value || {});
    ipcRenderer.on("win-overlay", listener);
    return () => ipcRenderer.removeListener("win-overlay", listener);
  },
  onSoloStep: (cb) => {
    const listener = (_e, delta) => cb(Number(delta) || 1);
    ipcRenderer.on("win-solo-step", listener);
    return () => ipcRenderer.removeListener("win-solo-step", listener);
  },
  onToolsChange: (cb) => {
    const listener = (_e, value) => cb(Boolean(value));
    ipcRenderer.on("win-tools", listener);
    return () => ipcRenderer.removeListener("win-tools", listener);
  },
});
