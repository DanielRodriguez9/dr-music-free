// Compila DR Music Free para Windows.
//
//   node scripts/build.mjs                 todo: frontend, backend, binarios e instalador
//   node scripts/build.mjs vendor          solo prepara ffmpeg y yt-dlp en desktop/vendor/bin
//   node scripts/build.mjs frontend backend installer   pasos sueltos
//
// Variables opcionales:
//   FFMPEG_DIR   carpeta con ffmpeg.exe y ffprobe.exe (si no, se buscan en el PATH)
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(DESKTOP, "..");
const BACKEND = path.join(ROOT, "backend");
const FRONTEND = path.join(ROOT, "frontend");
const VENDOR = path.join(DESKTOP, "vendor", "bin");
const PY = path.join(BACKEND, "venv", "Scripts", "python.exe");
const YTDLP_URL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";

const steps = process.argv.slice(2);
const all = steps.length === 0;
const want = (s) => all || steps.includes(s);

function run(cmd, args, cwd) {
  console.log(`\n> ${[cmd, ...args].join(" ")}   (en ${path.relative(ROOT, cwd) || "."})`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" && !cmd.endsWith(".exe") });
  if (r.status !== 0) throw new Error(`Falló: ${cmd} ${args.join(" ")}`);
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const get = (u, redirects = 0) =>
      https
        .get(u, { headers: { "User-Agent": "drmusic-build" } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
            res.resume();
            return get(res.headers.location, redirects + 1);
          }
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} al descargar ${u}`));
          const tmp = `${dest}.part`;
          const out = fs.createWriteStream(tmp);
          res.pipe(out);
          out.on("finish", () => out.close(() => (fs.renameSync(tmp, dest), resolve())));
          out.on("error", reject);
        })
        .on("error", reject);
    get(url);
  });
}

function findOnPath(exe) {
  const r = spawnSync("where", [exe], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}

async function vendor() {
  console.log("\n== Binarios: ffmpeg, ffprobe y yt-dlp ==");
  fs.mkdirSync(VENDOR, { recursive: true });
  for (const exe of ["ffmpeg.exe", "ffprobe.exe"]) {
    const dest = path.join(VENDOR, exe);
    if (fs.existsSync(dest)) continue;
    const src = process.env.FFMPEG_DIR ? path.join(process.env.FFMPEG_DIR, exe) : findOnPath(exe);
    if (!src || !fs.existsSync(src)) throw new Error(`No encuentro ${exe}. Define FFMPEG_DIR con la carpeta de ffmpeg.`);
    fs.copyFileSync(src, dest);
    console.log(`  ${exe} <- ${src}`);
  }
  const ytdlp = path.join(VENDOR, "yt-dlp.exe");
  if (!fs.existsSync(ytdlp)) {
    console.log(`  descargando yt-dlp.exe de ${YTDLP_URL}`);
    await download(YTDLP_URL, ytdlp);
  }
  const version = execFileSync(ytdlp, ["--version"], { encoding: "utf8" }).trim();
  fs.writeFileSync(path.join(VENDOR, "yt-dlp.version"), version);
  console.log(`  yt-dlp ${version}`);
}

function frontend() {
  console.log("\n== Interfaz (Vite) ==");
  run("npm", ["run", "build"], FRONTEND);
}

function backend() {
  console.log("\n== Servidor (PyInstaller, carpeta) ==");
  run(
    PY,
    [
      "-m", "PyInstaller", "main.py",
      "--name", "drmusic-backend",
      "--onedir", "--noconfirm", "--clean",
      "--distpath", "dist", "--workpath", "build", "--specpath", "build",
      "--collect-submodules", "uvicorn",
      "--hidden-import", "sqlalchemy.dialects.sqlite",
      "--exclude-module", "yt_dlp",
      "--exclude-module", "pytest",
      "--exclude-module", "pg8000",
      "--exclude-module", "tkinter",
    ],
    BACKEND,
  );
}

function installer() {
  console.log("\n== Instalador (electron-builder, NSIS) ==");
  for (const p of [path.join(BACKEND, "dist", "drmusic-backend", "drmusic-backend.exe"), path.join(FRONTEND, "dist", "index.html"), path.join(VENDOR, "yt-dlp.exe")]) {
    if (!fs.existsSync(p)) throw new Error(`Falta ${p}: ejecuta antes los pasos anteriores.`);
  }
  run("npx", ["electron-builder", "--win", "nsis", "--publish", "never"], DESKTOP);
}

try {
  if (want("vendor")) await vendor();
  if (want("frontend")) frontend();
  if (want("backend")) backend();
  if (want("installer")) installer();
  console.log("\nListo.");
} catch (err) {
  console.error(`\nERROR: ${err.message}`);
  process.exit(1);
}
