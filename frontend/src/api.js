import axios from "axios";

// Dirección del backend. En la app de escritorio se podrá inyectar con VITE_API_URL.
export const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export const api = axios.create({ baseURL: API_BASE });

export const audioUrlForId = (id) => `${API_BASE}/songs/${id}/audio`;

export const audioUrl = (song) => (song?.public_url ? `${API_BASE}${song.public_url}` : null);

export const isPlayable = (song) => Boolean(song?.public_url);

export const artistLabel = (song) =>
  song?.artist || (song?.source === "local" ? "Archivo local" : "Artista desconocido");

// Miniaturas de YouTube, de mejor a peor. hq720/maxres/mq no tienen franjas negras;
// hqdefault (4:3) es el último recurso. Si ninguna existe, <Cover> muestra una nota musical.
export function coverUrls(song) {
  const id = song?.youtube_id;
  if (!id) return song?.thumbnail_url ? [song.thumbnail_url] : [];
  return ["hq720", "maxresdefault", "mqdefault", "hqdefault"].map((f) => `https://i.ytimg.com/vi/${id}/${f}.jpg`);
}

export const errorMessage = (error) => error?.response?.data?.detail || error?.message || "Error desconocido";

// Sigue una descarga hasta que termine; llama a onProgress con cada actualización.
export async function waitForDownload(jobId, onProgress, intervalMs = 500) {
  for (;;) {
    const { data: job } = await api.get(`/downloads/${jobId}`);
    onProgress?.(job);
    if (job.status === "done" || job.status === "error") return job;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
