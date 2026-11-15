import { Download, Heart, History, House, Keyboard, Library, ListMusic, Plus, Search, Settings, Tag } from "lucide-react";
import { useState } from "react";
import { useCollections, useLibrary, useUI } from "../context/hooks";
import useSongActions from "../hooks/useSongActions";
import { hasSongs, readSongs } from "../lib/drag";
import { formatTotal, plural } from "../lib/format";

const NAV = [
  { id: "home", label: "Inicio", icon: House },
  { id: "search", label: "Buscar", icon: Search },
  { id: "library", label: "Tu biblioteca", icon: Library },
];

/** Elemento del menú lateral que acepta canciones arrastradas. */
function DropItem({ active, onClick, onDropSongs, onContextMenu, icon, title, subtitle, className = "" }) {
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      className={`nav__item nav__item--collection ${active ? "is-active" : ""} ${over ? "is-drop" : ""} ${className}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDragOver={(e) => {
        if (!onDropSongs || !hasSongs(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!over) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!onDropSongs) return;
        e.preventDefault();
        const ids = readSongs(e);
        if (ids.length) onDropSongs(ids);
      }}
      title={title}
    >
      {icon}
      <span className="nav__text">
        <span className="nav__name">{title}</span>
        {subtitle && <small>{subtitle}</small>}
      </span>
    </button>
  );
}

export default function Sidebar() {
  const { view, navigate, openDialog, focusSearch, openMenu } = useUI();
  const { songs, byId, stats, activeDownloads } = useLibrary();
  const { playlists, genres } = useCollections();
  const actions = useSongActions();
  const songsFor = (ids) => ids.map((id) => byId.get(id)).filter(Boolean);
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

      <div className="sidebar__section">
        <div className="sidebar__row">
          <p className="sidebar__label">Listas</p>
          <button type="button" className="icon-btn sidebar__add" onClick={() => actions.createPlaylist()} aria-label="Nueva lista" title="Nueva lista">
            <Plus size={16} />
          </button>
        </div>
        {playlists.length === 0 && <p className="sidebar__hint">Crea una lista con «+» o desde el menú de una canción.</p>}
        {playlists.map((p) => (
          <DropItem
            key={p.id}
            active={view === `playlist:${p.id}`}
            onClick={() => go(`playlist:${p.id}`)}
            onDropSongs={(ids) => actions.addToPlaylist(songsFor(ids), p)}
            onContextMenu={(e) => openMenu(e, null, { playlist: p })}
            icon={
              <span className="collection-icon collection-icon--playlist">
                <ListMusic size={16} />
              </span>
            }
            title={p.name}
            subtitle={plural(p.items.length, "canción", "canciones")}
          />
        ))}
      </div>

      <div className="sidebar__section">
        <div className="sidebar__row">
          <p className="sidebar__label">Géneros</p>
          <button type="button" className="icon-btn sidebar__add" onClick={() => actions.createGenreFor([])} aria-label="Nuevo género" title="Nuevo género">
            <Plus size={16} />
          </button>
        </div>
        {genres.map((g) => (
          <DropItem
            key={g.id}
            className="nav__item--genre"
            active={view === `genre:${g.name}`}
            onClick={() => go(`genre:${g.name}`)}
            onDropSongs={(ids) => actions.setGenre(songsFor(ids), g.name)}
            onContextMenu={(e) => openMenu(e, null, { genre: g })}
            icon={<Tag size={15} className="genre-icon" />}
            title={g.name}
            subtitle={g.count ? String(g.count) : null}
          />
        ))}
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
        <div className="sidebar__links">
          <button
            type="button"
            className={`link link--muted ${view === "settings" ? "is-active" : ""}`}
            onClick={() => go("settings")}
          >
            <Settings size={14} /> Ajustes
          </button>
          <button type="button" className="link link--muted" onClick={() => openDialog({ type: "shortcuts" })}>
            <Keyboard size={14} /> Atajos
          </button>
        </div>
      </div>
    </aside>
  );
}
