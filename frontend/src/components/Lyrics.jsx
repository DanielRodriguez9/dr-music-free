import { LoaderCircle, Maximize2, MicVocal, Pause, Play, RefreshCw, SkipForward, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { artistLabel } from "../api";
import { usePlayer, usePlayerTime, useUI } from "../context/hooks";
import useLyrics from "../hooks/useLyrics";
import { activeLineIndex, hasLyrics, nextTextLine } from "../lib/lyrics";
import { audioTime } from "../player/audio";
import Cover from "./Cover";

/** Línea que suena ahora: se lee del <audio> en cada fotograma y solo re-pinta al cambiar. */
function useActiveLine(lines) {
  const [index, setIndex] = useState(-1);
  useEffect(() => {
    if (!lines?.length) return;
    let raf = 0;
    const tick = () => {
      const i = activeLineIndex(lines, audioTime());
      setIndex((prev) => (prev === i ? prev : i));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lines]);
  return lines?.length ? index : -1;
}

const MESSAGES = {
  none: "No encontramos la letra de esta canción.",
  instrumental: "Es una canción instrumental: no tiene letra.",
  disabled: "La búsqueda de letras está apagada. Puedes activarla en Ajustes.",
  offline: "Sin conexión a internet. La letra se buscará cuando vuelva la conexión.",
  unavailable: "El servicio de letras no responde ahora. Prueba otra vez en un rato.",
  error: "No se pudo buscar la letra.",
};

/** Mensaje cuando no hay letra que mostrar (o mientras se busca). */
function LyricsMessage({ song, data, loading, retry, big = false }) {
  const { navigate, setKaraoke } = useUI();
  if (!song) return <p className="lyrics__msg">Elige una canción para ver su letra.</p>;
  if (loading) {
    return (
      <p className="lyrics__msg">
        <LoaderCircle size={big ? 28 : 16} className="spin" /> Buscando la letra...
      </p>
    );
  }
  const status = data?.status ?? "error";
  return (
    <div className="lyrics__msg">
      <p>{MESSAGES[status] ?? MESSAGES.error}</p>
      {(status === "offline" || status === "unavailable" || status === "error") && (
        <button type="button" className="btn btn--ghost btn--compact" onClick={retry}>
          <RefreshCw size={15} /> Reintentar
        </button>
      )}
      {status === "disabled" && !big && (
        <button
          type="button"
          className="btn btn--ghost btn--compact"
          onClick={() => {
            setKaraoke(false);
            navigate("settings");
          }}
        >
          Ir a Ajustes
        </button>
      )}
    </div>
  );
}

/** Letra sincronizada en el panel: resalta la línea, se desplaza sola y un clic salta a ese momento. */
function SyncedLyrics({ lines }) {
  const { seek } = usePlayerTime();
  const { play, isPlaying } = usePlayer();
  const index = useActiveLine(lines);
  const boxRef = useRef(null);
  const userScrollRef = useRef(0); // si la persona movió la letra, se espera un poco antes de seguir

  useEffect(() => {
    const box = boxRef.current;
    const line = box?.querySelector(`[data-i="${Math.max(index, 0)}"]`);
    if (!box || !line || Date.now() - userScrollRef.current < 4000) return;
    box.scrollTo({ top: line.offsetTop - box.clientHeight * 0.4 + line.offsetHeight / 2, behavior: "smooth" });
  }, [index]);

  return (
    <div className="lyrics__scroll" ref={boxRef} onWheel={() => (userScrollRef.current = Date.now())}>
      {lines.map((line, i) => (
        <button
          key={i}
          type="button"
          data-i={i}
          className={`lyrics__line ${i === index ? "is-active" : i < index ? "is-past" : ""} ${line.text ? "" : "is-gap"}`}
          onClick={() => {
            seek(line.t);
            if (!isPlaying) play();
            userScrollRef.current = 0;
          }}
          title="Ir a este momento"
        >
          {line.text || "♪"}
        </button>
      ))}
    </div>
  );
}

function LyricsBody({ song, lyrics }) {
  const { data, loading, retry } = lyrics;
  if (!song || loading || !hasLyrics(data)) return <LyricsMessage song={song} data={data} loading={loading} retry={retry} />;
  if (data.status === "synced") return <SyncedLyrics key={song.id} lines={data.lines} />;
  return (
    <div className="lyrics__scroll">
      <p className="lyrics__note">Letra sin sincronizar</p>
      <p className="lyrics__plain">{data.plain}</p>
    </div>
  );
}

/** Panel de la derecha con la letra de la canción actual. */
export function LyricsPanel() {
  const { current } = usePlayer();
  const { openLyrics, setKaraoke } = useUI();
  const lyrics = useLyrics(current);

  return (
    <aside className="queue lyrics" aria-label="Letra">
      <header className="queue__header">
        <h2>Letra</h2>
        <div className="lyrics__actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setKaraoke(true)}
            disabled={!current}
            aria-label="Modo karaoke"
            title="Modo karaoke, pantalla completa (K)"
          >
            <Maximize2 size={17} />
          </button>
          <button type="button" className="icon-btn" onClick={() => openLyrics(false)} aria-label="Cerrar la letra" title="Cerrar (T)">
            <X size={18} />
          </button>
        </div>
      </header>
      {current && (
        <p className="lyrics__song">
          {current.title} <span className="muted">· {artistLabel(current)}</span>
        </p>
      )}
      <LyricsBody song={current} lyrics={lyrics} />
      {hasLyrics(lyrics.data) && <p className="lyrics__credit">Letra: LRCLIB</p>}
    </aside>
  );
}

/** Controles del karaoke: se esconden solos si no se mueve el ratón (para verlo en un televisor). */
function useIdle(ms = 3000) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), ms);
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), ms);
    };
    window.addEventListener("mousemove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [ms]);
  return idle;
}

