import { FolderPlus, Link, LoaderCircle, Music2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, desktop, errorMessage } from "../api";
import { useLibrary, useUI } from "../context/hooks";

/**
 * Biblioteca vacía (Tu biblioteca e Inicio): explica las tres formas de añadir música.
 * `compact` es la versión para una fila de Inicio.
 */
export default function EmptyLibrary({ compact = false }) {
  const { navigate, focusSearch, openDialog } = useUI();
  const { reload } = useLibrary();
  const [importing, setImporting] = useState(false);

  // mientras se importa la carpeta, se espera a que termine para mostrar las canciones
  useEffect(() => {
    if (!importing) return;
    const timer = setInterval(async () => {
      try {
        const { data } = await api.get("/folders/");
        if (!data.some((f) => f.progress?.running)) {
          clearInterval(timer);
          setImporting(false);
          await reload();
        }
      } catch {
        /* se reintenta en la siguiente vuelta */
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [importing, reload]);

  const searchYouTube = () => {
    navigate("search");
    requestAnimationFrame(focusSearch); // espera a que se pinte la búsqueda
  };

  const importFolder = async () => {
    if (!desktop) {
      navigate("settings"); // en el navegador la ruta se escribe en Ajustes
      return;
    }
    const dir = await desktop.chooseFolder();
    if (!dir) return;
    try {
      await api.post("/folders/", { path: dir });
      setImporting(true);
      toast.success("Importando la carpeta... las canciones aparecen al terminar");
    } catch (err) {
      toast.error(`No se pudo importar: ${errorMessage(err)}`);
    }
  };

  return (
    <div className={`empty-card ${compact ? "empty-card--compact" : ""}`}>
      <div className="empty-card__icon" aria-hidden="true">
        <Music2 size={compact ? 24 : 30} />
      </div>
      <div className="empty-card__text">
        <h2>Aún no tienes canciones</h2>
        <p>Busca en YouTube, importa una carpeta de tu PC o pega un enlace.</p>
      </div>
      <div className="empty-card__actions">
        <button type="button" className="btn btn--primary" onClick={searchYouTube}>
          <Search size={17} /> Buscar en YouTube
        </button>
        <button type="button" className="btn btn--ghost" onClick={importFolder} disabled={importing}>
          {importing ? <LoaderCircle size={17} className="spin" /> : <FolderPlus size={17} />}
          {importing ? "Importando..." : "Importar carpeta"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => openDialog({ type: "download" })}>
          <Link size={17} /> Pegar enlace
        </button>
      </div>
    </div>
  );
}
