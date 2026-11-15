import axios from "axios";

// Dirección del backend. En la app de escritorio se podrá inyectar con VITE_API_URL.
export const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export const api = axios.create({ baseURL: API_BASE });

export const audioUrl = (song) => (song?.public_url ? `${API_BASE}${song.public_url}` : null);

export const artistLabel = (song) =>
  song?.artist || (song?.source === "local" ? "Archivo local" : "Artista desconocido");

// Sigue una descarga hasta que termine; llama a onProgress con cada actualización.
export async function waitForDownload(jobId, onProgress, intervalMs = 500) {
  for (;;) {
    const { data: job } = await api.get(`/downloads/${jobId}`);
    onProgress?.(job);
    if (job.status === "done" || job.status === "error") return job;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
