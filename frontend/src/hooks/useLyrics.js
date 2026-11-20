import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useUI } from "../context/hooks";
import { lyricsKey, lyricsPath } from "../lib/lyrics";

// Caché en memoria compartida por el panel, el karaoke y la apertura automática.
// "offline", "unavailable" y "disabled" no se guardan: al volver internet (o activar la búsqueda) se reintenta.
const TRANSIENT = new Set(["offline", "unavailable", "disabled", "error"]);
const cache = new Map();
const inflight = new Map();

function fetchLyrics(song, enabled) {
  const id = `${lyricsKey(song)}|${enabled ? 1 : 0}`;
  if (cache.has(id)) return Promise.resolve(cache.get(id));
  if (inflight.has(id)) return inflight.get(id);
  const p = api
    .get(lyricsPath(song, enabled), { timeout: 60000 })
    .then(({ data }) => {
      if (!TRANSIENT.has(data.status)) cache.set(id, data);
      return data;
    })
    .catch(() => ({ status: "error" }))
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

/** Letra de una canción: { data, loading, retry }. data.status: synced | plain | instrumental | none | offline | unavailable | disabled | error */
export default function useLyrics(song) {
  const { prefs } = useUI();
  const enabled = prefs.lyricsEnabled;
  const key = song && lyricsPath(song) ? `${lyricsKey(song)}|${enabled ? 1 : 0}` : null;
  const [state, setState] = useState({ key: null, data: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    fetchLyrics(song, enabled).then((data) => alive && setState({ key, data }));
    return () => {
      alive = false;
    };
    // song entra por su clave: los cambios de la canción que no cambian la clave no repiten la petición
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const retry = useCallback(() => {
    if (key) cache.delete(key);
    setState({ key: null, data: null }); // vuelve a mostrar "Buscando..."
    setAttempt((n) => n + 1);
  }, [key]);

  const ready = key && state.key === key;
  return { data: ready ? state.data : null, loading: Boolean(key) && !ready, retry };
}
