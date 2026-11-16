import { Pause, Play } from "lucide-react";
import { artistLabel } from "../api";
import ArtistLinks from "./ArtistLinks";
import Cover from "./Cover";

/** Tarjeta de canción para las filas de Inicio. */
export default function SongCard({ song, isCurrent, isPlaying, onPlay, onMenu, onArtist }) {
  const active = isCurrent && isPlaying;
  return (
    <article className={`card ${isCurrent ? "is-current" : ""}`} onContextMenu={(e) => onMenu(e, song)}>
      <Cover song={song} size="lg">
        <button
          type="button"
          className={`play-fab ${active ? "is-visible" : ""}`}
          onClick={() => onPlay(song)}
          aria-label={active ? "Pausar" : `Reproducir ${song.title}`}
          title={active ? "Pausar" : "Reproducir"}
        >
          {active ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        </button>
      </Cover>
      <h3 className="card__title" title={song.original_title || song.title}>
        <button type="button" className="link" onClick={() => onPlay(song)}>
          {song.title}
        </button>
      </h3>
      <p className="card__subtitle">
        {song.artist && !song.online ? (
          <ArtistLinks artist={song.artist} onOpen={onArtist} />
        ) : (
          artistLabel(song)
        )}
      </p>
    </article>
  );
}
