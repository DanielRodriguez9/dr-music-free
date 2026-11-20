import { FolderOpen, ImagePlus, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { API_BASE, api, desktop, errorMessage } from "../api";
import { LibraryCard, ProfileCard } from "../components/LibrarySettings";
import Slider from "../components/Slider";
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

function useSavePref() {
  const { setPref } = useUI();
  return (key, value) => setPref(key, value).catch((err) => toast.error(`No se pudo guardar: ${errorMessage(err)}`));
}

function LyricsCard() {
  const { prefs } = useUI();
  const savePref = useSavePref();
  return (
    <section className="settings-card">
      <h2>Letras</h2>
      <Switch
        label="Buscar letras"
        description="Busca la letra en LRCLIB (lrclib.net) y la guarda en tu equipo para verla sin internet. Apagado, solo se muestran las ya guardadas."
        checked={prefs.lyricsEnabled}
        onChange={(v) => savePref("lyricsEnabled", v)}
      />
      <Switch
        label="Abrir la letra automáticamente al reproducir"
        description="Al empezar una canción con letra se abre el panel de la derecha. También con T, o K para el modo karaoke."
        checked={prefs.lyricsAutoOpen}
        onChange={(v) => savePref("lyricsAutoOpen", v)}
      />
    </section>
  );
}

function RangeRow({ label, value, max, unit = "", onLive, onCommit }) {
  return (
    <div className="setting">
      <span className="setting__text">
        <span className="setting__label">{label}</span>
      </span>
      <div className="setting__range">
        <Slider className="slider--setting" value={value} max={max} step={1} onLive={onLive} onCommit={onCommit} label={label} />
        <span className="setting__value">
          {value}
          {unit}
        </span>
      </div>
    </div>
  );
}

function AppearanceCard() {
  const { prefs, previewPref, bgImage, setBgImage, confirm } = useUI();
  const savePref = useSavePref();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const active = prefs.bgMode !== "off";

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { data } = await api.put("/appearance/background", file, {
        headers: { "Content-Type": "application/octet-stream" },
        timeout: 120000,
      });
      setBgImage(data);
      if (prefs.bgMode === "off") await savePref("bgMode", "image");
      toast.success("Fondo aplicado");
    } catch (err) {
      toast.error(`No se pudo usar la imagen: ${errorMessage(err)}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: "¿Quitar el fondo?",
      message: "La app vuelve a su diseño original. La imagen guardada en la carpeta de datos se borra (la tuya original no se toca).",
      confirmLabel: "Quitar fondo",
    });
    if (!ok) return;
    try {
      await api.delete("/appearance/background");
      setBgImage(null);
      await savePref("bgMode", "off");
      await savePref("bgAccent", false);
    } catch (err) {
      toast.error(`No se pudo quitar: ${errorMessage(err)}`);
    }
  };

  return (
    <section className="settings-card">
      <h2>Apariencia</h2>
      <div className="setting">
        <span className="setting__text">
          <span className="setting__label">Fondo personalizado</span>
          <span className="setting__desc">
            Una imagen JPG, PNG o WEBP detrás de toda la app, oscurecida y difuminada para que todo se lea bien. Se guarda una copia
            reducida en la carpeta de datos.
          </span>
        </span>
        <div className="setting__actions">
          {bgImage && <img className="bg-thumb" src={`${API_BASE}${bgImage.url}`} alt="Fondo actual" />}
          <button type="button" className="btn btn--ghost btn--compact" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <LoaderCircle size={16} className="spin" /> : <ImagePlus size={16} />}
            {bgImage ? "Cambiar imagen..." : "Elegir imagen..."}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </div>
      </div>
      <Switch
        label="Usar la carátula de la canción actual como fondo"
        description="El fondo cambia con cada canción. Sin canción sonando se usa tu imagen (si elegiste una)."
        checked={prefs.bgMode === "cover"}
        onChange={(v) => savePref("bgMode", v ? "cover" : bgImage ? "image" : "off")}
      />
      <Switch
        label="Tomar el color de acento de la imagen"
        description="Botones, barras y resaltados usan el color principal del fondo en lugar del azul."
        checked={prefs.bgAccent}
        disabled={!active}
        onChange={(v) => savePref("bgAccent", v)}
      />
      {active && (
        <>
          <RangeRow
            label="Intensidad"
            value={prefs.bgIntensity}
            max={100}
            unit=" %"
            onLive={(v) => previewPref("bgIntensity", v)}
            onCommit={(v) => savePref("bgIntensity", v)}
          />
          <RangeRow label="Difuminado" value={prefs.bgBlur} max={60} unit=" px" onCommit={(v) => savePref("bgBlur", v)} />
        </>
      )}
      <div className="setting">
        <span className="setting__text">
          <span className="setting__label">Quitar fondo</span>
          <span className="setting__desc">Vuelve al diseño original.</span>
        </span>
        <button type="button" className="btn btn--ghost btn--compact" onClick={remove} disabled={!active && !bgImage}>
          <Trash2 size={16} /> Quitar fondo
        </button>
      </div>
    </section>
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

      <LyricsCard />

      <AppearanceCard />

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
