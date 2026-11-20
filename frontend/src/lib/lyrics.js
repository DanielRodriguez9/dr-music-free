// Letras: qué línea toca en cada momento y de dónde pedirlas.

// la línea se resalta un poco antes de que suene: se lee a tiempo
export const LEAD_SECONDS = 0.25;

/** Índice de la línea que suena en el segundo `t` (-1 antes de la primera). Búsqueda binaria. */
export function activeLineIndex(lines, t) {
  if (!lines?.length) return -1;
  const at = t + LEAD_SECONDS;
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= at) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** Siguiente línea con texto después de `index` (los huecos instrumentales se saltan). */
export function nextTextLine(lines, index) {
  for (let i = index + 1; i < (lines?.length ?? 0); i++) {
    if (lines[i].text) return i;
  }
  return -1;
}

/** Clave de la letra de una canción (la misma que usa el servidor): el video o el id. */
export function lyricsKey(song) {
  if (!song) return null;
  return song.youtube_id || (typeof song.id === "number" ? `song-${song.id}` : null);
}

/** Ruta del servidor para pedir la letra (canción de la biblioteca o en línea). */
export function lyricsPath(song, fetch = true) {
  if (!song) return null;
  const f = fetch ? 1 : 0;
  if (typeof song.id === "number") return `/lyrics/song/${song.id}?fetch=${f}`;
  if (!song.youtube_id) return null;
  const q = new URLSearchParams({ title: song.title || "", fetch: String(f) });
  if (song.artist) q.set("artist", song.artist);
  if (song.duration) q.set("duration", String(Math.round(song.duration)));
  return `/lyrics/online/${song.youtube_id}?${q}`;
}

/** ¿Hay algo que mostrar? */
export const hasLyrics = (data) => data?.status === "synced" || data?.status === "plain";
