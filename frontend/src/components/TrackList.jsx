import { ArrowDown, ArrowUp, CircleAlert, Clock3, Ellipsis, Play } from "lucide-react";
import { memo } from "react";
import { artistLabel, isPlayable } from "../api";
import { usePlayer, useUI } from "../context/hooks";
import useSongActions from "../hooks/useSongActions";
import useStableHandlers from "../hooks/useStableHandlers";
import { formatDate, formatTime } from "../lib/format";
import Cover from "./Cover";
import Equalizer from "./Equalizer";
import LikeButton from "./LikeButton";

const COLUMNS = [
  { key: "title", label: "Título" },
  { key: "created_at", label: "Agregada", optional: "added" },
  { key: "play_count", label: "Escuchas", optional: "plays" },
  { key: "duration", label: <Clock3 size={15} aria-label="Duración" />, align: "end" },
];

const TrackRow = memo(function TrackRow({ song, index, isCurrent, isPlaying, showAdded, showPlays, h }) {
  const playable = isPlayable(song);
  return (
    <div
      className={`track ${isCurrent ? "is-current" : ""} ${playable ? "" : "is-missing"}`}
      role="row"
      tabIndex={0}
      onDoubleClick={() => h.play(song)}
      onKeyDown={(e) => {
        if (e.key === "Enter") h.play(song);
      }}
      onContextMenu={(e) => h.menu(e, song)}
    >
      <div className="track__index" role="cell">
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
      {showAdded && (
        <div className="track__meta" role="cell">
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
          onClick={(e) => h.menu(e, song)}
          aria-label={`Más opciones para ${song.title}`}
          title="Más opciones"
        >
          <Ellipsis size={18} />
        </button>
      </div>
    </div>
  );
});

/**
 * Lista de canciones estilo tabla. Doble clic o Enter reproduce; clic derecho abre el menú.
 * `songs` ya viene ordenada; `sort`/`onSort` son opcionales (cabeceras clicables).
 */
export default function TrackList({ songs, contextLabel, showAdded = true, showPlays = false, sort, onSort }) {
  const { current, isPlaying } = usePlayer();
  const { searchFor, openMenu } = useUI();
  const actions = useSongActions();

  const h = useStableHandlers({
    play: (song) => actions.playFrom(song, songs, contextLabel),
    like: actions.toggleLike,
    artist: searchFor,
    menu: (e, song) => openMenu(e, song, { list: songs, label: contextLabel }),
  });

  const cols = ["track-cols", showAdded && "has-added", showPlays && "has-plays"].filter(Boolean).join(" ");

  return (
    <div className={`tracklist ${cols}`} role="table" aria-label={contextLabel}>
      <div className="tracklist__head" role="row">
        <div role="columnheader" className="track__index">
          #
        </div>
        {COLUMNS.filter((c) => !c.optional || (c.optional === "added" ? showAdded : showPlays)).map((c) => {
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
            showAdded={showAdded}
            showPlays={showPlays}
            h={h}
          />
        ))}
      </div>
    </div>
  );
}