function KaraokeLines({ lines }) {
  const index = useActiveLine(lines);
  // antes de la primera línea se anuncia la primera en gris
  const cur = index >= 0 ? lines[index] : null;
  const nextIdx = nextTextLine(lines, index);
  const next = nextIdx >= 0 ? lines[nextIdx] : null;
  return (
    <div className="karaoke__lines" aria-live="polite">
      <p key={`c${index}`} className={`karaoke__current ${cur?.text ? "" : "is-gap"}`}>
        {cur ? cur.text || "♪" : "♪"}
      </p>
      <p key={`n${nextIdx}`} className="karaoke__next">
        {next?.text ?? ""}
      </p>
    </div>
  );
}

/** Modo karaoke: pantalla completa, letra grande y centrada. Esc para salir. */
export function Karaoke() {
  const player = usePlayer();
  const { current, isPlaying } = player;
  const { setKaraoke } = useUI();
  const lyrics = useLyrics(current);
  const idle = useIdle();
  const { data } = lyrics;

  // pantalla completa de verdad (sin barra de tareas); al salir de ella se cierra el karaoke
  useEffect(() => {
    const el = document.documentElement;
    el.requestFullscreen?.().catch(() => {});
    const onChange = () => {
      if (!document.fullscreenElement) setKaraoke(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [setKaraoke]);

  return (
    <div className={`karaoke ${idle ? "is-idle" : ""}`} role="dialog" aria-label="Modo karaoke">
      <div className="karaoke__top">
        {current && <Cover song={current} size="md" />}
        <div className="karaoke__song">
          <span className="karaoke__title">{current?.title ?? "Nada sonando"}</span>
          {current && <span className="karaoke__artist">{artistLabel(current)}</span>}
        </div>
      </div>

      <div className="karaoke__stage">
        {!current || lyrics.loading || !hasLyrics(data) ? (
          <div className="karaoke__msg">
            <LyricsMessage song={current} data={data} loading={lyrics.loading} retry={lyrics.retry} big />
          </div>
        ) : data.status === "synced" ? (
          <KaraokeLines key={current.id} lines={data.lines} />
        ) : (
          <div className="karaoke__plain">
            <p className="lyrics__note">Letra sin sincronizar</p>
            <p>{data.plain}</p>
          </div>
        )}
      </div>

      <div className="karaoke__controls">
        <button type="button" className="karaoke__btn" onClick={player.togglePlay} disabled={!current} aria-label={isPlaying ? "Pausar" : "Reproducir"} title="Espacio">
          {isPlaying ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" />}
        </button>
        <button type="button" className="karaoke__btn" onClick={player.next} disabled={!current} aria-label="Siguiente" title="Siguiente">
          <SkipForward size={28} fill="currentColor" />
        </button>
        <button type="button" className="karaoke__btn karaoke__btn--exit" onClick={() => setKaraoke(false)} title="Esc">
          <X size={22} /> Salir
        </button>
      </div>
    </div>
  );
}

/** "Abrir la letra automáticamente al reproducir": al empezar una canción con letra se abre el panel. */
export function LyricsAutoOpen() {
  const { current, isPlaying } = usePlayer();
  const { prefs, openLyrics } = useUI();
  const active = prefs.lyricsAutoOpen && isPlaying ? current : null;
  const { data } = useLyrics(active);
  const opened = useRef(null);
  const found = hasLyrics(data);
  const id = active?.id;

  useEffect(() => {
    if (!found || id == null || opened.current === id) return;
    opened.current = id; // una vez por canción: si se cierra, no se vuelve a abrir sola
    openLyrics(true);
  }, [found, id, openLyrics]);
  return null;
}

/** Botón de la barra del reproductor. */
export function LyricsButton() {
  const { lyricsOpen, toggleLyrics } = useUI();
  return (
    <button
      type="button"
      className={`icon-btn ${lyricsOpen ? "is-active" : ""}`}
      onClick={toggleLyrics}
      aria-pressed={lyricsOpen}
      aria-label="Letra"
      title="Letra (T)"
    >
      <MicVocal size={18} />
    </button>
  );
}
