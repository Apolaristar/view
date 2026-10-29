const { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeImage, net: electronNet, screen, shell } = require("electron");
const { spawn } = require("child_process");
const net = require("net");
const path = require("path");
const http = require("http");
const fs = require("fs");
const os = require("os");
const { clampBounds, defaultFloatBounds, isTopHalf, topHalfBounds, MIN_W, MIN_H } = require("./floatBounds");
const { clampOpacity, CLICK_THROUGH_ACCEL, TOOLS_ACCEL, SOLO_NEXT_ACCEL, SOLO_PREV_ACCEL } = require("./floatOverlay");
const { classifyImportUrl, imageExtFrom } = require("./imageUrl");

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
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(() => finish(new Error("后台启动超时")), timeoutMs);
    const tick = () => {
      if (settled) return;
      const req = http.get({ host: "127.0.0.1", port, path: "/health", timeout: 1000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) finish();
        else setTimeout(tick, 300);
      });
      req.on("timeout", () => req.destroy());
      req.on("error", () => {
        if (!settled) setTimeout(tick, 300);
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
  const logPath = path.join(app.getPath("userData"), "backend.log");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logStream = fs.createWriteStream(logPath);
  const healthMs = app.isPackaged ? 90000 : 30000;
  if (app.isPackaged) {
    const exe = path.join(process.resourcesPath, "backend.exe");
    if (!fs.existsSync(exe)) {
      throw new Error(`找不到后台程序：${exe}`);
    }
    backendProcess = spawn(exe, ["--port", String(backendPort)], {
      env,
      cwd: path.dirname(exe),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } else {
    const python = path.join(__dirname, "..", ".venv", "Scripts", "python.exe");
    backendProcess = spawn(
      python,
      ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", String(backendPort), "--reload"],
      { env, cwd: path.join(__dirname, "..", "backend"), stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
    );
  }
  if (backendProcess.stdout) backendProcess.stdout.pipe(logStream);
  if (backendProcess.stderr) backendProcess.stderr.pipe(logStream);
  let ready = false;
  try {
    await new Promise((resolve, reject) => {
      const finish = (err) => {
        if (ready) return;
        ready = true;
        if (err) reject(err);
        else resolve();
      };
      backendProcess.once("error", finish);
      backendProcess.once("exit", (code) => {
        backendProcess = null;
        let tail = "";
        try {
          tail = fs.readFileSync(logPath, "utf8").trim().slice(-800);
        } catch {
          /* ignore */
        }
        finish(new Error(tail || `后台进程退出 ${code}`));
      });
      waitHealth(backendPort, healthMs).then(() => finish(), finish);
    });
  } catch (err) {
    killBackend();
    throw err;
  }
  return backendPort;
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "姿态图库",
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  const sendMax = () => {
    if (!mainWindow) return;
    mainWindow.webContents.send("win-maximized", mainWindow.isMaximized() || mainWindow.isFullScreen());
  };
  mainWindow.on("maximize", sendMax);
  mainWindow.on("unmaximize", sendMax);
  mainWindow.on("enter-full-screen", sendMax);
  mainWindow.on("leave-full-screen", sendMax);
  mainWindow.on("move", scheduleSaveFloat);
  mainWindow.on("resize", scheduleSaveFloat);
  mainWindow.on("focus", () => {
    if (!clickThrough || toolsOpen) return;
    const p = screen.getCursorScreenPoint();
    const b = mainWindow.getBounds();
    const over =
      p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
    if (over) return;
    applyClickThrough(false);
    sendOverlay();
  });
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

const MAIN_MIN_W = 1024;
const MAIN_MIN_H = 640;
let floatMode = false;
let savedMainWindow = null;
let floatSaveTimer = null;
let floatLocked = false;
let floatOpacity = 1;
let clickThrough = false;
let toolsOpen = false;
let windowDragWatch = null;
let windowDragOrigin = null;

function floatFile() {
  return path.join(app.getPath("userData"), "float-window.json");
}

function overlayState() {
  return { locked: floatLocked, opacity: floatOpacity, clickThrough };
}

function sendOverlay() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("win-overlay", overlayState());
  }
}

function applyOpacity(value) {
  floatOpacity = clampOpacity(value);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setOpacity(floatOpacity);
  return floatOpacity;
}

function endWindowDrag() {
  if (windowDragWatch) {
    clearInterval(windowDragWatch);
    windowDragWatch = null;
  }
  windowDragOrigin = null;
}

function beginWindowDrag() {
  if (!mainWindow || mainWindow.isDestroyed() || !floatMode || floatLocked) return false;
  const p = screen.getCursorScreenPoint();
  const b = mainWindow.getBounds();
  windowDragOrigin = { cx: p.x, cy: p.y, x: b.x, y: b.y, width: b.width, height: b.height };
  if (windowDragWatch) clearInterval(windowDragWatch);
  windowDragWatch = setInterval(() => {
    if (!windowDragOrigin || !mainWindow || mainWindow.isDestroyed()) return;
    const cur = screen.getCursorScreenPoint();
    const x = Math.round(windowDragOrigin.x + cur.x - windowDragOrigin.cx);
    const y = Math.round(windowDragOrigin.y + cur.y - windowDragOrigin.cy);
    mainWindow.setBounds(
      { x, y, width: windowDragOrigin.width, height: windowDragOrigin.height },
      false
    );
  }, 16);
  return true;
}

function applyLock(flag) {
  floatLocked = Boolean(flag);
  if (floatLocked) endWindowDrag();
  if (!mainWindow || mainWindow.isDestroyed()) return floatLocked;
  mainWindow.setMovable(!floatLocked);
  if (floatMode) mainWindow.setResizable(!floatLocked);
  return floatLocked;
}

function bindFloatShortcuts() {
  const accels = [CLICK_THROUGH_ACCEL, TOOLS_ACCEL, SOLO_NEXT_ACCEL, SOLO_PREV_ACCEL];
  for (const accel of accels) {
    try {
      globalShortcut.unregister(accel);
    } catch {
      /* ignore */
    }
  }
  if (!floatMode) return;
  try {
    globalShortcut.register(CLICK_THROUGH_ACCEL, () => {
      applyClickThrough(!clickThrough);
      sendOverlay();
    });
    globalShortcut.register(TOOLS_ACCEL, () => {
      setToolsOpen(!toolsOpen);
    });
    globalShortcut.register(SOLO_NEXT_ACCEL, () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("win-solo-step", 1);
    });
    globalShortcut.register(SOLO_PREV_ACCEL, () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("win-solo-step", -1);
    });
  } catch {
    /* ignore */
  }
}

function applyMouseIgnore() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setIgnoreMouseEvents(clickThrough && !toolsOpen);
}

