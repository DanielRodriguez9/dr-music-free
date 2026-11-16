import { ListFilter, Play } from "lucide-react";
import { memo, useDeferredValue, useMemo, useState } from "react";
import { isPlayable } from "../api";
import Cover from "../components/Cover";
import { useLibrary, useUI } from "../context/hooks";
import useSongActions from "../hooks/useSongActions";
import { albumKey, artistKey, coverSongOf } from "../lib/artists";
import { normalize, plural } from "../lib/format";
import { load, save } from "../lib/storage";
import Collection from "./Collection";

const SORTS = {
  plays: { label: "Más escuchados", cmp: (a, b) => b.plays - a.plays || b.songs.length - a.songs.length },
  songs: { label: "Más canciones", cmp: (a, b) => b.songs.length - a.songs.length || b.plays - a.plays },
  recent: { label: "Escuchados recientemente", cmp: (a, b) => (b.lastPlayed || "").localeCompare(a.lastPlayed || "") },
  name: { label: "Nombre", cmp: (a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }) },
};

const ArtistCard = memo(function ArtistCard({ artist, onOpen, onPlay }) {
  const playable = artist.songs.filter(isPlayable).length;
  return (
    <article className="card card--artist" onClick={() => onOpen(artist)}>
      <Cover song={coverSongOf(artist.songs)} size="lg" className="cover--round">
        {playable > 0 && (
          <button
            type="button"
            className="play-fab"
            onClick={(e) => {
              e.stopPropagation();
              onPlay(artist);
            }}
            aria-label={`Reproducir ${artist.name}`}
            title="Reproducir"
          >
            <Play size={20} fill="currentColor" />
          </button>
        )}
      </Cover>
      <h3 className="card__title">
        <button type="button" className="link">
          {artist.name}
        </button>
      </h3>
      <p className="card__subtitle">{plural(artist.songs.length, "canción", "canciones")}</p>
    </article>
  );
});

/** Todos los artistas de la biblioteca. */
export function ArtistsPage() {
  const { artists, stats } = useLibrary();
  const { navigate } = useUI();
  const { playAll } = useSongActions();
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState(() => load("sort.artists", "plays"));
  const q = normalize(useDeferredValue(filter).trim());

  const list = useMemo(() => {
    const all = [...artists.values()].filter((a) => !q || normalize(a.name).includes(q));
    return all.sort(SORTS[sort]?.cmp ?? SORTS.plays.cmp);
  }, [artists, q, sort]);

  return (
    <div className="page">
      <h1 className="page-title">Artistas</h1>
      <div className="actionbar">
        <p className="muted">
          {plural(artists.size, "artista", "artistas")} en {plural(stats.total, "canción", "canciones")}
        </p>
        <div className="actionbar__spacer" />
        <label className="filterbox">
          <ListFilter size={16} aria-hidden="true" />
          <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar artistas" aria-label="Filtrar artistas" />
        </label>
        <select
          className="select"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            save("sort.artists", e.target.value);
          }}
          aria-label="Ordenar artistas"
        >
          {Object.entries(SORTS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      {list.length === 0 ? (
        <p className="empty">{q ? `Ningún artista coincide con «${filter}».` : "Aún no hay artistas en tu biblioteca."}</p>
      ) : (
        <div className="grid-cards">
          {list.map((a) => (
            <ArtistCard
              key={a.key}
              artist={a}
              onOpen={(x) => navigate(`artist:${x.key}`)}
              onPlay={(x) => playAll(x.songs, x.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Un artista: sus álbumes y todas sus canciones (también colaboraciones). */
export function ArtistPage({ id }) {
  const { artists } = useLibrary();
  const { navigate } = useUI();
  const artist = artists.get(id) ?? artists.get(artistKey(id));

  const albums = useMemo(() => {
    if (!artist) return [];
    const map = new Map();
    for (const s of artist.songs) {
      if (!s.album?.trim()) continue;
      const key = albumKey(s);
      if (!map.has(key)) map.set(key, { key, title: s.album.trim(), songs: [] });
      map.get(key).songs.push(s);
    }
    return [...map.values()];
  }, [artist]);

  if (!artist) {
    return (
      <div className="page page--center">
        <p className="muted">Este artista ya no está en tu biblioteca.</p>
        <button type="button" className="btn btn--ghost" onClick={() => navigate("artists")}>
          Ver artistas
        </button>
      </div>
    );
  }

  const collabs = artist.songs.length - artist.main;
  return (
    <Collection
      key={`artist-${artist.key}`}
      id="artist"
      title={artist.name}
      kicker="Artista"
      icon="artist"
      heroSong={coverSongOf(artist.songs)}
      subtitle={collabs > 0 ? `Incluye ${plural(collabs, "colaboración", "colaboraciones")}` : null}
      songs={artist.songs}
      defaultSortKey="play_count"
      emptyText="Sin canciones."
      beforeList={
        albums.length > 0 && (
          <section className="shelf">
            <header className="shelf__header">
              <h2>Álbumes</h2>
            </header>
            <div className="shelf__grid">
              {albums.map((al) => (
                <article key={al.key} className="card card--link" onClick={() => navigate(`album:${al.key}`)}>
                  <Cover song={coverSongOf(al.songs)} size="lg" />
                  <h3 className="card__title">
                    <button type="button" className="link">
                      {al.title}
                    </button>
                  </h3>
                  <p className="card__subtitle">{plural(al.songs.length, "canción", "canciones")}</p>
                </article>
              ))}
            </div>
          </section>
        )
      }
    />
  );
}
