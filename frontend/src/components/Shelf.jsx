import { ChevronRight } from "lucide-react";
import { usePlayer, useUI } from "../context/hooks";
import useSongActions from "../hooks/useSongActions";
import SongCard from "./SongCard";

/** Fila horizontal de tarjetas (una sola línea; se adapta al ancho). */
export default function Shelf({ title, subtitle, songs, label, onSeeAll, empty }) {
  const { current, isPlaying } = usePlayer();
  const { searchFor, openMenu } = useUI();
  const { playFrom } = useSongActions();

  return (
    <section className="shelf">
      <header className="shelf__header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {onSeeAll && songs.length > 0 && (
          <button type="button" className="see-all" onClick={onSeeAll}>
            Mostrar todo <ChevronRight size={16} />
          </button>
        )}
      </header>
      {songs.length === 0 ? (
        <p className="shelf__empty">{empty}</p>
      ) : (
        <div className="shelf__grid">
          {songs.map((song) => (
            <SongCard
              key={song.id}
              song={song}
              isCurrent={current?.id === song.id}
              isPlaying={isPlaying}
              onPlay={(s) => playFrom(s, songs, label)}
              onMenu={(e, s) => openMenu(e, s, { list: songs, label })}
              onArtist={searchFor}
            />
          ))}
        </div>
      )}
    </section>
  );
}
