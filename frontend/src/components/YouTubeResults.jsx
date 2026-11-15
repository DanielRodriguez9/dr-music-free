import { Check, CloudDownload, Ellipsis, Globe, LoaderCircle, Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, errorKind, errorMessage, onlineTrack, prepareOnline } from "../api";
import { useLibrary, usePlayer, useUI } from "../context/hooks";
import useSongActions from "../hooks/useSongActions";
import { formatTime } from "../lib/format";
import { updateYtdlp } from "../lib/ytdlp";
import Cover from "./Cover";
import Equalizer from "./Equalizer";

const DEBOUNCE_MS = 650;

/** ¿Hay internet? Escucha los cambios de conexión del equipo. */
function useOnlineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function ResultRow({ result, track, local, active, playing, downloading, onPlay, onDownload, onMenu }) {
  const hoverTimer = useRef(null);
  const song = local ?? track;
  return (
    <li
      className={`ytrow ${active ? "is-current" : ""}`}
      onDoubleClick={onPlay}
      onContextMenu={onMenu}
      // al pasar el ratón se prepara el audio: al pulsar «Escuchar» suena antes
      onMouseEnter={() => {
        if (!local) hoverTimer.current = setTimeout(() => prepareOnline(result.youtube_id), 450);
      }}
      onMouseLeave={() => clearTimeout(hoverTimer.current)}
    >
      <Cover song={song} size="yt" />
      <div className="ytrow__text">
        <span className="ytrow__title" title={result.raw_title}>
          {active && <Equalizer playing={playing} />} {result.title}
        </span>
        <span className="ytrow__meta">
          {result.artist && result.channel && result.artist !== result.channel
            ? `${result.artist} · ${result.channel}`
            : result.channel || result.artist || "YouTube"}
        </span>
      </div>
      <span className="ytrow__duration">{result.duration ? formatTime(result.duration) : ""}</span>
      <div className="ytrow__actions">
        <button type="button" className="btn btn--small btn--primary" onClick={onPlay}>
          {active && playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
          {active && playing ? "Pausar" : "Escuchar"}
        </button>
        {local ? (
          <span className="badge badge--accent ytrow__have" title="Ya está descargada: suena desde tu disco">
            <Check size={12} /> En tu biblioteca
          </span>
        ) : (
          <button type="button" className="btn btn--small btn--subtle" onClick={onDownload} disabled={downloading}>
            {downloading ? <LoaderCircle size={15} className="spin" /> : <CloudDownload size={15} />}
            {downloading ? "Descargando" : "Descargar"}
          </button>
        )}
        <button type="button" className="icon-btn" onClick={onMenu} aria-label="Más opciones" title="Más opciones">
          <Ellipsis size={18} />
        </button>
      </div>
    </li>
  );
}

/** Resultados de YouTube debajo de los de la biblioteca (sin API key: yt-dlp). */
export default function YouTubeResults({ query }) {
  const online = useOnlineStatus();
  const { byYoutubeId, registerOnline, activeDownloads } = useLibrary();
  const { current, isPlaying } = usePlayer();
  const { openMenu } = useUI();
  const actions = useSongActions();
  const [state, setState] = useState({ q: "", status: "idle", results: [], error: null, kind: null });
  const q = query.trim();

  useEffect(() => {
    if (!online || q.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setState((s) => ({ ...s, q, status: "loading" }));
      api
        .get("/youtube/search", { params: { q, limit: 12 }, signal: ctrl.signal, timeout: 90000 })
        .then(({ data }) =>
          setState({ q, status: data.online ? "ready" : "offline", results: data.results, error: null, kind: null }),
        )
        .catch((err) => {
          if (ctrl.signal.aborted) return;
          const kind = errorKind(err);
          setState({ q, status: kind === "offline" ? "offline" : "error", results: [], error: errorMessage(err), kind });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, online]);

  const tracks = useMemo(() => state.results.map(onlineTrack), [state.results]);
  const downloadingIds = new Set(activeDownloads.map((j) => j.youtube_id));

  // Sin internet la sección desaparece: la app sigue con la biblioteca.
  if (!online || q.length < 2 || state.status === "offline") return null;

  const loading = state.status === "loading" || state.q !== q;
  // la cola: las de la biblioteca suenan desde el disco, el resto en línea
  const playlist = tracks.map((t) => byYoutubeId.get(t.youtube_id) ?? t);
  const play = (i) => {
    registerOnline(tracks.filter((t) => !byYoutubeId.has(t.youtube_id)));
    actions.playFrom(playlist[i], playlist, `YouTube: ${q}`);
  };

  return (
    <section className="ytresults" aria-busy={loading}>
      <h2 className="section-title ytresults__title">
        <Globe size={20} aria-hidden="true" /> En YouTube
        {loading && <LoaderCircle size={16} className="spin muted" aria-label="Buscando" />}
      </h2>
      {state.status === "error" && state.q === q ? (
        <div className="ytresults__error">
          <p>No se pudo buscar en YouTube: {state.error}</p>
          {state.kind === "outdated" && (
            <button type="button" className="btn btn--small" onClick={updateYtdlp}>
              Actualizar yt-dlp
            </button>
          )}
        </div>
      ) : state.results.length === 0 && !loading ? (
        <p className="empty">YouTube no devolvió resultados para «{q}».</p>
      ) : (
        <ol className={`ytlist ${loading ? "is-stale" : ""}`}>
          {state.results.map((r, i) => {
            const local = byYoutubeId.get(r.youtube_id);
            const song = playlist[i];
            const active = current?.id === song.id || current?.youtube_id === r.youtube_id;
            return (
              <ResultRow
                key={r.youtube_id}
                result={r}
                track={tracks[i]}
                local={local}
                active={active}
                playing={active && isPlaying}
                downloading={downloadingIds.has(r.youtube_id)}
                onPlay={() => play(i)}
                onDownload={() => actions.downloadOnline(tracks[i])}
                onMenu={(e) => {
                  if (!local) registerOnline([tracks[i]]);
                  openMenu(e, song, { list: playlist, label: `YouTube: ${q}` });
                }}
              />
            );
          })}
        </ol>
      )}
      <p className="muted small ytresults__note">
        «Escuchar» suena en línea sin descargar nada; «Descargar» la guarda en tu carpeta de música.
      </p>
    </section>
  );
}
