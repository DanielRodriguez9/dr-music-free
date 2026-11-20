// Puente seguro entre la interfaz (React) y Electron.
const { contextBridge, ipcRenderer } = require("electron");

const config = ipcRenderer.sendSync("get-config");

contextBridge.exposeInMainWorld("drmusic", {
  isDesktop: true,
  apiBase: config.apiBase,
  version: config.version,
  prefs: config.prefs, // nombre, letras y fondo (los de settings.json al arrancar)
  welcome: config.welcome, // { defaultMusicDir } si hay que mostrar la bienvenida
  chooseWelcomeDir: () => ipcRenderer.invoke("welcome:choose-dir"),
  finishWelcome: (musicDir) => ipcRenderer.invoke("welcome:finish", musicDir),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSetting: (key, value) => ipcRenderer.invoke("settings:set", key, value),
  chooseMusicDir: () => ipcRenderer.invoke("settings:choose-music-dir"),
  chooseFolder: () => ipcRenderer.invoke("dialog:choose-folder"),
  openPath: (which) => ipcRenderer.invoke("open-path", which),
  sendPlayerState: (state) => ipcRenderer.send("player-state", state),
  onPlayerCommand: (callback) => {
    const listener = (_e, cmd) => callback(cmd);
    ipcRenderer.on("player-command", listener);
    return () => ipcRenderer.removeListener("player-command", listener);
  },
});
