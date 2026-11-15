import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { CollectionsContext } from "./contexts";
import { useLibrary } from "./hooks";

/** Listas de reproducción y géneros. */
export default function CollectionsProvider({ children }) {
  const { status, applySongs, reload } = useLibrary();
  const [playlists, setPlaylists] = useState([]);
  const [genres, setGenres] = useState([]);

  const fetchAll = useCallback(
    () =>
      Promise.all([api.get("/playlists/"), api.get("/genres/")]).then(([pl, gn]) => {
        setPlaylists(pl.data);
        setGenres(gn.data);
      }),
    [],
  );

  useEffect(() => {
    if (status === "ready") fetchAll().catch(() => {});
  }, [status, fetchAll]);

  const putPlaylist = (pl) => setPlaylists((prev) => prev.map((p) => (p.id === pl.id ? pl : p)));

  // ---------- listas ----------
  const createPlaylist = useCallback(async (name, songIds = []) => {
    const { data } = await api.post("/playlists/", { name, song_ids: songIds });
    setPlaylists((prev) => [...prev, data]);
    return data;
  }, []);

  const renamePlaylist = useCallback(async (id, name) => {
    const { data } = await api.patch(`/playlists/${id}`, { name });
    putPlaylist(data);
    return data;
  }, []);

  const deletePlaylist = useCallback(async (id) => {
    await api.delete(`/playlists/${id}`);
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
  }, []);

  /** Devuelve { added, skipped } (las que ya estaban no se repiten). */
  const addToPlaylist = useCallback(async (id, songIds) => {
    const { data } = await api.post(`/playlists/${id}/songs`, { song_ids: songIds });
    putPlaylist(data.playlist);
    return data;
  }, []);

  const removeFromPlaylist = useCallback(async (id, itemIds) => {
    const gone = new Set(itemIds);
    setPlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, items: p.items.filter((it) => !gone.has(it.id)) } : p)));
    try {
      const { data } = await api.post(`/playlists/${id}/remove`, { item_ids: itemIds });
      putPlaylist(data);
    } catch (err) {
      fetchAll().catch(() => {});
      throw err;
    }
  }, [fetchAll]);

  /** Nuevo orden (lista completa de item ids). Se ve al instante y luego se guarda. */
  const reorderPlaylist = useCallback(async (id, itemIds) => {
    setPlaylists((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const byItem = new Map(p.items.map((it) => [it.id, it]));
        return { ...p, items: itemIds.map((i) => byItem.get(i)).filter(Boolean) };
      }),
    );
    try {
      const { data } = await api.put(`/playlists/${id}/order`, { item_ids: itemIds });
      putPlaylist(data);
    } catch (err) {
      fetchAll().catch(() => {});
      throw err;
    }
  }, [fetchAll]);

  // ---------- géneros ----------
  const refreshGenres = useCallback(() => api.get("/genres/").then(({ data }) => setGenres(data)), []);

  /** Asigna (o quita, con null) el género de varias canciones. */
  const setGenre = useCallback(
    async (songIds, genre) => {
      const { data } = await api.post("/songs/bulk", { song_ids: songIds, genre: genre || null });
      applySongs(data);
      refreshGenres().catch(() => {});
      return data;
    },
    [applySongs, refreshGenres],
  );

  const createGenre = useCallback(async (name) => {
    const { data } = await api.post("/genres/", { name });
    setGenres(data);
    return data.find((g) => g.name.toLowerCase() === name.trim().toLowerCase());
  }, []);

  const renameGenre = useCallback(
    async (id, name) => {
      const { data } = await api.patch(`/genres/${id}`, { name });
      setGenres(data);
      await reload(); // las canciones de ese género cambian de nombre
      return data;
    },
    [reload],
  );

  const deleteGenre = useCallback(
    async (id) => {
      const { data } = await api.delete(`/genres/${id}`);
      setGenres(data);
      await reload();
    },
    [reload],
  );

  const playlistById = useMemo(() => new Map(playlists.map((p) => [p.id, p])), [playlists]);

  const value = useMemo(
    () => ({
      playlists,
      playlistById,
      genres,
      createPlaylist,
      renamePlaylist,
      deletePlaylist,
      addToPlaylist,
      removeFromPlaylist,
      reorderPlaylist,
      setGenre,
      createGenre,
      renameGenre,
      deleteGenre,
      reloadCollections: fetchAll,
    }),
    [playlists, playlistById, genres, createPlaylist, renamePlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist,
      reorderPlaylist, setGenre, createGenre, renameGenre, deleteGenre, fetchAll],
  );

  return <CollectionsContext.Provider value={value}>{children}</CollectionsContext.Provider>;
}
