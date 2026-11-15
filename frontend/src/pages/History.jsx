import { History as HistoryIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, artistLabel, errorMessage } from "../api";
import Cover from "../components/Cover";
import { useLibrary, useUI } from "../context/hooks";
import useSongActions from "../hooks/useSongActions";
import { formatTime, formatTotal, plural } from "../lib/format";

const timeFmt = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function dayLabel(date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Hoy";
  if (date.toDateString() === yesterday.toDateString()) return "Ayer";
  const text = dayFmt.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Una sola etiqueta: "Contó" si pasó el mínimo; si no, por qué terminó. */
function PlayBadge({ play }) {
  if (play.counted) {
    return (
      <span className="badge badge--accent" title="Se oyó al menos la mitad o 30 segundos">
        Contó
      </span>
    );
  }
  const [label, title] =
    play.end_reason === "skipped"
      ? ["Saltada", "Se pasó a otra canción antes del mínimo"]
      : play.end_reason === "closed"
        ? ["App cerrada", "Se cerró la app antes del mínimo"]
        : ["No contó", "Menos de la mitad y de 30 segundos"];
  return (
    <span className="badge badge--muted" title={title}>
      {label}
    </span>
  );
}

export default function History() {
  const { byId, playsVersion } = useLibrary();
  const { openMenu } = useUI();
  const { playFrom } = useSongActions();
  const [plays, setPlays] = useState(null);
  const [error, setError] = useState(null);

  const fetchPlays = useCallback(
    () =>
      api.get("/plays/", { params: { limit: 500 } }).then(
        ({ data }) => {
          setPlays(data);
          setError(null);
        },
        (err) => setError(errorMessage(err)),
      ),
    [],
  );

  // se recarga al abrir y cada vez que termina o se salta una canción
  useEffect(() => {
    fetchPlays();
  }, [fetchPlays, playsVersion]);

  const groups = useMemo(() => {
    const out = [];
    for (const p of plays ?? []) {
      const d = new Date(p.started_at);
      const label = dayLabel(d);
      if (!out.length || out.at(-1).label !== label) out.push({ label, items: [] });
      out.at(-1).items.push({ ...p, date: d });
    }
    return out;
  }, [plays]);

  const summary = useMemo(() => {
    const list = plays ?? [];
    return {
      total: list.length,
      counted: list.filter((p) => p.counted).length,
      skipped: list.filter((p) => p.skipped && !p.counted).length, // igual que las etiquetas
      seconds: list.reduce((acc, p) => acc + p.listened_seconds, 0),
    };
  }, [plays]);

  return (
    <div className="page">
      <header className="hero hero--history">
        <div className="hero__art" aria-hidden="true">
          <HistoryIcon size={64} />
        </div>
        <div className="hero__text">
          <p className="hero__kicker">Tu música</p>
          <h1>Historial</h1>
          <p className="hero__meta">
            {plural(summary.total, "escucha", "escuchas")} · {plural(summary.counted, "contada", "contadas")} ·{" "}
            {plural(summary.skipped, "saltada", "saltadas")} · {formatTotal(summary.seconds)} escuchado
          </p>
        </div>
      </header>

      {error && <p className="empty">No se pudo cargar el historial: {error}</p>}
      {plays && plays.length === 0 && (
        <p className="empty">
          Aún no hay escuchas. Cada canción que oigas quedará aquí con la fecha, la hora y cuánto la escuchaste.
        </p>
      )}

      {groups.map((g) => (
        <section key={g.label} className="history-day">
          <h2 className="section-title">{g.label}</h2>
          <ol className="history">
            {g.items.map((p) => {
              const song = p.song_id != null ? byId.get(p.song_id) : null;
              const shown = song ?? { id: `h${p.id}`, title: p.song_title || "Canción eliminada", artist: p.song_artist };
              return (
                <li
                  key={p.id}
                  className={`history__item ${song ? "" : "is-deleted"}`}
                  onDoubleClick={() => song && playFrom(song, [song], "Historial")}
                  onContextMenu={(e) => song && openMenu(e, song, { list: [song], label: "Historial" })}
                >
                  <time className="history__time" dateTime={p.started_at}>
                    {timeFmt.format(p.date)}
                  </time>
                  <Cover song={song} size="sm" />
                  <span className="history__text">
                    <span className="history__title">{shown.title}</span>
                    <span className="history__artist">{song ? artistLabel(song) : shown.artist || "Ya no está en la biblioteca"}</span>
                  </span>
                  <span className="history__listened" title="Tiempo escuchado">
                    {formatTime(p.listened_seconds)}
                    {p.song_duration ? <span className="muted"> / {formatTime(p.song_duration)}</span> : null}
                  </span>
                  <span className="history__badges">
                    <PlayBadge play={p} />
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
