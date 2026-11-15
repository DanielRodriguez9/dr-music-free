import { useDeferredValue, useMemo } from "react";
import TrackList from "../components/TrackList";
import { useLibrary, useUI } from "../context/hooks";
import { normalize, plural } from "../lib/format";

function artistCounts(songs) {
  const map = new Map();
  for (const s of songs) {
    if (!s.artist) continue;
    const key = normalize(s.artist);
    const cur = map.get(key) ?? { name: s.artist, count: 0, plays: 0 };
    cur.count += 1;
    cur.plays += s.play_count || 0;
    map.set(key, cur);
  }
  return [...map.values()];
}

export default function Search() {
  const { songs } = useLibrary();
  const { query, searchFor } = useUI();
  // la lista se filtra un instante después de teclear: la escritura nunca se traba
  const deferred = useDeferredValue(query);
  const q = normalize(deferred.trim());

  const artists = useMemo(() => artistCounts(songs), [songs]);

  const results = useMemo(() => {
    if (!q) return { songs: [], artists: [] };
    const words = q.split(/\s+/);
    const hit = (text) => words.every((w) => text.includes(w));
    const found = songs
      .map((s) => {
        const title = normalize(s.title);
        const artist = normalize(s.artist || "");
        const extra = normalize(`${s.original_title || ""} ${s.album || ""}`);
        if (!hit(`${title} ${artist} ${extra}`)) return null;
        // primero lo que empieza igual, luego título, luego artista
        const score = (title.startsWith(q) ? 0 : 2) + (title.includes(q) ? 0 : 1) + (artist.includes(q) ? 0 : 1);
        return { s, score };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)
      .map((r) => r.s);
    return {
      songs: found,
      artists: artists.filter((a) => hit(normalize(a.name))).sort((a, b) => b.count - a.count).slice(0, 12),
    };
  }, [q, songs, artists]);

  if (!q) {
    const top = [...artists].sort((a, b) => b.plays - a.plays || b.count - a.count).slice(0, 30);
    return (
      <div className="page">
        <h1 className="page-title">Buscar</h1>
        <p className="muted">Escribe arriba el nombre de una canción o artista.</p>
        <h2 className="section-title">Tus artistas</h2>
        <div className="chips">
          {top.map((a) => (
            <button key={a.name} type="button" className="chip" onClick={() => searchFor(a.name)}>
              {a.name}
              <span className="chip__count">{a.count}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Resultados para «{deferred.trim()}»</h1>
      {results.artists.length > 0 && (
        <>
          <h2 className="section-title">Artistas</h2>
          <div className="chips">
            {results.artists.map((a) => (
              <button key={a.name} type="button" className="chip" onClick={() => searchFor(a.name)}>
                {a.name}
                <span className="chip__count">{a.count}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <h2 className="section-title">Canciones · {plural(results.songs.length, "resultado", "resultados")}</h2>
      {results.songs.length ? (
        <TrackList songs={results.songs} contextLabel={`Búsqueda: ${deferred.trim()}`} showAdded={false} />
      ) : (
        <p className="empty">No hay canciones que coincidan. Prueba con otras palabras.</p>
      )}
    </div>
  );
}
