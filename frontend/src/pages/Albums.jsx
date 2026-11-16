import { ListFilter, Play } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { isPlayable } from "../api";
import Cover from "../components/Cover";
import { useLibrary, useUI } from "../context/hooks";
import useSongActions from "../hooks/useSongActions";
import { artistKey, coverSongOf } from "../lib/artists";
import { normalize, plural } from "../lib/format";
import Collection from "./Collection";

/** Todos los álbumes (de las etiquetas de los archivos y de YouTube Music). */
export function AlbumsPage() {
  const { albums } = useLibrary();
  const { navigate } = useUI();
  const { playAll } = useSongActions();
  const [filter, setFilter] = useState("");
  const q = normalize(useDeferredValue(filter).trim());

  const list = useMemo(
    () =>
      [...albums.values()]
        .filter((a) => !q || normalize(`${a.title} ${a.artist || ""}`).includes(q))
        .sort((a, b) => a.title.localeCompare(b.title, "es", { sensitivity: "base" })),
    [albums, q],
  );

  return (
    <div className="page">
      <h1 className="page-title">Álbumes</h1>
      <div className="actionbar">
        <p className="muted">{plural(albums.size, "álbum", "álbumes")}</p>
        <div className="actionbar__spacer" />
        <label className="filterbox">
          <ListFilter size={16} aria-hidden="true" />
          <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar álbumes" aria-label="Filtrar álbumes" />
        </label>
      </div>
      {albums.size === 0 ? (
        <p className="empty">
          Aún no hay álbumes. Salen de las etiquetas de los archivos: importa una carpeta de música en Ajustes, o descarga
          canciones de YouTube Music, que traen su álbum.
        </p>
      ) : list.length === 0 ? (
        <p className="empty">Ningún álbum coincide con «{filter}».</p>
      ) : (
        <div className="grid-cards">
          {list.map((al) => (
            <article key={al.key} className="card" onClick={() => navigate(`album:${al.key}`)}>
              <Cover song={coverSongOf(al.songs)} size="lg">
                {al.songs.some(isPlayable) && (
                  <button
                    type="button"
                    className="play-fab"
                    onClick={(e) => {
                      e.stopPropagation();
                      playAll(al.songs, al.title);
                    }}
                    aria-label={`Reproducir ${al.title}`}
                    title="Reproducir"
                  >
                    <Play size={20} fill="currentColor" />
                  </button>
                )}
              </Cover>
              <h3 className="card__title">
                <button type="button" className="link">
                  {al.title}
                </button>
              </h3>
              <p className="card__subtitle">
                {al.artist || "Varios artistas"} · {plural(al.songs.length, "canción", "canciones")}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/** Un álbum, en el orden de sus pistas. */
export function AlbumPage({ id }) {
  const { albums } = useLibrary();
  const { navigate } = useUI();
  const album = albums.get(id);
  if (!album) {
    return (
      <div className="page page--center">
        <p className="muted">Este álbum ya no está en tu biblioteca.</p>
        <button type="button" className="btn btn--ghost" onClick={() => navigate("albums")}>
          Ver álbumes
        </button>
      </div>
    );
  }
  return (
    <Collection
      key={`album-${album.key}`}
      id="album"
      title={album.title}
      kicker="Álbum"
      icon="album"
      heroSong={coverSongOf(album.songs)}
      subtitle={
        album.artist ? (
          <button type="button" className="link" onClick={() => navigate(`artist:${artistKey(album.artist)}`)}>
            {album.artist}
          </button>
        ) : null
      }
      songs={album.songs}
      orderLabel="Orden del álbum"
      emptyText="Sin canciones."
    />
  );
}