function setToolsOpen(flag) {
  toolsOpen = Boolean(flag);
  applyMouseIgnore();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("win-tools", toolsOpen);
  }
  return toolsOpen;
}

function applyClickThrough(flag) {
  clickThrough = Boolean(flag);
  if (!mainWindow || mainWindow.isDestroyed()) return clickThrough;
  if (clickThrough) mainWindow.setAlwaysOnTop(true);
  applyMouseIgnore();
  return clickThrough;
}

function resetOverlay() {
  endWindowDrag();
  setToolsOpen(false);
  applyClickThrough(false);
  applyLock(false);
  applyOpacity(1);
  bindFloatShortcuts();
}

function workAreaFor(bounds) {
  const display = bounds ? screen.getDisplayMatching(bounds) : screen.getPrimaryDisplay();
  return display.workArea;
}

function readSavedFloat() {
  try {
    const raw = JSON.parse(fs.readFileSync(floatFile(), "utf8"));
    if (raw && typeof raw.opacity !== "undefined") floatOpacity = clampOpacity(raw.opacity);
    if (raw && raw.width && raw.height) return clampBounds(raw, workAreaFor(raw));
  } catch {
    /* ignore */
  }
  return defaultFloatBounds(screen.getPrimaryDisplay().workArea);
}

function writeSavedFloat(bounds) {
  try {
    fs.writeFileSync(
      floatFile(),
      JSON.stringify({ ...clampBounds(bounds, workAreaFor(bounds)), opacity: floatOpacity })
    );
  } catch {
    /* ignore */
  }
}

function currentBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  return mainWindow.getBounds();
}

function scheduleSaveFloat() {
  if (!floatMode || !mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isFullScreen() || mainWindow.isMaximized()) return;
  const bounds = currentBounds();
  if (!bounds) return;
  if (isTopHalf(bounds, workAreaFor(bounds))) return;
  if (floatSaveTimer) clearTimeout(floatSaveTimer);
  floatSaveTimer = setTimeout(() => writeSavedFloat(bounds), 280);
}

function enterFloatWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (floatMode) return overlayState();
  savedMainWindow = {
    bounds: mainWindow.getNormalBounds(),
    maximized: mainWindow.isMaximized(),
    fullScreen: mainWindow.isFullScreen(),
  };
  if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  mainWindow.setMinimumSize(MIN_W, MIN_H);
  mainWindow.setResizable(true);
  mainWindow.setBounds(readSavedFloat());
  applyLock(false);
  applyClickThrough(false);
  setToolsOpen(false);
  applyOpacity(floatOpacity);
  floatMode = true;
  bindFloatShortcuts();
  sendOverlay();
  return overlayState();
}

function leaveFloatWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (!floatMode) return true;
  const bounds = currentBounds();
  if (bounds && !mainWindow.isFullScreen() && !isTopHalf(bounds, workAreaFor(bounds))) {
    writeSavedFloat(bounds);
  }
  floatMode = false;
  resetOverlay();
  mainWindow.setMinimumSize(MAIN_MIN_W, MAIN_MIN_H);
  mainWindow.setResizable(true);
  mainWindow.setMovable(true);
  const saved = savedMainWindow;
  savedMainWindow = null;
  if (!saved) return true;
  if (saved.fullScreen) {
    mainWindow.setBounds(clampBounds(saved.bounds, workAreaFor(saved.bounds), MAIN_MIN_W, MAIN_MIN_H));
    mainWindow.setFullScreen(true);
    return true;
  }
  const restored = clampBounds(saved.bounds, workAreaFor(saved.bounds), MAIN_MIN_W, MAIN_MIN_H);
  mainWindow.setBounds(restored);
  if (saved.maximized) mainWindow.maximize();
  return true;
}

