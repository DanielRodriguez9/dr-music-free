import { Download, ListMusic, Search, X } from "lucide-react";
import { useUI } from "../context/hooks";

/** Barra superior: la búsqueda es el elemento principal. */
export default function TopBar() {
  const { query, setQuery, navigate, view, searchRef, openDialog, queueOpen, toggleQueue } = useUI();

  return (
    <div className="topbar">
      <label className="searchbox">
        <Search size={20} aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          placeholder="¿Qué quieres escuchar?"
          aria-label="Buscar en tu biblioteca y en YouTube"
          onChange={(e) => {
            setQuery(e.target.value);
            if (view !== "search") navigate("search");
          }}
          onFocus={() => {
            if (view !== "search" && query) navigate("search");
          }}
        />
        {query ? (
          <button type="button" className="icon-btn" onClick={() => setQuery("")} aria-label="Borrar búsqueda" title="Borrar">
            <X size={18} />
          </button>
        ) : (
          <kbd className="searchbox__hint">Ctrl F</kbd>
        )}
      </label>
      <div className="topbar__actions">
        <button type="button" className="btn btn--ghost" onClick={() => openDialog({ type: "download" })}>
          <Download size={18} /> Descargar
        </button>
        <button
          type="button"
          className={`icon-btn icon-btn--lg ${queueOpen ? "is-active" : ""}`}
          onClick={toggleQueue}
          aria-pressed={queueOpen}
          aria-label="Cola de reproducción"
          title="Cola de reproducción (Q)"
        >
          <ListMusic size={20} />
        </button>
      </div>
    </div>
  );
}
