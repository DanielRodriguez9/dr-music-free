import { ArrowDown, ArrowUp, CircleAlert, Clock3, Ellipsis, GripVertical, ListEnd, ListMinus, ListPlus, Play, Tag, X } from "lucide-react";
import { memo, useMemo, useRef, useState } from "react";
import { artistLabel, isPlayable } from "../api";
import { usePlayer, useUI } from "../context/hooks";
import useSongActions from "../hooks/useSongActions";
import useStableHandlers from "../hooks/useStableHandlers";
import { DRAG_TYPE, setDragImage } from "../lib/drag";
import { formatDate, formatTime } from "../lib/format";
import Cover from "./Cover";
import Equalizer from "./Equalizer";
import LikeButton from "./LikeButton";

const COLUMNS = [
  { key: "title", label: "Título" },
  { key: "genre", label: "Género", optional: "genre" },
  { key: "created_at", label: "Agregada", optional: "added" },
  { key: "play_count", label: "Escuchas", optional: "plays" },
  { key: "duration", label: <Clock3 size={15} aria-label="Duración" />, align: "end" },
];

const TrackRow = memo(function TrackRow({
  song, index, isCurrent, isPlaying, selected, drop, reorderable, showAdded, showPlays, showGenre, h,
}) {
  const playable = isPlayable(song);
  return (
    <div
      className={`track ${isCurrent ? "is-current" : ""} ${playable ? "" : "is-missing"} ${selected ? "is-selected" : ""} ${
        drop ? `drop-${drop}` : ""
      }`}
      role="row"
      aria-selected={selected}
      tabIndex={0}
      draggable
      data-index={index}
      onClick={(e) => h.select(e, song, index)}
      onDoubleClick={(e) => !e.target.closest("button") && h.play(song)}
      onKeyDown={(e) => {
        if (e.key === "Enter") h.play(song);
      }}
      onContextMenu={(e) => h.menu(e, song, index)}
      onDragStart={(e) => h.dragStart(e, song)}
      onDragEnd={h.dragEnd}
      onDragOver={(e) => h.dragOver(e, index)}
      onDrop={(e) => h.drop(e, index)}
    >
      <div className="track__index" role="cell">
        {reorderable && <GripVertical size={14} className="track__grip" aria-hidden="true" />}
        {isCurrent ? <Equalizer playing={isPlaying} /> : <span className="track__num">{index + 1}</span>}
        <button
          type="button"
          className="track__play"
          onClick={() => h.play(song)}
          aria-label={isCurrent && isPlaying ? "Pausar" : `Reproducir ${song.title}`}
          title={isCurrent && isPlaying ? "Pausar" : "Reproducir"}
        >
          <Play size={16} fill="currentColor" />
        </button>
      </div>
      <div className="track__main" role="cell">
        <Cover song={song} size="sm" />
        <div className="track__text">
          <span className="track__title" title={song.original_title || song.title}>
            {song.title}
          </span>
          <span className="track__artist">
            {!playable && (
              <span className="badge badge--warn" title="El archivo no está en la carpeta de música">
                <CircleAlert size={12} /> Falta archivo
              </span>
            )}
            {song.artist ? (
              <button type="button" className="link" onClick={() => h.artist(song.artist)}>
                {song.artist}
              </button>
            ) : (
              artistLabel(song)
            )}
          </span>
        </div>
      </div>
      {showGenre && (
        <div className="track__meta track__meta--genre" role="cell">
          {song.genre ? (
            <button type="button" className="link" onClick={() => h.genre(song.genre)}>
              {song.genre}
            </button>
          ) : (
            <span className="track__nogenre">—</span>
          )}
        </div>
      )}
      {showAdded && (
        <div className="track__meta track__meta--added" role="cell">
          {formatDate(song.created_at)}
        </div>
      )}
      {showPlays && (
        <div className="track__meta track__meta--num" role="cell">
          {song.play_count || "—"}
        </div>
      )}
      <div className="track__end" role="cell">
        <LikeButton song={song} onToggle={h.like} className="track__like" />
        <span className="track__duration">{song.duration ? formatTime(song.duration) : "—"}</span>
        <button
          type="button"
          className="icon-btn track__more"
          onClick={(e) => h.menu(e, song, index)}
          aria-label={`Más opciones para ${song.title}`}
          title="Más opciones"
        >
          <Ellipsis size={18} />
        </button>
      </div>
    </div>
  );
});

