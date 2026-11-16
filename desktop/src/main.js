// DR Music Free - proceso principal de Electron
const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, net, protocol, screen, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { Backend } = require("./backend");
const { Settings } = require("./settings");

const APP_NAME = "DR Music Free";
const ORIGIN = "app://drmusic";

// ---------- carpetas ----------
// Los datos (base de datos, ajustes) viven en %APPDATA%\DR Music Free.
// DRMUSIC_DATA_DIR permite probar la app con otra carpeta sin tocar la real.
const DATA_DIR = process.env.DRMUSIC_DATA_DIR || path.join(app.getPath("appData"), APP_NAME);
app.setPath("userData", path.join(DATA_DIR, "electron"));
// Con una carpeta de datos de prueba se usa otra identidad para que las pruebas (controles
// multimedia de Windows) nunca toquen la app de verdad si está abierta al mismo tiempo.
app.setAppUserModelId(process.env.DRMUSIC_DATA_DIR ? "com.drmusic.free.test" : "com.drmusic.free");

const RESOURCES = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..", "..");
const FRONTEND_DIR = app.isPackaged ? path.join(RESOURCES, "frontend") : path.join(RESOURCES, "frontend", "dist");
const ICON = path.join(__dirname, "assets", "icon.ico");

// La interfaz se sirve desde un origen fijo (app://drmusic) para que la sesión guardada
// (cola, volumen, última canción) sobreviva aunque el servidor cambie de puerto.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// ---------- una sola instancia ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  run();
}

