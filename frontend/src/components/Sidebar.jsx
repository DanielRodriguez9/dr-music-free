import { Download, Heart, History, House, Keyboard, Library, Search } from "lucide-react";
import { useLibrary, useUI } from "../context/hooks";
import { formatTotal, plural } from "../lib/format";

const NAV = [
  { id: "home", label: "Inicio", icon: House },
  { id: "search", label: "Buscar", icon: Search },
  { id: "library", label: "Tu biblioteca", icon: Library },
];

export default function Sidebar() {
  const { view, navigate, openDialog, focusSearch } = useUI();
  const { songs, stats, activeDownloads } = useLibrary();
  const likedCount = songs.filter((s) => s.liked).length;
  const downloading = activeDownloads[0];

  const go = (id) => {
    navigate(id);
    if (id === "search") requestAnimationFrame(focusSearch);
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand__logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path d="M9 18V6l11-2v12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="6" cy="18" r="3" fill="currentColor" />
            <circle cx="17" cy="16" r="3" fill="currentColor" />
          </svg>
        </span>
        <span className="brand__name">DR Music</span>
      </div>

      <nav className="nav" aria-label="Principal">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className={`nav__item ${view === id ? "is-active" : ""}`} onClick={() => go(id)}>
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar__section">
        <p className="sidebar__label">Tu música</p>
        <button
          type="button"
          className={`nav__item nav__item--collection ${view === "liked" ? "is-active" : ""}`}
          onClick={() => go("liked")}
        >
          <span className="collection-icon collection-icon--liked">
            <Heart size={16} fill="currentColor" />
          </span>
          <span className="nav__text">
            <span>Tus me gusta</span>
            <small>{plural(likedCount, "canción", "canciones")}</small>
          </span>
        </button>
        <button
          type="button"
          className={`nav__item nav__item--collection ${view === "history" ? "is-active" : ""}`}
          onClick={() => go("history")}
        >
          <span className="collection-icon">
            <History size={16} />
          </span>
          <span className="nav__text">
            <span>Historial</span>
            <small>Lo que has escuchado</small>
          </span>
        </button>
      </div>

      <button type="button" className="download-cta" onClick={() => openDialog({ type: "download" })}>
        <Download size={18} />
        <span className="download-cta__text">
          <span>Descargar de YouTube</span>
          {downloading && (
            <small>
              {downloading.status === "processing" ? "Convirtiendo..." : `Descargando ${Math.round(downloading.progress)}%`}
            </small>
          )}
        </span>
        {downloading && (
          <span className="download-cta__bar" style={{ "--pct": `${downloading.progress}%` }} aria-hidden="true" />
        )}
      </button>

      <div className="sidebar__footer">
        <p>
          {plural(stats.playable, "canción", "canciones")} · {formatTotal(stats.duration)}
        </p>
        <button type="button" className="link link--muted" onClick={() => openDialog({ type: "shortcuts" })}>
          <Keyboard size={14} /> Atajos de teclado
        </button>
      </div>
    </aside>
  );
}
