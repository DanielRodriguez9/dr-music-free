import { Heart, Library, ListFilter, Play, Shuffle } from "lucide-react";
import { useMemo, useState } from "react";
import { isPlayable } from "../api";
import TrackList from "../components/TrackList";
import useSongActions from "../hooks/useSongActions";
import { formatTotal, normalize, plural, sortSongs } from "../lib/format";
import { load, save } from "../lib/storage";

const SORTS = {
  created_at: { label: "Agregadas recientemente", dir: "desc" },
  title: { label: "Título", dir: "asc" },
  artist: { label: "Artista", dir: "asc" },
  duration: { label: "Duración", dir: "desc" },
  play_count: { label: "Más escuchadas", dir: "desc" },
};

const matches = (song, q) =>
  normalize(`${song.title} ${song.artist || ""} ${song.original_title || ""} ${song.album || ""}`).includes(q);

/** Vista de una colección de canciones (Tu biblioteca, Tus me gusta). */
export default function Collection({ id, title, kicker, icon = "library", songs, emptyText }) {
  const { playAll } = useSongActions();
  const [sort, setSort] = useState(() => load(`sort.${id}`, { key: "created_at", dir: "desc" }));
  const [filter, setFilter] = useState("");

  const changeSort = (key) => {
    const next = sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: SORTS[key].dir };
    setSort(next);
    save(`sort.${id}`, next);
  };

  const shown = useMemo(() => {
    const q = normalize(filter.trim());
    const list = q ? songs.filter((s) => matches(s, q)) : songs;
    const sorted = sortSongs(list, sort);
    // las canciones sin archivo siempre al final
    return [...sorted.filter(isPlayable), ...sorted.filter((s) => !isPlayable(s))];
  }, [songs, sort, filter]);

  const playable = songs.filter(isPlayable);
  const missing = songs.length - playable.length;
  const total = playable.reduce((acc, s) => acc + (s.duration || 0), 0);
  const Icon = icon === "liked" ? Heart : Library;

  return (
    <div className="page">
      <header className={`hero hero--${icon}`}>
        <div className="hero__art" aria-hidden="true">
          <Icon size={64} fill={icon === "liked" ? "currentColor" : "none"} />
        </div>
        <div className="hero__text">
          <p className="hero__kicker">{kicker}</p>
          <h1>{title}</h1>
          <p className="hero__meta">
            {plural(playable.length, "canción", "canciones")} · {formatTotal(total)}
            {missing > 0 && <span className="muted"> · {plural(missing, "sin archivo", "sin archivo")}</span>}
          </p>
        </div>
      </header>

      <div className="actionbar">
        <button
          type="button"
          className="play-btn play-btn--xl"
          onClick={() => playAll(shown, title)}
          disabled={!playable.length}
          aria-label={`Reproducir ${title}`}
          title="Reproducir"
        >
          <Play size={24} fill="currentColor" />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--lg"
          onClick={() => playAll(shown, title, { shuffle: true })}
          disabled={!playable.length}
          aria-label="Reproducir en aleatorio"
          title="Reproducir en aleatorio"
        >
          <Shuffle size={22} />
        </button>
        <div className="actionbar__spacer" />
        <label className="filterbox">
          <ListFilter size={16} aria-hidden="true" />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Filtrar en ${title}`}
            aria-label={`Filtrar en ${title}`}
          />
        </label>
        <select
          className="select"
          value={sort.key}
          onChange={(e) => changeSort(e.target.value)}
          aria-label="Ordenar por"
        >
          {Object.entries(SORTS).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {songs.length === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : shown.length === 0 ? (
        <p className="empty">Nada coincide con «{filter}».</p>
      ) : (
        <TrackList songs={shown} contextLabel={title} sort={sort} onSort={changeSort} showPlays />
      )}
    </div>
  );
}