function run() {
  const settings = new Settings(DATA_DIR);
  const backend = new Backend({
    packaged: app.isPackaged,
    resources: RESOURCES,
    repoRoot: RESOURCES,
    dataDir: DATA_DIR,
    logDir: path.join(DATA_DIR, "logs"),
  });
  const startHidden = process.argv.includes("--autostart");

  let win = null;
  let tray = null;
  let quitting = false;
  let playerState = { title: null, artist: null, isPlaying: false };

  // ---------- ventana ----------
  function validBounds(b) {
    if (!b || !b.width || !b.height) return null;
    // que la ventana quede visible aunque se haya desconectado un monitor
    const area = screen.getDisplayMatching(b).workArea;
    const visible = b.x < area.x + area.width - 100 && b.x + b.width > area.x + 100 && b.y >= area.y - 10 && b.y < area.y + area.height - 100;
    return visible ? b : { width: b.width, height: b.height };
  }

  function saveBounds() {
    if (!win || win.isDestroyed() || win.isMinimized()) return;
    const maximized = win.isMaximized();
    const bounds = maximized ? win.getNormalBounds() : win.getBounds();
    settings.set("window", { ...bounds, maximized });
  }

  function createWindow() {
    const saved = settings.get("window");
    const b = validBounds(saved) || { width: 1280, height: 820 };
    win = new BrowserWindow({
      ...b,
      minWidth: 1024,
      minHeight: 640,
      show: false,
      title: APP_NAME,
      icon: ICON,
      backgroundColor: "#08090b",
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        sandbox: true,
        // con la ventana oculta en la bandeja la música y el historial siguen al día
        backgroundThrottling: false,
      },
    });
    Menu.setApplicationMenu(null);
    // con escala de pantalla (125 %, 150 %) el tamaño del constructor se redondea y la ventana
    // crecería unos píxeles en cada arranque: se aplica de nuevo el tamaño exacto guardado
    if (b.x !== undefined) win.setBounds(b);
    if (saved?.maximized) win.maximize();

    win.once("ready-to-show", () => {
      if (!startHidden || !settings.get("closeToTray")) win.show();
    });

    let saveTimer = null;
    const scheduleSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveBounds, 500);
    };
    win.on("resize", scheduleSave);
    win.on("move", scheduleSave);
    win.on("maximize", saveBounds);
    win.on("unmaximize", saveBounds);

    win.on("close", (e) => {
      saveBounds();
      if (!quitting && settings.get("closeToTray")) {
        e.preventDefault();
        win.hide();
      }
    });
    win.on("closed", () => (win = null));

    // los enlaces externos (YouTube) se abren en el navegador
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
      return { action: "deny" };
    });
    win.webContents.on("will-navigate", (e, url) => {
      if (!url.startsWith(ORIGIN)) e.preventDefault();
    });

    win.loadURL(splashURL("Abriendo tu música..."));
  }

  function showWindow() {
    if (!win) createWindow();
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  function splashURL(text) {
    const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;place-items:center;background:#08090b;color:#a3abb8;font:15px 'Segoe UI',sans-serif">${text}</body>`;
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  }

  // ---------- bandeja del sistema ----------
  function trayMenu() {
    const playing = playerState.isPlaying;
    const nowPlaying = playerState.title
      ? `${playerState.title}${playerState.artist ? ` — ${playerState.artist}` : ""}`
      : "Nada sonando";
    return Menu.buildFromTemplate([
      { label: nowPlaying.length > 60 ? `${nowPlaying.slice(0, 57)}...` : nowPlaying, enabled: false },
      { type: "separator" },
      { label: playing ? "Pausar" : "Reproducir", click: () => sendCommand("toggle") },
      { label: "Siguiente", click: () => sendCommand("next") },
      { label: "Anterior", click: () => sendCommand("prev") },
      { type: "separator" },
      { label: `Mostrar ${APP_NAME}`, click: showWindow },
      { label: "Salir", click: quit },
    ]);
  }

  function updateTray() {
    if (!tray) return;
    const t = playerState.title ? `${playerState.isPlaying ? "▶" : "⏸"} ${playerState.title}` : APP_NAME;
    tray.setToolTip(t.length > 127 ? t.slice(0, 124) + "..." : t);
    tray.setContextMenu(trayMenu());
  }

  function setTrayEnabled(enabled) {
    if (enabled && !tray) {
      tray = new Tray(nativeImage.createFromPath(ICON));
      tray.on("click", showWindow);
      tray.on("double-click", showWindow);
      updateTray();
    } else if (!enabled && tray) {
      tray.destroy();
      tray = null;
    }
  }

  function sendCommand(cmd) {
    win?.webContents.send("player-command", cmd);
  }

  // ---------- iniciar con Windows ----------
  function applyOpenAtLogin(enabled) {
    if (!app.isPackaged) return; // en desarrollo no se registra electron.exe
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: ["--autostart"] });
  }

  // ---------- carpeta de música ----------
  async function askMusicDir(defaultPath) {
    const parent = win && !win.isDestroyed() ? win : undefined;
    const res = await dialog.showOpenDialog(parent, {
      title: "Elige la carpeta donde está tu música",
      defaultPath: defaultPath || app.getPath("music"),
      properties: ["openDirectory", "createDirectory"],
      buttonLabel: "Usar esta carpeta",
    });
    return res.canceled || !res.filePaths[0] ? null : res.filePaths[0];
  }

  async function ensureMusicDir() {
    let dir = settings.get("musicDir");
    if (dir) return dir;
    await dialog.showMessageBox({
      type: "info",
      title: APP_NAME,
      message: "¿Dónde está tu música?",
      detail: "Elige la carpeta donde guardas tus canciones. La app solo la usa: no copia ni mueve nada. Podrás cambiarla después en Ajustes.",
      buttons: ["Elegir carpeta"],
      icon: ICON,
    });
    dir = (await askMusicDir()) || path.join(app.getPath("music"), APP_NAME);
    fs.mkdirSync(dir, { recursive: true });
    settings.set("musicDir", dir);
    return dir;
  }

  // ---------- comunicación con la interfaz ----------
  ipcMain.on("get-config", (e) => {
    e.returnValue = {
      apiBase: `http://127.0.0.1:${backend.port}`,
      version: app.getVersion(),
      isPackaged: app.isPackaged,
      userName: settings.get("userName") || "",
    };
  });

  ipcMain.handle("settings:get", () => ({
    musicDir: settings.get("musicDir"),
    closeToTray: settings.get("closeToTray"),
    openAtLogin: settings.get("openAtLogin"),
    userName: settings.get("userName") || "",
    dataDir: DATA_DIR,
    logDir: path.join(DATA_DIR, "logs"),
    version: app.getVersion(),
    isPackaged: app.isPackaged,
  }));

  ipcMain.handle("settings:set", (_e, key, value) => {
    if (key === "closeToTray") {
      settings.set("closeToTray", Boolean(value));
      setTrayEnabled(Boolean(value));
    } else if (key === "userName") {
      settings.set("userName", String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 40));
    } else if (key === "openAtLogin") {
      settings.set("openAtLogin", Boolean(value));
      applyOpenAtLogin(Boolean(value));
    } else {
      throw new Error(`Ajuste desconocido: ${key}`);
    }
    return true;
  });

  ipcMain.handle("settings:choose-music-dir", async () => {
    const dir = await askMusicDir(settings.get("musicDir"));
    if (!dir || dir === settings.get("musicDir")) return null;
    settings.set("musicDir", dir);
    await backend.restart(dir);
    win?.webContents.reload(); // mismo origen: la sesión guardada se conserva
    return dir;
  });

  // importar una carpeta de música: solo devuelve la ruta elegida (el servidor la lee)
  ipcMain.handle("dialog:choose-folder", async () => {
    const parent = win && !win.isDestroyed() ? win : undefined;
    const res = await dialog.showOpenDialog(parent, {
      title: "Elige una carpeta con música para importar",
      defaultPath: app.getPath("music"),
      properties: ["openDirectory"],
      buttonLabel: "Importar esta carpeta",
    });
    return res.canceled || !res.filePaths[0] ? null : res.filePaths[0];
  });

  ipcMain.handle("open-path", (_e, which) => {
    const target = which === "music" ? settings.get("musicDir") : which === "logs" ? path.join(DATA_DIR, "logs") : DATA_DIR;
    return shell.openPath(target);
  });

  ipcMain.on("player-state", (_e, state) => {
    playerState = { title: state?.title ?? null, artist: state?.artist ?? null, isPlaying: Boolean(state?.isPlaying) };
    if (win) win.setTitle(playerState.title ? `${playerState.title} · ${APP_NAME}` : APP_NAME);
    updateTray();
  });

  // ---------- ciclo de vida ----------
  function quit() {
    quitting = true;
    app.quit();
  }

  app.on("second-instance", showWindow);
  app.on("before-quit", () => {
    quitting = true;
    saveBounds();
  });
  app.on("will-quit", () => backend.stop());
  app.on("window-all-closed", () => {
    if (!settings.get("closeToTray")) quit();
  });
  process.on("exit", () => backend.stop());

  app.whenReady().then(async () => {
    protocol.handle("app", (request) => {
      const { pathname } = new URL(request.url);
      const rel = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
      let file = path.normalize(path.join(FRONTEND_DIR, rel));
      if (!file.startsWith(FRONTEND_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(FRONTEND_DIR, "index.html");
      }
      return net.fetch(pathToFileURL(file).toString());
    });

    applyOpenAtLogin(settings.get("openAtLogin"));
    setTrayEnabled(settings.get("closeToTray"));
    createWindow();

    try {
      const musicDir = await ensureMusicDir();
      await backend.start(musicDir);
      win?.loadURL(`${ORIGIN}/index.html`);
    } catch (err) {
      dialog.showErrorBox(APP_NAME, `No se pudo iniciar el servidor de música.\n\n${err.message}`);
      quit();
    }
  });
}
