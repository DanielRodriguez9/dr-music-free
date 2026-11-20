// Ajustes de la app de escritorio, guardados en <carpeta de datos>/settings.json
const fs = require("node:fs");
const path = require("node:path");

const DEFAULTS = {
  userName: "", // nombre para el saludo de Inicio
  musicDir: null, // se elige en la bienvenida
  welcomePending: false, // true desde el primer arranque hasta terminar la bienvenida
  closeToTray: true, // al cerrar la ventana sigue sonando en la bandeja
  openAtLogin: false, // iniciar con Windows (desactivado por defecto)
  lyricsEnabled: true, // buscar letras en internet (LRCLIB)
  lyricsAutoOpen: false, // abrir el panel de letra al reproducir
  bgMode: "off", // fondo: "off" | "image" (imagen propia) | "cover" (carátula actual)
  bgIntensity: 45, // 0-100: cuánto se ve la imagen
  bgBlur: 28, // px de difuminado
  bgAccent: false, // tomar el color de acento de la imagen
  window: null, // { x, y, width, height, maximized }
};

// Ajustes que la interfaz puede cambiar, con su validación
const clampInt = (min, max) => (v) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) throw new Error("Valor no válido");
  return Math.min(max, Math.max(min, n));
};
const EDITABLE = {
  userName: (v) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
  closeToTray: Boolean,
  openAtLogin: Boolean,
  lyricsEnabled: Boolean,
  lyricsAutoOpen: Boolean,
  bgMode: (v) => {
    if (!["off", "image", "cover"].includes(v)) throw new Error("Modo de fondo no válido");
    return v;
  },
  bgIntensity: clampInt(0, 100),
  bgBlur: clampInt(0, 60),
  bgAccent: Boolean,
};

// Lo que la interfaz necesita al arrancar (preferencias visibles)
const PUBLIC = ["userName", "lyricsEnabled", "lyricsAutoOpen", "bgMode", "bgIntensity", "bgBlur", "bgAccent"];

class Settings {
  constructor(dataDir) {
    this.file = path.join(dataDir, "settings.json");
    this.values = { ...DEFAULTS };
    // sin settings.json es la primera vez en este equipo: se muestra la bienvenida
    this.existed = fs.existsSync(this.file);
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (raw && typeof raw === "object") this.values = { ...DEFAULTS, ...raw };
    } catch {
      /* primera vez o archivo dañado: valores por defecto */
    }
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    this.values[key] = value;
    this.save();
  }

  /** Cambia un ajuste pedido por la interfaz (validado). Devuelve el valor guardado. */
  setFromUI(key, value) {
    const clean = EDITABLE[key];
    if (!clean) throw new Error(`Ajuste desconocido: ${key}`);
    const v = clean(value);
    this.set(key, v);
    return v;
  }

  publicValues() {
    return Object.fromEntries(PUBLIC.map((k) => [k, this.values[k]]));
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      // escribir y renombrar: si se corta la luz no queda un JSON a medias
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.values, null, 2), "utf8");
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error("No se pudieron guardar los ajustes:", err);
    }
  }
}

module.exports = { Settings, DEFAULTS };
