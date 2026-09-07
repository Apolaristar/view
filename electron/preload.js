const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("poseBoard", {
  selectFiles: () => ipcRenderer.invoke("select-files"),
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  getApiBase: () => ipcRenderer.invoke("get-api-base"),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke("set-always-on-top", flag),
  setMenuVisible: (visible) => ipcRenderer.invoke("set-menu-visible", visible),
  setMaximized: (flag) => ipcRenderer.invoke("set-maximized", flag),
  setFocusChrome: (flag) => ipcRenderer.invoke("set-focus-chrome", flag),
  setFullScreen: (flag) => ipcRenderer.invoke("set-full-screen", flag),
});
