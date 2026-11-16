import { FolderOpen, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, desktop, errorMessage } from "../api";
import { LibraryCard, ProfileCard } from "../components/LibrarySettings";
import { useUI } from "../context/hooks";
import { updateYtdlp } from "../lib/ytdlp";

function Switch({ checked, onChange, label, description, disabled }) {
  return (
    <label className={`setting setting--switch ${disabled ? "is-disabled" : ""}`}>
      <span className="setting__text">
        <span className="setting__label">{label}</span>
        {description && <span className="setting__desc">{description}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

function Row({ label, value, children }) {
  return (
    <div className="setting">
      <span className="setting__text">
        <span className="setting__label">{label}</span>
        {value && (
          <span className="setting__desc setting__path" title={value}>
            {value}
          </span>
        )}
      </span>
      {children}
    </div>
  );
}

export default function Settings() {
  const { confirm } = useUI();
  const [info, setInfo] = useState(null);
  const [prefs, setPrefs] = useState(null);
  const [updating, setUpdating] = useState(false);

  const loadInfo = useCallback(
    () =>
      api.get("/system/info").then(
        ({ data }) => setInfo(data),
        (err) => toast.error(`No se pudo leer la información: ${errorMessage(err)}`),
      ),
    [],
  );

  useEffect(() => {
    loadInfo();
    desktop?.getSettings().then(setPrefs);
  }, [loadInfo]);

  const setPref = async (key, value) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    try {
      await desktop.setSetting(key, value);
    } catch (err) {
      setPrefs((p) => ({ ...p, [key]: !value }));
      toast.error(`No se pudo guardar: ${errorMessage(err)}`);
    }
  };

  const changeMusicDir = async () => {
    const ok = await confirm({
      title: "Cambiar la carpeta de música",
      message:
        "La app usará la carpeta que elijas, sin copiar ni mover nada. Las canciones cuyos archivos no estén en la nueva carpeta aparecerán como «Falta archivo» hasta que vuelvas a la anterior.",
      confirmLabel: "Elegir carpeta",
    });
    if (ok) await desktop.chooseMusicDir(); // si cambia, la app se recarga sola
  };

  const runUpdate = async () => {
    setUpdating(true);
    await updateYtdlp();
    setUpdating(false);
    loadInfo();
  };

  return (
    <div className="page page--settings">
      <h1 className="page-title">Ajustes</h1>

      <ProfileCard />

      <section className="settings-card">
        <h2>Música</h2>
        <Row label="Carpeta de música" value={info?.music_path}>
          <div className="setting__actions">
            {desktop && (
              <button type="button" className="btn btn--ghost btn--compact" onClick={() => desktop.openPath("music")}>
                <FolderOpen size={16} /> Abrir
              </button>
            )}
            {desktop && (
              <button type="button" className="btn btn--ghost btn--compact" onClick={changeMusicDir}>
                Cambiar...
              </button>
            )}
          </div>
        </Row>
        {!desktop && <p className="muted small">La carpeta se cambia desde la app de escritorio.</p>}
      </section>

      <LibraryCard />

      {desktop && prefs && (
        <section className="settings-card">
          <h2>Ventana y sistema</h2>
          <Switch
            label="Seguir sonando en la bandeja del sistema al cerrar la ventana"
            description="Al cerrar, la música continúa y la app queda junto al reloj. Clic derecho en el icono para pausar, pasar de canción o salir."
            checked={prefs.closeToTray}
            onChange={(v) => setPref("closeToTray", v)}
          />
          <Switch
            label="Iniciar con Windows"
            description={
              prefs.isPackaged
                ? "Abre DR Music Free al encender el equipo (en la bandeja, sin ventana)."
                : "Solo disponible en la app instalada."
            }
            checked={prefs.openAtLogin}
            disabled={!prefs.isPackaged}
            onChange={(v) => setPref("openAtLogin", v)}
          />
        </section>
      )}

      <section className="settings-card">
        <h2>Descargas</h2>
        <Row
          label="yt-dlp (descarga desde YouTube)"
          value={info ? `Versión ${info.ytdlp_version || "desconocida"}` : "..."}
        >
          {info?.ytdlp_updatable ? (
            <button type="button" className="btn btn--ghost btn--compact" onClick={runUpdate} disabled={updating}>
              <RefreshCw size={16} className={updating ? "spin" : ""} />
              {updating ? "Actualizando..." : "Buscar actualización"}
            </button>
          ) : (
            <span className="muted small">{info ? "Se actualiza con pip en modo desarrollo" : ""}</span>
          )}
        </Row>
        <p className="muted small">
          YouTube cambia a menudo. Si una descarga falla, actualiza yt-dlp aquí: no hace falta reinstalar la app.
        </p>
        <Row label="ffmpeg (conversión a MP3)" value={info?.ffmpeg_path} />
      </section>

      <section className="settings-card">
        <h2>Datos</h2>
        <Row label="Carpeta de datos (biblioteca, historial, ajustes)" value={info?.data_path}>
          {desktop && (
            <button type="button" className="btn btn--ghost btn--compact" onClick={() => desktop.openPath("data")}>
              <FolderOpen size={16} /> Abrir
            </button>
          )}
        </Row>
        <p className="muted small">
          Desinstalar la app no borra esta carpeta ni tu música.
        </p>
      </section>

      <p className="muted small settings-version">
        DR Music Free {desktop?.version || info?.version || ""}
        {prefs && !prefs.isPackaged ? " · desarrollo" : ""}
      </p>
    </div>
  );
}