/** ¿Se suelta encima o debajo de la fila? */
function dropSide(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function gridColumns({ showGenre, showAdded, showPlays }, narrow) {
  return [
    "44px",
    "minmax(0, 1fr)",
    showGenre && !narrow && "130px",
    showAdded && !narrow && "150px",
    showPlays && "84px",
    "132px",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Lista de canciones estilo tabla.
 * - Doble clic o Enter reproduce; clic derecho abre el menú.
 * - Clic selecciona; Ctrl+clic suma o quita; Mayús+clic selecciona un rango; Ctrl+A todas.
 * - Las filas se pueden arrastrar a una lista del menú lateral. Con `onReorder`, también
 *   se reordenan arrastrando dentro de la lista.
 */
export default function TrackList({
  songs, contextLabel, showAdded = true, showPlays = false, showGenre = false, sort, onSort, playlist = null, onReorder,
}) {
  const { current, isPlaying } = usePlayer();
  const { searchFor, openMenu, navigate } = useUI();
  const actions = useSongActions();
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [dropAt, setDropAt] = useState(null); // { index, side: "before" | "after" }
  const anchorRef = useRef(null);
  const dragRef = useRef(null); // ids que se están arrastrando desde esta lista

  // la selección solo conserva canciones que siguen en la lista
  const selected = useMemo(() => {
    const ids = new Set(songs.map((s) => s.id));
    return new Set([...selectedIds].filter((id) => ids.has(id)));
  }, [songs, selectedIds]);
  const selectedSongs = useMemo(() => songs.filter((s) => selected.has(s.id)), [songs, selected]);

  const clear = () => setSelectedIds(new Set());

  const h = useStableHandlers({
    play: (song) => actions.playFrom(song, songs, contextLabel),
    like: actions.toggleLike,
    artist: searchFor,
    genre: (g) => navigate(`genre:${g}`),
    select: (e, song, index) => {
      if (e.target.closest("button, a")) return;
      if (e.shiftKey && anchorRef.current != null) {
        const [a, b] = [anchorRef.current, index].sort((x, y) => x - y);
        const range = songs.slice(a, b + 1).map((s) => s.id);
        setSelectedIds((prev) => new Set(e.ctrlKey || e.metaKey ? [...prev, ...range] : range));
        return;
      }
      anchorRef.current = index;
      if (e.ctrlKey || e.metaKey) {
        // actualización funcional: dos clics seguidos no se pisan
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(song.id)) next.delete(song.id);
          else next.add(song.id);
          return next;
        });
      } else {
        setSelectedIds(new Set([song.id]));
      }
    },
    menu: (e, song, index) => {
      let selection = selectedSongs;
      if (!selected.has(song.id)) {
        // clic derecho fuera de la selección: se selecciona esa fila
        anchorRef.current = index;
        setSelectedIds(new Set([song.id]));
        selection = [song];
      }
      openMenu(e, song, { list: songs, label: contextLabel, selection, playlistId: playlist?.id });
    },
    dragStart: (e, song) => {
      const ids = selected.has(song.id) ? songs.filter((s) => selected.has(s.id)).map((s) => s.id) : [song.id];
      if (!selected.has(song.id)) setSelectedIds(new Set([song.id]));
      dragRef.current = ids;
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids));
      e.dataTransfer.effectAllowed = onReorder ? "copyMove" : "copy";
      setDragImage(e, ids.length === 1 ? song.title : `${ids.length} canciones`);
    },
    dragEnd: () => {
      dragRef.current = null;
      setDropAt(null);
    },
    dragOver: (e, index) => {
      if (!onReorder || !dragRef.current) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const side = dropSide(e);
      setDropAt((cur) => (cur?.index === index && cur.side === side ? cur : { index, side }));
    },
    drop: (e, index) => {
      if (!onReorder || !dragRef.current) return;
      e.preventDefault();
      const moving = new Set(dragRef.current);
      const side = dropSide(e); // del propio evento: el estado puede ir un paso atrás
      const target = index + (side === "after" ? 1 : 0);
      const before = songs.slice(0, target).filter((s) => !moving.has(s.id));
      const after = songs.slice(target).filter((s) => !moving.has(s.id));
      const moved = songs.filter((s) => moving.has(s.id));
      dragRef.current = null;
      setDropAt(null);
      onReorder([...before, ...moved, ...after].map((s) => s.id));
    },
  });

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelectedIds(new Set(songs.map((s) => s.id)));
    } else if (e.key === "Escape" && selected.size) {
      clear();
    } else if (e.key === "Delete" && playlist && selectedSongs.length) {
      actions.removeFromPlaylist(playlist, selectedSongs);
    }
  };

  const flags = { showGenre, showAdded, showPlays };
  const style = { "--cols": gridColumns(flags, false), "--cols-narrow": gridColumns(flags, true) };
  const menuFor = (page) => (e) => openMenu(e, selectedSongs[0], { selection: selectedSongs, page, label: contextLabel, list: songs });

  return (
    <div className="tracklist" style={style} role="table" aria-label={contextLabel} aria-multiselectable="true" onKeyDown={onKeyDown}>
      <div className="tracklist__head" role="row">
        <div role="columnheader" className="track__index">
          #
        </div>
        {COLUMNS.filter((c) => !c.optional || flags[`show${c.optional[0].toUpperCase()}${c.optional.slice(1)}`]).map((c) => {
          const active = sort?.key === c.key;
          return (
            <div key={c.key} role="columnheader" className={`th th--${c.key} ${c.align === "end" ? "th--end" : ""}`}>
              {onSort ? (
                <button type="button" className={`th__btn ${active ? "is-active" : ""}`} onClick={() => onSort(c.key)}>
                  {c.label}
                  {active && (sort.dir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
                </button>
              ) : (
                c.label
              )}
            </div>
          );
        })}
      </div>
      <div className="tracklist__body">
        {songs.map((song, i) => (
          <TrackRow
            key={song.id}
            song={song}
            index={i}
            isCurrent={current?.id === song.id}
            isPlaying={current?.id === song.id && isPlaying}
            selected={selected.has(song.id)}
            drop={dropAt?.index === i ? dropAt.side : null}
            reorderable={Boolean(onReorder)}
            showAdded={showAdded}
            showPlays={showPlays}
            showGenre={showGenre}
            h={h}
          />
        ))}
      </div>

      {selected.size > 1 && (
        <div className="selectionbar" role="toolbar" aria-label="Canciones seleccionadas">
          <span className="selectionbar__count">{selected.size.toLocaleString("es")} seleccionadas</span>
          <button type="button" className="btn btn--small btn--subtle" onClick={() => actions.addToQueue(selectedSongs)}>
            <ListEnd size={15} /> A la cola
          </button>
          <button type="button" className="btn btn--small btn--subtle" onClick={menuFor("playlists")}>
            <ListPlus size={15} /> Añadir a lista
          </button>
          <button type="button" className="btn btn--small btn--subtle" onClick={menuFor("genres")}>
            <Tag size={15} /> Género
          </button>
          {playlist && (
            <button type="button" className="btn btn--small btn--subtle" onClick={() => actions.removeFromPlaylist(playlist, selectedSongs)}>
              <ListMinus size={15} /> Quitar de la lista
            </button>
          )}
          <button type="button" className="icon-btn" onClick={clear} aria-label="Quitar la selección" title="Quitar la selección (Esc)">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
