// Ajustes de la app de escritorio, guardados en <carpeta de datos>/settings.json
const fs = require("node:fs");
const path = require("node:path");

const DEFAULTS = {
  musicDir: null, // se pide la primera vez
  closeToTray: true, // al cerrar la ventana sigue sonando en la bandeja
  openAtLogin: false, // iniciar con Windows (desactivado por defecto)
  window: null, // { x, y, width, height, maximized }
};

class Settings {
  constructor(dataDir) {
    this.file = path.join(dataDir, "settings.json");
    this.values = { ...DEFAULTS };
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
