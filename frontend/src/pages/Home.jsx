import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { isPlayable } from "../api";
import Cover from "../components/Cover";
import EmptyLibrary from "../components/EmptyLibrary";
import MixCard from "../components/MixCard";
import Shelf from "../components/Shelf";
import { useLibrary, usePlayer, useUI } from "../context/hooks";
import useMixes from "../hooks/useMixes";
import useSongActions from "../hooks/useSongActions";
import { greeting } from "../lib/format";

const SHELF_SIZE = 12;

function ContinueListening({ songs }) {
  const { current, isPlaying } = usePlayer();
  const { openMenu } = useUI();
  const { playFrom } = useSongActions();
  const label = "Seguir escuchando";

  return (
    <section className="shelf">
      <header className="shelf__header">
        <h2>{label}</h2>
      </header>
      {songs.length === 0 ? (
        <p className="shelf__empty">Aquí aparecerán las últimas canciones que escuches.</p>
      ) : (
        <div className="tiles">
          {songs.map((song) => {
            const active = current?.id === song.id;
            return (
              <button
                key={song.id}
                type="button"
                className={`tile ${active ? "is-current" : ""}`}
                onClick={() => playFrom(song, songs, label)}
                onContextMenu={(e) => openMenu(e, song, { list: songs, label })}
                title={song.title}
              >
                <Cover song={song} size="tile" />
                <span className="tile__title">{song.title}</span>
                <span className="tile__play" aria-hidden="true">
                  {active && isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Hora actual que se renueva cada 30 s: el saludo cambia solo aunque la app siga abierta. */
function useNow(ms = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), ms);
    // al volver a la ventana (o despertar el equipo) se actualiza al momento
    const onVisible = () => document.visibilityState === "visible" && setNow(new Date());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ms]);
  return now;
}

function MadeForYou() {
  const mixes = useMixes();
  const { byId } = useLibrary();
  const { navigate } = useUI();
  const { playAll } = useSongActions();
  if (!mixes?.length) return null;
  const songsOf = (m) => m.song_ids.map((id) => byId.get(id)).filter(Boolean);
  const coversOf = (m) => (m.cover_ids || []).map((id) => byId.get(id)).filter(Boolean);
  return (
    <section className="shelf">
      <header className="shelf__header">
        <div>
          <h2>Hechos para ti</h2>
          <p className="muted">Mixes armados con lo que escuchas. El mix diario cambia cada día.</p>
        </div>
      </header>
      <div className="mix-row">
        {mixes.map((m) => (
          <MixCard
            key={m.id}
            mix={m}
            songs={songsOf(m)}
            covers={coversOf(m)}
            onOpen={(x) => navigate(`mix:${x.id}`)}
            onPlay={(x) => playAll(songsOf(x), x.title)}
          />
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const { playable, status } = useLibrary();
  const { navigate, userName } = useUI();
  const now = useNow();

  const sections = useMemo(() => {
    const byDate = (key) => (a, b) => (b[key] || "").localeCompare(a[key] || "");
    return {
      continue: playable.filter((s) => s.last_played_at).sort(byDate("last_played_at")).slice(0, 8),
      recent: [...playable].sort(byDate("created_at")).slice(0, SHELF_SIZE),
      top: playable
        .filter((s) => s.play_count > 0)
        .sort((a, b) => b.play_count - a.play_count || byDate("last_played_at")(a, b))
        .slice(0, SHELF_SIZE),
      liked: playable.filter((s) => s.liked).slice(0, SHELF_SIZE),
    };
  }, [playable]);

  if (status === "loading") return <div className="page-loading">Cargando tu música...</div>;

  return (
    <div className="page page--home">
      <h1 className="page-title">{greeting(now, userName)}</h1>

      <ContinueListening songs={sections.continue.filter(isPlayable)} />

      <MadeForYou />

      <Shelf
        title="Agregadas recientemente"
        songs={sections.recent}
        label="Agregadas recientemente"
        onSeeAll={() => navigate("library")}
        empty={<EmptyLibrary compact />}
      />

      <Shelf
        title="Más escuchadas"
        subtitle="Cuenta una escucha cuando oyes al menos la mitad de la canción o 30 segundos."
        songs={sections.top}
        label="Más escuchadas"
        empty="Cuando escuches música, aquí aparecerán tus favoritas."
      />

      {sections.liked.length > 0 && (
        <Shelf title="Tus me gusta" songs={sections.liked} label="Tus me gusta" onSeeAll={() => navigate("liked")} />
      )}
    </div>
  );
}