function toggleFloatHalf() {
  if (!mainWindow || mainWindow.isDestroyed() || !floatMode || floatLocked) return false;
  if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
  const bounds = currentBounds();
  const work = workAreaFor(bounds);
  if (bounds && isTopHalf(bounds, work)) {
    mainWindow.setBounds(readSavedFloat());
  } else {
    if (bounds) writeSavedFloat(bounds);
    mainWindow.setBounds(topHalfBounds(work));
  }
  return true;
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

ipcMain.handle("copy-text", (_e, text) => {
  clipboard.writeText(String(text ?? ""));
  return true;
});

ipcMain.handle("copy-image-from-file", (_e, filePath) => {
  const img = nativeImage.createFromPath(String(filePath ?? ""));
  if (img.isEmpty()) return false;
  clipboard.writeImage(img);
  return true;
});

ipcMain.handle("show-in-folder", (_e, filePath) => {
  const target = String(filePath ?? "");
  if (!target || !fs.existsSync(target)) return false;
  shell.showItemInFolder(target);
  return true;
});

ipcMain.handle("save-data-url", async (_e, fileName, dataUrl, title) => {
  const raw = String(dataUrl || "");
  const comma = raw.indexOf(",");
  const buf = Buffer.from(comma >= 0 ? raw.slice(comma + 1) : raw, "base64");
  if (!buf.length) return false;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: String(title || "导出图片"),
    defaultPath: String(fileName || "export.png"),
    filters: [{ name: "PNG", extensions: ["png"] }],
  });
  if (result.canceled || !result.filePath) return false;
  try {
    fs.writeFileSync(result.filePath, buf);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("clipboard-ingest", () => {
  const img = clipboard.readImage();
  if (img && !img.isEmpty()) {
    const buf = img.toPNG();
    if (!buf.length) return { ok: false, error: "剪贴板图片无效" };
    const tmp = path.join(os.tmpdir(), `poseboard-paste-${Date.now()}.png`);
    fs.writeFileSync(tmp, buf);
    return { ok: true, kind: "image", path: tmp };
  }
  const text = String(clipboard.readText() || "").trim();
  if (text) return { ok: true, kind: "text", text };
  return { ok: false, error: "剪贴板里没有图片" };
});

ipcMain.handle("download-image-url", async (_e, raw) => {
  const url = String(raw || "").trim();
  if (classifyImportUrl(url) !== "image" || /^data:/i.test(url)) {
    return { ok: false, error: "请拖图片本身，不要拖网页链接" };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await electronNet.fetch(url, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, error: "下载失败" };
    const ctype = String(res.headers.get("content-type") || "");
    if (/html/i.test(ctype)) return { ok: false, error: "请拖图片本身，不要拖网页链接" };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 24) return { ok: false, error: "下载失败" };
    if (buf.length > 40 * 1024 * 1024) return { ok: false, error: "图片太大" };
    const head = buf.subarray(0, 80).toString("utf8").replace(/^\uFEFF/, "").trimStart();
    if (/^<!doctype html/i.test(head) || /^<html/i.test(head)) {
      return { ok: false, error: "请拖图片本身，不要拖网页链接" };
    }
    const ext = imageExtFrom(url, ctype);
    const tmp = path.join(os.tmpdir(), `poseboard-url-${Date.now()}${ext}`);
    fs.writeFileSync(tmp, buf);
    return { ok: true, path: tmp };
  } catch {
    return { ok: false, error: "下载失败" };
  } finally {
    clearTimeout(timer);
  }
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clipboardFingerprint() {
  const img = clipboard.readImage();
  if (!img || img.isEmpty()) return "";
  const buf = img.toPNG();
  const head = buf.subarray(0, 24);
  const tail = buf.subarray(Math.max(0, buf.length - 24));
  return `${buf.length}:${head.toString("base64")}:${tail.toString("base64")}`;
}

let screenshotWait = null;

ipcMain.handle("cancel-screenshot", () => {
  if (screenshotWait) screenshotWait.abort = true;
  return true;
});

ipcMain.handle("capture-page-rect", async (_e, rect) => {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, error: "窗口不可用" };
  const x = Math.max(0, Math.round(Number(rect?.x) || 0));
  const y = Math.max(0, Math.round(Number(rect?.y) || 0));
  const width = Math.max(1, Math.round(Number(rect?.width) || 0));
  const height = Math.max(1, Math.round(Number(rect?.height) || 0));
  const img = await mainWindow.webContents.capturePage({ x, y, width, height });
  if (!img || img.isEmpty()) return { ok: false, error: "截取失败" };
  return { ok: true, dataUrl: img.toDataURL() };
});

ipcMain.handle("write-temp-data-url", (_e, dataUrl) => {
  const match = String(dataUrl || "").match(/^data:image\/\w+;base64,(.+)$/);
  if (!match) return { ok: false, error: "无效图片" };
  const tmp = path.join(os.tmpdir(), `poseboard-crop-${Date.now()}.png`);
  fs.writeFileSync(tmp, Buffer.from(match[1], "base64"));
  return { ok: true, path: tmp };
});

ipcMain.handle("capture-screenshot", async () => {
  const wait = { abort: false, sawBlur: false, focusAt: 0 };
  screenshotWait = wait;
  const before = clipboardFingerprint();
  const onBlur = () => {
    wait.sawBlur = true;
  };
  const onFocus = () => {
    if (wait.sawBlur) wait.focusAt = Date.now();
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.on("blur", onBlur);
    mainWindow.on("focus", onFocus);
  }
  try {
    await shell.openExternal("ms-screenclip:");
  } catch (err) {
    if (screenshotWait === wait) screenshotWait = null;
    return { ok: false, canceled: false, error: String(err && err.message ? err.message : err) };
  }
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await sleep(200);
    const now = clipboardFingerprint();
    if (now && now !== before) {
      const img = clipboard.readImage();
      if (img && !img.isEmpty()) {
        const tmp = path.join(os.tmpdir(), `poseboard-shot-${Date.now()}.png`);
        fs.writeFileSync(tmp, img.toPNG());
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.off("blur", onBlur);
          mainWindow.off("focus", onFocus);
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
        if (screenshotWait === wait) screenshotWait = null;
        return { ok: true, path: tmp };
      }
    }
    if (wait.abort) break;
    if (wait.focusAt && Date.now() - wait.focusAt > 450) break;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.off("blur", onBlur);
    mainWindow.off("focus", onFocus);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
  }
  if (screenshotWait === wait) screenshotWait = null;
  return { ok: false, canceled: true };
});

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

ipcMain.handle("win-minimize", () => {
  mainWindow?.minimize();
  return true;
});

ipcMain.handle("win-maximize", () => {
  if (!mainWindow) return false;
  if (mainWindow.isFullScreen()) {
    mainWindow.setFullScreen(false);
    return false;
  }
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});

ipcMain.handle("win-close", () => {
  mainWindow?.close();
  return true;
});

ipcMain.handle("win-is-maximized", () => Boolean(mainWindow && (mainWindow.isMaximized() || mainWindow.isFullScreen())));

ipcMain.handle("win-enter-float", () => enterFloatWindow());
ipcMain.handle("win-leave-float", () => leaveFloatWindow());
ipcMain.handle("win-toggle-float-half", () => toggleFloatHalf());
ipcMain.handle("win-overlay-state", () => overlayState());
ipcMain.handle("win-lock-position", (_e, flag) => {
  const next = applyLock(flag);
  sendOverlay();
  return next;
});
ipcMain.handle("win-set-opacity", (_e, value) => {
  const next = applyOpacity(value);
  const bounds = currentBounds();
  if (floatMode && bounds) writeSavedFloat(bounds);
  sendOverlay();
  return next;
});
ipcMain.handle("win-set-click-through", (_e, flag) => {
  if (!floatMode) return false;
  const next = applyClickThrough(flag);
  sendOverlay();
  return next;
});
ipcMain.handle("win-toggle-tools", () => setToolsOpen(!toolsOpen));
ipcMain.handle("win-set-tools", (_e, flag) => setToolsOpen(Boolean(flag)));
ipcMain.handle("win-drag-begin", () => beginWindowDrag());
ipcMain.handle("win-drag-end", () => {
  endWindowDrag();
  return true;
});

function applyAppName() {
  app.setName("姿态图库");
  Menu.setApplicationMenu(null);
}

app.whenReady().then(async () => {
  applyAppName();
  try {
    if (app.isPackaged) {
      await startBackend();
    } else {
      const devPort = 5178;
      try {
        await waitHealth(devPort, 2000);
        backendPort = devPort;
      } catch {
        await startBackend();
      }
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

app.on("before-quit", () => {
  if (floatMode) {
    const bounds = currentBounds();
    if (bounds && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFullScreen() && !isTopHalf(bounds, workAreaFor(bounds))) {
      writeSavedFloat(bounds);
    }
  }
  killBackend();
});

app.on("will-quit", () => {
  try {
    globalShortcut.unregisterAll();
  } catch {
    /* ignore */
  }
});
