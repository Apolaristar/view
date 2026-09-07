const { app, BrowserWindow, dialog, ipcMain, Menu } = require("electron");
const { spawn } = require("child_process");
const net = require("net");
const path = require("path");
const http = require("http");

let mainWindow = null;
let backendProcess = null;
let backendPort = null;

function pickPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function waitHealth(port, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/health", timeout: 1000 }, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (Date.now() - started > timeoutMs) {
          reject(new Error("backend health timeout"));
        } else {
          setTimeout(tick, 300);
        }
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error("backend health timeout"));
        } else {
          setTimeout(tick, 300);
        }
      });
    };
    tick();
  });
}

function killBackend() {
  if (!backendProcess) return;
  const pid = backendProcess.pid;
  backendProcess = null;
  if (process.platform === "win32" && pid) {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"]);
  } else if (pid) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (_) {
      /* already gone */
    }
  }
}

async function startBackend() {
  backendPort = process.env.POSEBOARD_PORT ? Number(process.env.POSEBOARD_PORT) : await pickPort();
  const env = { ...process.env, POSEBOARD_PORT: String(backendPort) };
  if (app.isPackaged) {
    const exe = path.join(process.resourcesPath, "backend.exe");
    backendProcess = spawn(exe, ["--port", String(backendPort)], { env, stdio: "pipe" });
  } else {
    const python = path.join(__dirname, "..", ".venv", "Scripts", "python.exe");
    const mainPy = path.join(__dirname, "..", "backend", "main.py");
    backendProcess = spawn(
      python,
      ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", String(backendPort)],
      { env, cwd: path.join(__dirname, "..", "backend"), stdio: "pipe" }
    );
  }
  backendProcess.on("exit", () => {
    backendProcess = null;
  });
  await waitHealth(backendPort);
  return backendPort;
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "姿态图库",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    dialog.showErrorBox("页面加载失败", `${desc} (${code})\n${url || ""}`);
  });
  const apiBase = `http://127.0.0.1:${port}`;
  if (app.isPackaged) {
    const html = path.join(__dirname, "..", "frontend", "dist", "index.html");
    mainWindow.loadFile(html, { query: { api: apiBase } });
  } else {
    mainWindow.loadURL(`http://127.0.0.1:5173?api=${encodeURIComponent(apiBase)}`);
  }
}

ipcMain.handle("select-files", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择图片",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "图片", extensions: ["jpg", "jpeg", "png", "webp"] }],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择图片文件夹",
    properties: ["openDirectory"],
    buttonLabel: "导入此文件夹",
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle("get-api-base", () => `http://127.0.0.1:${backendPort}`);

ipcMain.handle("set-always-on-top", (_e, flag) => {
  if (!mainWindow) return false;
  mainWindow.setAlwaysOnTop(Boolean(flag));
  return mainWindow.isAlwaysOnTop();
});

ipcMain.handle("set-focus-chrome", (_e, flag) => {
  if (!mainWindow) return false;
  const on = Boolean(flag);
  if (on) {
    mainWindow.setMenuBarVisibility(false);
    mainWindow.setAutoHideMenuBar(true);
  } else {
    if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
    mainWindow.setAutoHideMenuBar(true);
    mainWindow.setMenuBarVisibility(false);
  }
  return on;
});

ipcMain.handle("set-full-screen", (_e, flag) => {
  if (!mainWindow) return false;
  mainWindow.setFullScreen(Boolean(flag));
  return mainWindow.isFullScreen();
});

ipcMain.handle("set-menu-visible", () => {
  if (!mainWindow) return false;
  mainWindow.setMenuBarVisibility(false);
  return true;
});

ipcMain.handle("set-maximized", (_e, flag) => {
  if (!mainWindow) return false;
  if (flag) mainWindow.maximize();
  else if (mainWindow.isMaximized()) mainWindow.unmaximize();
  return mainWindow.isMaximized();
});

function applyAppName() {
  app.setName("姿态图库");
  Menu.setApplicationMenu(null);
}

app.whenReady().then(async () => {
  applyAppName();
  try {
    const devPort = 5178;
    try {
      await waitHealth(devPort, 2000);
      backendPort = devPort;
    } catch {
      await startBackend();
    }
    createWindow(backendPort);
  } catch (err) {
    dialog.showErrorBox("启动失败", String(err && err.message ? err.message : err));
    app.quit();
  }
});

app.on("window-all-closed", () => {
  killBackend();
  app.quit();
});

app.on("before-quit", killBackend);
