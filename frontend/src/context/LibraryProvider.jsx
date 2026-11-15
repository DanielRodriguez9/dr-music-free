import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, api, errorMessage, isPlayable, waitForDownload } from "../api";
import { load, save } from "../lib/storage";
import { LibraryContext } from "./contexts";

export default function LibraryProvider({ children }) {
  const [songs, setSongs] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const [downloads, setDownloads] = useState([]); // trabajos activos o recientes
  const [playsVersion, setPlaysVersion] = useState(0); // sube cada vez que se guarda una escucha
  // canciones en línea (YouTube sin descargar) que están o estuvieron en la cola: "yt:<id>" -> datos
  const [online, setOnline] = useState(() => {
    const saved = load("onlineTracks", []);
    return new Map(Array.isArray(saved) ? saved.filter((t) => t?.id).map((t) => [t.id, t]) : []);
  });

  useEffect(() => {
    // se guardan las últimas 300 para poder restaurar la cola al reabrir
    save("onlineTracks", [...online.values()].slice(-300));
  }, [online]);

  /** Registra canciones en línea para que el reproductor las conozca. */
  const registerOnline = useCallback((tracks) => {
    setOnline((prev) => {
      if (tracks.every((t) => prev.get(t.id)?.title === t.title)) return prev;
      const next = new Map(prev);
      for (const t of tracks) {
        next.delete(t.id); // al final: las más recientes se conservan
        next.set(t.id, t);
      }
      return next;
    });
  }, []);

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

  const byId = useMemo(() => {
    const map = new Map(online);
    for (const s of songs) map.set(s.id, s);
    return map;
  }, [songs, online]);
  const byYoutubeId = useMemo(() => new Map(songs.filter((s) => s.youtube_id).map((s) => [s.youtube_id, s])), [songs]);
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

  /** Sustituye varias canciones por su versión nueva (p. ej. tras cambiar el género). */
  const applySongs = useCallback((list) => {
    const map = new Map(list.map((s) => [s.id, s]));
    setSongs((prev) => prev.map((s) => map.get(s.id) ?? s));
  }, []);

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
        if (data.song) replaceSong(data.song);
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
      if (job.status === "error") {
        const err = new Error(job.error);
        err.kind = job.error_kind; // "outdated" -> sugerir actualizar yt-dlp
        throw err;
      }
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
      byYoutubeId,
      registerOnline,
      applySongs,
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
    [songs, byId, byYoutubeId, registerOnline, applySongs, playable, stats, status, error, fetchSongs, deleteSong, updateSong, recordPlay, playsVersion, toggleLike, download, downloads, activeDownloads],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}
