const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("poseBoard", {
  selectFiles: () => ipcRenderer.invoke("select-files"),
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  getApiBase: () => ipcRenderer.invoke("get-api-base"),
  copyText: (text) => ipcRenderer.invoke("copy-text", text),
  copyImageFromFile: (filePath) => ipcRenderer.invoke("copy-image-from-file", filePath),
  showInFolder: (filePath) => ipcRenderer.invoke("show-in-folder", filePath),
  saveDataUrl: (fileName, dataUrl) => ipcRenderer.invoke("save-data-url", fileName, dataUrl),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke("set-always-on-top", flag),
  setMenuVisible: (visible) => ipcRenderer.invoke("set-menu-visible", visible),
  setMaximized: (flag) => ipcRenderer.invoke("set-maximized", flag),
  setFocusChrome: (flag) => ipcRenderer.invoke("set-focus-chrome", flag),
  setFullScreen: (flag) => ipcRenderer.invoke("set-full-screen", flag),
  windowMinimize: () => ipcRenderer.invoke("win-minimize"),
  windowMaximize: () => ipcRenderer.invoke("win-maximize"),
  windowClose: () => ipcRenderer.invoke("win-close"),
  windowIsMaximized: () => ipcRenderer.invoke("win-is-maximized"),
  onMaximizedChange: (cb) => {
    const listener = (_e, value) => cb(Boolean(value));
    ipcRenderer.on("win-maximized", listener);
    return () => ipcRenderer.removeListener("win-maximized", listener);
  },
});
