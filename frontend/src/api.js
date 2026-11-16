import axios from "axios";

// Puente con la app de escritorio (Electron). En el navegador es null.
export const desktop = typeof window !== "undefined" && window.drmusic?.isDesktop ? window.drmusic : null;

// Dirección del backend: en la app de escritorio la da Electron (puerto libre en cada arranque).
export const API_BASE = desktop?.apiBase || import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export const api = axios.create({ baseURL: API_BASE });

// Ids: número = canción de la biblioteca; "yt:<video>" = canción en línea de YouTube
export const isOnlineId = (id) => typeof id === "string" && id.startsWith("yt:");
export const isOnline = (song) => Boolean(song?.online);

export const audioUrlForId = (id) =>
  isOnlineId(id) ? `${API_BASE}/stream/${id.slice(3)}` : `${API_BASE}/songs/${id}/audio`;

/** Resultado de búsqueda de YouTube -> canción en línea que entiende el reproductor. */
export function onlineTrack(r) {
  return {
    id: `yt:${r.youtube_id}`,
    online: true,
    youtube_id: r.youtube_id,
    title: r.title,
    artist: r.artist || r.channel || null,
    channel: r.channel || null,
    original_title: r.raw_title || r.title,
    duration: r.duration || null,
    thumbnail_url: r.thumbnail_url || null,
    youtube_url: r.url || `https://www.youtube.com/watch?v=${r.youtube_id}`,
    public_url: `/stream/${r.youtube_id}`,
    liked: false,
    play_count: 0,
    source: "online",
    status: "ok",
  };
}

// Prepara el audio en línea antes de pulsar (YouTube tarda unos segundos en darlo).
const prepared = new Map();
export function prepareOnline(youtubeId) {
  const last = prepared.get(youtubeId);
  if (last && Date.now() - last < 60 * 60 * 1000) return;
  prepared.set(youtubeId, Date.now());
  api
    .get(`/stream/${youtubeId}/info`, { params: { prefetch: 1 }, timeout: 120000 })
    .then(({ data }) => data.busy && prepared.delete(youtubeId)) // ocupado: se reintenta en otro momento
    .catch(() => prepared.delete(youtubeId));
}

export const audioUrl = (song) => (song?.public_url ? `${API_BASE}${song.public_url}` : null);

export const isPlayable = (song) => Boolean(song?.public_url);

export const artistLabel = (song) =>
  song?.artist || (song?.source === "local" ? "Archivo local" : song?.online ? "YouTube" : "Artista desconocido");

// Carátulas: las de la biblioteca se guardan en disco (funcionan sin internet) y las sirve
// el servidor. Las canciones en línea usan las miniaturas de YouTube, de mejor a peor
// (hq720/maxres/mq no tienen franjas negras; hqdefault 4:3 es el último recurso).
// Si ninguna existe, <Cover> muestra una nota musical.
export const coverUrlForId = (id) => `${API_BASE}/cover/${id}`;

export function coverUrls(song) {
  if (song && typeof song.id === "number") return [coverUrlForId(song.id)];
  const id = song?.youtube_id;
  if (!id) return song?.thumbnail_url ? [song.thumbnail_url] : [];
  return ["hq720", "maxresdefault", "mqdefault", "hqdefault"].map((f) => `https://i.ytimg.com/vi/${id}/${f}.jpg`);
}

export function errorMessage(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join("; ");
  return error?.message || "Error desconocido";
}

/** Tipo de error que manda el servidor ("outdated" -> sugerir actualizar yt-dlp, "offline"). */
export const errorKind = (error) => error?.response?.data?.kind || error?.kind || null;

// Sigue una descarga hasta que termine; llama a onProgress con cada actualización.
export async function waitForDownload(jobId, onProgress, intervalMs = 500) {
  for (;;) {
    const { data: job } = await api.get(`/downloads/${jobId}`);
    onProgress?.(job);
    if (job.status === "done" || job.status === "error") return job;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
