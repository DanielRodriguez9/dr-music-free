// Arranca y detiene el servidor de música (FastAPI) en un puerto libre.
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const netNode = require("node:net");
const path = require("node:path");

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = netNode.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function ping(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function tail(file, lines = 15) {
  try {
    return fs.readFileSync(file, "utf8").trim().split(/\r?\n/).slice(-lines).join("\n");
  } catch {
    return "";
  }
}

class Backend {
  /**
   * @param {object} o
   * @param {boolean} o.packaged  app instalada (true) o en desarrollo (false)
   * @param {string} o.resources  carpeta "resources" de la app instalada
   * @param {string} o.repoRoot   raíz del repositorio (desarrollo)
   * @param {string} o.dataDir    %APPDATA%\DR Music Free
   * @param {string} o.logDir
   */
  constructor(o) {
    Object.assign(this, o);
    this.child = null;
    this.port = null;
  }

  command() {
    if (this.packaged) {
      return { cmd: path.join(this.resources, "backend", "drmusic-backend.exe"), args: [], cwd: path.join(this.resources, "backend") };
    }
    const backendDir = path.join(this.repoRoot, "backend");
    return { cmd: path.join(backendDir, "venv", "Scripts", "python.exe"), args: [path.join(backendDir, "main.py")], cwd: backendDir };
  }

  env(musicDir) {
    const env = {
      ...process.env,
      DATA_DIR: this.dataDir,
      MUSIC_PATH: musicDir,
      CORS_ORIGINS: "app://drmusic",
      PYTHONUTF8: "1",
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const bin = this.packaged ? path.join(this.resources, "bin") : path.join(this.repoRoot, "desktop", "vendor", "bin");
    if (fs.existsSync(path.join(bin, "ffmpeg.exe"))) env.FFMPEG_PATH = bin;
    if (fs.existsSync(path.join(bin, "yt-dlp.exe"))) {
      env.YTDLP_BUNDLED = path.join(bin, "yt-dlp.exe");
      // YouTube necesita un motor JavaScript: se usa el Node que trae Electron
      env.YTDLP_JS_RUNTIME = `node:${process.execPath}`;
      env.YTDLP_RUN_AS_NODE = "1";
    }
    return env;
  }

  async start(musicDir, port) {
    this.port = port || (await freePort());
    fs.mkdirSync(this.logDir, { recursive: true });
    const logFile = path.join(this.logDir, "backend.log");
    // se conserva solo el último arranque
    const fd = fs.openSync(logFile, "w");
    const { cmd, args, cwd } = this.command();
    this.child = spawn(cmd, [...args, "--port", String(this.port), "--parent-pid", String(process.pid)], {
      cwd,
      env: this.env(musicDir),
      stdio: ["ignore", fd, fd],
      windowsHide: true,
    });
    fs.closeSync(fd);
    const child = this.child;
    let exited = null;
    child.once("exit", (code) => (exited = code ?? "señal"));

    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (exited !== null) throw new Error(`El servidor se cerró al arrancar (código ${exited}).\n${tail(logFile)}`);
      if (await ping(this.port)) return this.port;
      await new Promise((r) => setTimeout(r, 250));
    }
    this.stop();
    throw new Error(`El servidor no respondió a tiempo.\n${tail(logFile)}`);
  }

  /** Cierra el servidor y todo lo que haya lanzado (yt-dlp, ffmpeg). Síncrono para usarlo al salir. */
  stop() {
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) return;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
    } else {
      child.kill("SIGKILL");
    }
  }

  async restart(musicDir) {
    const port = this.port;
    this.stop();
    await new Promise((r) => setTimeout(r, 400));
    try {
      return await this.start(musicDir, port);
    } catch {
      return this.start(musicDir); // el puerto quedó ocupado: otro libre
    }
  }
}

module.exports = { Backend };
