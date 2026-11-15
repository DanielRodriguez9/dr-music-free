import { Heart, Library, ListFilter, ListMusic, Pencil, Play, Shuffle, Tag, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { isPlayable } from "../api";
import TrackList from "../components/TrackList";
import { useCollections } from "../context/hooks";
import useSongActions from "../hooks/useSongActions";
import { formatTotal, normalize, plural, sortSongs } from "../lib/format";
import { load, save } from "../lib/storage";

const BASE_SORTS = {
  created_at: { label: "Agregadas recientemente", dir: "desc" },
  title: { label: "Título", dir: "asc" },
  artist: { label: "Artista", dir: "asc" },
  genre: { label: "Género", dir: "asc" },
  duration: { label: "Duración", dir: "desc" },
  play_count: { label: "Más escuchadas", dir: "desc" },
};
// en una lista de reproducción, el orden propio es el primero
const PLAYLIST_SORTS = { position: { label: "Orden de la lista", dir: "asc" }, ...BASE_SORTS };

const ICONS = { library: Library, liked: Heart, playlist: ListMusic, genre: Tag };
const NO_GENRE = "__none__";

const matches = (song, q) =>
  normalize(`${song.title} ${song.artist || ""} ${song.original_title || ""} ${song.album || ""} ${song.genre || ""}`).includes(q);

/**
 * Vista de una colección de canciones: Tu biblioteca, Tus me gusta, una lista o un género.
 * - `playlist`: activa el orden propio, reordenar arrastrando y las acciones de la lista.
 * - `genreFilter`: muestra el selector de género (biblioteca).
 */
export default function Collection({
  id, title, kicker, icon = "library", songs, emptyText, playlist = null, genreFilter = false, actions: extraActions,
}) {
  const { playAll, renamePlaylist, deletePlaylist } = useSongActions();
  const { genres, reorderPlaylist } = useCollections();
  const sorts = playlist ? PLAYLIST_SORTS : BASE_SORTS;
  const defaultSort = playlist ? { key: "position", dir: "asc" } : { key: "created_at", dir: "desc" };
  const [sortState, setSort] = useState(() => load(`sort.${id}`, defaultSort));
  const sort = sorts[sortState.key] ? sortState : defaultSort;
  const [filter, setFilter] = useState("");
  const [genre, setGenre] = useState(() => (genreFilter ? load(`genre.${id}`, "") : ""));

  const changeSort = (key) => {
    const next = sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: sorts[key].dir };
    setSort(next);
    save(`sort.${id}`, next);
  };
  const changeGenre = (value) => {
    setGenre(value);
    save(`genre.${id}`, value);
  };

  const inGenre = useMemo(() => {
    if (!genre) return songs;
    return songs.filter((s) => (genre === NO_GENRE ? !s.genre : s.genre === genre));
  }, [songs, genre]);

  const shown = useMemo(() => {
    const q = normalize(filter.trim());
    const list = q ? inGenre.filter((s) => matches(s, q)) : inGenre;
    if (sort.key === "position") return sort.dir === "asc" ? list : [...list].reverse();
    const sorted = sortSongs(list, sort);
    // las canciones sin archivo siempre al final
    return [...sorted.filter(isPlayable), ...sorted.filter((s) => !isPlayable(s))];
  }, [inGenre, sort, filter]);

  // reordenar solo tiene sentido viendo la lista entera en su orden propio
  const canReorder = playlist && sort.key === "position" && sort.dir === "asc" && !filter.trim();
  const onReorder = canReorder
    ? (songIds) => {
        const itemBySong = new Map(playlist.items.map((it) => [it.song_id, it.id]));
        reorderPlaylist(playlist.id, songIds.map((sid) => itemBySong.get(sid))).catch(() => {});
      }
    : undefined;

  const playable = inGenre.filter(isPlayable);
  const missing = inGenre.length - playable.length;
  const total = playable.reduce((acc, s) => acc + (s.duration || 0), 0);
  const Icon = ICONS[icon] ?? Library;

  return (
    <div className="page">
      <header className={`hero hero--${icon}`}>
        <div className="hero__art" aria-hidden="true">
          <Icon size={64} fill={icon === "liked" ? "currentColor" : "none"} />
        </div>
        <div className="hero__text">
          <p className="hero__kicker">{kicker}</p>
          {playlist ? (
            <h1>
              <button type="button" className="hero__title-btn" onClick={() => renamePlaylist(playlist)} title="Renombrar">
                {title}
              </button>
            </h1>
          ) : (
            <h1>{title}</h1>
          )}
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
        {playlist && (
          <>
            <button type="button" className="icon-btn icon-btn--lg" onClick={() => renamePlaylist(playlist)} aria-label="Renombrar lista" title="Renombrar lista">
              <Pencil size={20} />
            </button>
            <button type="button" className="icon-btn icon-btn--lg" onClick={() => deletePlaylist(playlist)} aria-label="Eliminar lista" title="Eliminar lista">
              <Trash2 size={20} />
            </button>
          </>
        )}
        {extraActions}
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
        {genreFilter && (
          <select className="select" value={genre} onChange={(e) => changeGenre(e.target.value)} aria-label="Filtrar por género">
            <option value="">Todos los géneros</option>
            {genres.map((g) => (
              <option key={g.id} value={g.name}>
                {g.name} ({g.count})
              </option>
            ))}
            <option value={NO_GENRE}>Sin género</option>
          </select>
        )}
        <select className="select" value={sort.key} onChange={(e) => changeSort(e.target.value)} aria-label="Ordenar por">
          {Object.entries(sorts).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {playlist && !canReorder && shown.length > 1 && (
        <p className="muted small reorder-hint">Para reordenar arrastrando, elige «Orden de la lista» y borra el filtro.</p>
      )}

      {songs.length === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : shown.length === 0 ? (
        <p className="empty">{filter ? `Nada coincide con «${filter}».` : "No hay canciones de este género."}</p>
      ) : (
        <TrackList
          songs={shown}
          contextLabel={title}
          sort={sort}
          onSort={(key) => (key in sorts ? changeSort(key) : null)}
          showPlays
          showGenre={icon !== "genre"}
          playlist={playlist}
          onReorder={onReorder}
        />
      )}
    </div>
  );
}
