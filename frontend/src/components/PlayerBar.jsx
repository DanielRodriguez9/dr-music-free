import {
  CloudDownload, Globe, ListMusic, LoaderCircle, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume, Volume1, Volume2, VolumeX,
} from "lucide-react";
import { useState } from "react";
import { artistLabel, isOnline } from "../api";
import { usePlayer, usePlayerTime, useUI } from "../context/hooks";
import useSongActions from "../hooks/useSongActions";
import { formatTime } from "../lib/format";
import Cover from "./Cover";
import LikeButton from "./LikeButton";
import Slider from "./Slider";

const REPEAT_LABEL = {
  off: "Repetir: no (R)",
  all: "Repetir todas (R)",
  one: "Repetir una (R)",
};

/** Solo esta parte escucha el tiempo: se actualiza ~4 veces por segundo sin re-pintar el resto. */
function Progress({ disabled }) {
  const { currentTime, duration, seek } = usePlayerTime();
  return (
    <div className="progress">
      <span className="progress__time">{formatTime(currentTime)}</span>
      <Slider
        className="slider--progress"
        value={currentTime}
        max={disabled ? 0 : duration}
        onCommit={seek}
        label="Posición de la canción"
      />
      <span className="progress__time progress__time--end">{formatTime(duration)}</span>
    </div>
  );
}

function VolumeIcon({ volume, muted }) {
  if (muted || volume === 0) return <VolumeX size={18} />;
  if (volume < 0.34) return <Volume size={18} />;
  if (volume < 0.67) return <Volume1 size={18} />;
  return <Volume2 size={18} />;
}

export default function PlayerBar() {
  const player = usePlayer();
  const { current, isPlaying, loading, queue, volume, muted } = player;
  const { searchFor, queueOpen, toggleQueue } = useUI();
  const { toggleLike, downloadOnline } = useSongActions();
  const [downloading, setDownloading] = useState(null); // id en línea que se está descargando
  const empty = !current;
  const online = isOnline(current);

  return (
    <footer className="playerbar" aria-label="Reproductor">
      <div className="playerbar__now">
        {current ? (
          <>
            <Cover song={current} size="md" />
            <div className="playerbar__text">
              <span className="playerbar__title" title={current.title}>
                {current.title}
              </span>
              {online && (
                <span className="badge badge--online playerbar__online" title="Suena desde YouTube sin descargar">
                  <Globe size={11} /> En línea
                </span>
              )}
              {current.artist ? (
                <button type="button" className="link playerbar__artist" onClick={() => searchFor(current.artist)}>
                  {current.artist}
                </button>
              ) : (
                <span className="playerbar__artist">{artistLabel(current)}</span>
              )}
            </div>
            {online ? (
              <button
                type="button"
                className="btn btn--small btn--subtle playerbar__download"
                disabled={downloading === current.id}
                onClick={async () => {
                  setDownloading(current.id);
                  await downloadOnline(current);
                  setDownloading(null);
                }}
                title="Guardar esta canción en tu biblioteca"
              >
                {downloading === current.id ? <LoaderCircle size={15} className="spin" /> : <CloudDownload size={15} />}
                {downloading === current.id ? "Descargando" : "Descargar"}
              </button>
            ) : (
              <LikeButton song={current} onToggle={toggleLike} size={18} />
            )}
          </>
        ) : (
          <div className="playerbar__placeholder">
            <Cover song={null} size="md" />
            <span className="muted">Elige una canción para empezar</span>
          </div>
        )}
      </div>

      <div className="playerbar__center">
        <div className="controls">
          <button
            type="button"
            className={`icon-btn toggle ${queue.shuffle ? "is-on" : ""}`}
            onClick={player.toggleShuffle}
            aria-pressed={queue.shuffle}
            aria-label="Aleatorio"
            title={queue.shuffle ? "Aleatorio: sí (S)" : "Aleatorio: no (S)"}
          >
            <Shuffle size={18} />
          </button>
          <button type="button" className="icon-btn" onClick={player.prev} disabled={empty} aria-label="Anterior" title="Anterior (Ctrl + ←)">
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button
            type="button"
            className={`play-btn ${loading ? "is-loading" : ""}`}
            onClick={player.togglePlay}
            disabled={empty}
            aria-label={isPlaying ? "Pausar" : "Reproducir"}
            aria-busy={loading}
            title={loading ? (online ? "Cargando el audio desde YouTube..." : "Cargando...") : isPlaying ? "Pausar (Espacio)" : "Reproducir (Espacio)"}
          >
            {loading ? (
              <LoaderCircle size={20} className="spin" />
            ) : isPlaying ? (
              <Pause size={20} fill="currentColor" />
            ) : (
              <Play size={20} fill="currentColor" />
            )}
          </button>
          <button type="button" className="icon-btn" onClick={player.next} disabled={empty} aria-label="Siguiente" title="Siguiente (Ctrl + →)">
            <SkipForward size={20} fill="currentColor" />
          </button>
          <button
            type="button"
            className={`icon-btn toggle ${queue.repeat !== "off" ? "is-on" : ""}`}
            onClick={player.cycleRepeat}
            aria-label={REPEAT_LABEL[queue.repeat]}
            title={REPEAT_LABEL[queue.repeat]}
          >
            {queue.repeat === "one" ? <Repeat1 size={18} /> : <Repeat size={18} />}
          </button>
        </div>
        <Progress disabled={empty} />
      </div>

      <div className="playerbar__right">
        <button
          type="button"
          className={`icon-btn ${queueOpen ? "is-active" : ""}`}
          onClick={toggleQueue}
          aria-pressed={queueOpen}
          aria-label="Cola de reproducción"
          title="Cola de reproducción (Q)"
        >
          <ListMusic size={18} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={player.toggleMute}
          aria-label={muted ? "Activar sonido" : "Silenciar"}
          title={muted ? "Activar sonido (M)" : "Silenciar (M)"}
        >
          <VolumeIcon volume={volume} muted={muted} />
        </button>
        <Slider
          className="slider--volume"
          value={muted ? 0 : volume}
          max={1}
          step={0.01}
          onCommit={player.setVolume}
          onLive={player.setVolume}
          label={`Volumen ${Math.round((muted ? 0 : volume) * 100)}%`}
        />
      </div>
    </footer>
  );
}
