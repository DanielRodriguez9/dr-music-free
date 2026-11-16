import { FolderPlus, ImageDown, LoaderCircle, RefreshCw, Trash2, Wand2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, desktop, errorMessage } from "../api";
import { useLibrary, useUI } from "../context/hooks";
import { formatDate, plural } from "../lib/format";

/** Nombre para el saludo de Inicio. */
export function ProfileCard() {
  const { userName, setUserName } = useUI();
  const [value, setValue] = useState(userName);
  const dirty = value.trim() !== userName;
  const save = async (e) => {
    e?.preventDefault();
    try {
      await setUserName(value);
      toast.success(value.trim() ? `Te saludaré como ${value.trim()}` : "El saludo irá sin nombre", { id: "name" });
    } catch (err) {
      toast.error(`No se pudo guardar: ${errorMessage(err)}`);
    }
  };
  return (
    <section className="settings-card">
      <h2>Tú</h2>
      <form className="setting" onSubmit={save}>
        <span className="setting__text">
          <span className="setting__label">Tu nombre</span>
          <span className="setting__desc">Para el saludo de Inicio («Buenas noches, …»). Déjalo vacío para un saludo sin nombre.</span>
        </span>
        <div className="setting__actions">
          <input className="input input--compact" value={value} maxLength={40} placeholder="Tu nombre" onChange={(e) => setValue(e.target.value)} aria-label="Tu nombre" />
          <button type="submit" className="btn btn--ghost btn--compact" disabled={!dirty}>
            Guardar
          </button>
        </div>
      </form>
    </section>
  );
}

/** Biblioteca: corregir artistas, carpetas importadas y carátulas guardadas en disco. */
export function LibraryCard() {
  const { songs, reload } = useLibrary();
  const { navigate, confirm } = useUI();
  const [folders, setFolders] = useState(null);
  const [covers, setCovers] = useState(null);
  const [path, setPath] = useState("");
  const unknown = songs.filter((s) => !s.artist).length;

  const load = useCallback(
    () =>
      Promise.all([api.get("/folders/"), api.get("/covers/status")]).then(([f, c]) => {
        setFolders(f.data);
        setCovers(c.data);
        return f.data;
      }),
    [],
  );

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  // mientras se importa o se guardan carátulas, se refresca el avance
  const busy = folders?.some((f) => f.progress?.running) || covers?.running;
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      load()
        .then((list) => {
          if (!list.some((f) => f.progress?.running)) reload().catch(() => {});
        })
        .catch(() => {});
    }, 1500);
    return () => clearInterval(timer);
  }, [busy, load, reload]);

  const addFolder = async (chosen) => {
    const dir = (chosen ?? path).trim();
    if (!dir) return;
    try {
      const { data } = await api.post("/folders/", { path: dir });
      setFolders(data);
      setPath("");
      toast.success("Importando la carpeta... las canciones aparecen al terminar");
    } catch (err) {
      toast.error(`No se pudo importar: ${errorMessage(err)}`);
    }
  };

  const pickFolder = async () => {
    const dir = await desktop.chooseFolder();
    if (dir) addFolder(dir);
  };

  const rescan = async (f) => {
    const { data } = await api.post(`/folders/${f.id}/scan`);
    setFolders(data);
  };

  const remove = async (f) => {
    const ok = await confirm({
      title: "¿Quitar la carpeta de la biblioteca?",
      message: `Sus ${f.songs} canciones dejarán de aparecer en la app. Los archivos NO se borran: siguen en ${f.path}.`,
      confirmLabel: "Quitar carpeta",
      danger: true,
    });
    if (!ok) return;
    const { data } = await api.delete(`/folders/${f.id}`);
    setFolders(data.folders);
    reload().catch(() => {});
    toast.success(`${plural(data.removed, "canción quitada", "canciones quitadas")} de la biblioteca`);
  };

  const fillCovers = async () => {
    const { data } = await api.post("/covers/fill");
    setCovers(data);
  };

  return (
    <section className="settings-card">
      <h2>Biblioteca</h2>

      <div className="setting">
        <span className="setting__text">
          <span className="setting__label">Corregir artistas</span>
          <span className="setting__desc">
            {unknown ? `${plural(unknown, "canción", "canciones")} sin artista. ` : ""}Propuestas automáticas que revisas antes de
            aplicar (también artista y título invertidos).
          </span>
        </span>
        <button type="button" className="btn btn--ghost btn--compact" onClick={() => navigate("fixes")}>
          <Wand2 size={16} /> Revisar
        </button>
      </div>

      <div className="setting setting--column">
        <span className="setting__text">
          <span className="setting__label">Carpetas importadas</span>
          <span className="setting__desc">
            Añade otras carpetas con música de tu equipo. Los archivos se quedan donde están; la app solo los lee.
          </span>
        </span>
        {folders?.length > 0 && (
          <ul className="folders">
            {folders.map((f) => (
              <li key={f.id} className="folder">
                <span className="folder__text">
                  <span className="setting__path" title={f.path}>
                    {f.path}
                  </span>
                  <span className="setting__desc">
                    {f.progress?.running ? (
                      <>
                        <LoaderCircle size={12} className="spin" /> Importando {f.progress.done} de {f.progress.total}...
                      </>
                    ) : !f.exists ? (
                      "La carpeta no está disponible (¿disco desconectado?)"
                    ) : (
                      `${plural(f.songs, "canción", "canciones")}${f.scanned_at ? ` · revisada el ${formatDate(f.scanned_at)}` : ""}`
                    )}
                  </span>
                </span>
                <button type="button" className="icon-btn" onClick={() => rescan(f)} title="Buscar archivos nuevos" aria-label="Volver a escanear" disabled={f.progress?.running}>
                  <RefreshCw size={16} />
                </button>
                <button type="button" className="icon-btn" onClick={() => remove(f)} title="Quitar de la biblioteca (no borra archivos)" aria-label="Quitar carpeta">
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="setting__actions">
          {desktop ? (
            <button type="button" className="btn btn--ghost btn--compact" onClick={pickFolder}>
              <FolderPlus size={16} /> Importar carpeta...
            </button>
          ) : (
            <form
              className="setting__actions"
              onSubmit={(e) => {
                e.preventDefault();
                addFolder();
              }}
            >
              <input className="input input--compact folder-input" value={path} onChange={(e) => setPath(e.target.value)} placeholder="C:\Users\...\Música" aria-label="Ruta de la carpeta" />
              <button type="submit" className="btn btn--ghost btn--compact" disabled={!path.trim()}>
                <FolderPlus size={16} /> Importar
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="setting">
        <span className="setting__text">
          <span className="setting__label">Carátulas sin conexión</span>
          <span className="setting__desc">
            {covers
              ? covers.running
                ? `Guardando... ${covers.done} de ${covers.total}`
                : `${covers.saved} de ${covers.total} guardadas en disco (${covers.size_mb} MB)` +
                  (covers.without_art ? ` · ${covers.without_art} sin carátula disponible` : "")
              : "..."}
          </span>
        </span>
        <button type="button" className="btn btn--ghost btn--compact" onClick={fillCovers} disabled={!covers || covers.running || covers.missing === 0}>
          {covers?.running ? <LoaderCircle size={16} className="spin" /> : <ImageDown size={16} />}
          {covers?.missing ? `Guardar ${covers.missing} que faltan` : "Todas guardadas"}
        </button>
      </div>
    </section>
  );
}
