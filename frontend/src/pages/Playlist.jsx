import { useMemo } from "react";
import { useCollections, useLibrary } from "../context/hooks";
import Collection from "./Collection";

/** Una lista de reproducción. */
export function PlaylistPage({ id }) {
  const { playlistById, playlists } = useCollections();
  const { byId } = useLibrary();
  const playlist = playlistById.get(Number(id));
  const songs = useMemo(
    () => (playlist ? playlist.items.map((it) => byId.get(it.song_id)).filter(Boolean) : []),
    [playlist, byId],
  );

  if (!playlist) {
    return (
      <div className="page page--center">
        <p className="muted">{playlists.length ? "Esta lista ya no existe." : "Cargando..."}</p>
      </div>
    );
  }
  return (
    <Collection
      key={`playlist-${playlist.id}`}
      id={`playlist.${playlist.id}`}
      title={playlist.name}
      kicker="Lista de reproducción"
      icon="playlist"
      songs={songs}
      playlist={playlist}
      emptyText="Esta lista está vacía. Añade canciones con clic derecho → «Añadir a una lista», o arrástralas hasta su nombre en el menú lateral."
    />
  );
}

/** Todas las canciones de un género. */
export function GenrePage({ name }) {
  const { songs } = useLibrary();
  const list = useMemo(() => songs.filter((s) => s.genre === name), [songs, name]);
  return (
    <Collection
      key={`genre-${name}`}
      id={`genre.${name}`}
      title={name}
      kicker="Género"
      icon="genre"
      songs={list}
      emptyText={`Aún no hay canciones de ${name}. Asígnalo con clic derecho → «Asignar género», también a varias a la vez.`}
    />
  );
}
