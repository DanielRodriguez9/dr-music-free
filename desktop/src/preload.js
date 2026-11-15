// Puente seguro entre la interfaz (React) y Electron.
const { contextBridge, ipcRenderer } = require("electron");

const config = ipcRenderer.sendSync("get-config");

contextBridge.exposeInMainWorld("drmusic", {
  isDesktop: true,
  apiBase: config.apiBase,
  version: config.version,
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSetting: (key, value) => ipcRenderer.invoke("settings:set", key, value),
  chooseMusicDir: () => ipcRenderer.invoke("settings:choose-music-dir"),
  openPath: (which) => ipcRenderer.invoke("open-path", which),
  sendPlayerState: (state) => ipcRenderer.send("player-state", state),
  onPlayerCommand: (callback) => {
    const listener = (_e, cmd) => callback(cmd);
    ipcRenderer.on("player-command", listener);
    return () => ipcRenderer.removeListener("player-command", listener);
  },
});
