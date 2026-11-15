import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, api, errorMessage, isPlayable, waitForDownload } from "../api";
import { LibraryContext } from "./contexts";

export default function LibraryProvider({ children }) {
  const [songs, setSongs] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const [downloads, setDownloads] = useState([]); // trabajos activos o recientes
  const [playsVersion, setPlaysVersion] = useState(0); // sube cada vez que se guarda una escucha

  const fetchSongs = useCallback(
    () =>
      api.get("/songs/").then(
        ({ data }) => {
          setSongs(data);
          setStatus("ready");
          setError(null);
          return data;
        },
        (err) => {
          setStatus("error");
          setError(errorMessage(err));
          throw err;
        },
      ),
    [],
  );

  useEffect(() => {
    fetchSongs().catch(() => {});
  }, [fetchSongs]);

  const byId = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);
  const playable = useMemo(() => songs.filter(isPlayable), [songs]);

  const stats = useMemo(() => {
    const duration = playable.reduce((acc, s) => acc + (s.duration || 0), 0);
    return { total: songs.length, playable: playable.length, missing: songs.length - playable.length, duration };
  }, [songs, playable]);

  const deleteSong = useCallback(async (id) => {
    await api.delete(`/songs/${id}`);
    setSongs((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const updateSong = useCallback(async (id, patch) => {
    const { data } = await api.patch(`/songs/${id}`, patch);
    setSongs((prev) => prev.map((s) => (s.id === id ? data : s)));
    return data;
  }, []);

  const replaceSong = (song) => setSongs((prev) => prev.map((s) => (s.id === song.id ? song : s)));

  /** Guarda una escucha en el historial. Con beacon=true se envía aunque se cierre la ventana. */
  const recordPlay = useCallback((payload, { beacon = false } = {}) => {
    const body = JSON.stringify(payload);
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(`${API_BASE}/plays/`, new Blob([body], { type: "text/plain" }));
      return;
    }
    api
      .post("/plays/", body, { headers: { "Content-Type": "text/plain" } })
      .then(({ data }) => {
        replaceSong(data.song);
        setPlaysVersion((v) => v + 1);
      })
      .catch(() => {});
  }, []);

  const toggleLike = useCallback(async (song) => {
    const { id } = song;
    const liked = !song.liked;
    setSongs((prev) => prev.map((s) => (s.id === id ? { ...s, liked } : s)));
    try {
      const { data } = await api.patch(`/songs/${id}`, { liked });
      replaceSong(data);
      return data.liked;
    } catch (err) {
      setSongs((prev) => prev.map((s) => (s.id === id ? { ...s, liked: !liked } : s)));
      throw err;
    }
  }, []);

  const patchJob = (job) =>
    setDownloads((prev) => {
      const others = prev.filter((j) => j.id !== job.id);
      return [job, ...others].slice(0, 20);
    });

  /** Descarga un enlace de YouTube. Devuelve { status: "exists"|"done", song?, job? } o lanza error. */
  const download = useCallback(
    async (url) => {
      const { data } = await api.post("/downloads/", { url });
      if (data.status === "exists") return { status: "exists", song: data.song };
      patchJob(data.job);
      const job = await waitForDownload(data.job.id, patchJob);
      if (job.status === "error") throw new Error(job.error);
      const list = await fetchSongs();
      return { status: "done", job, song: list.find((s) => s.id === job.song_id) };
    },
    [fetchSongs],
  );

  const activeDownloads = useMemo(
    () => downloads.filter((j) => ["queued", "downloading", "processing"].includes(j.status)),
    [downloads],
  );

  const value = useMemo(
    () => ({
      songs,
      byId,
      playable,
      stats,
      status,
      error,
      reload: fetchSongs,
      deleteSong,
      updateSong,
      recordPlay,
      playsVersion,
      toggleLike,
      download,
      downloads,
      activeDownloads,
    }),
    [songs, byId, playable, stats, status, error, fetchSongs, deleteSong, updateSong, recordPlay, playsVersion, toggleLike, download, downloads, activeDownloads],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}
