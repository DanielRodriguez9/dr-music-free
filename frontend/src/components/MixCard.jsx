import { Play } from "lucide-react";
import { memo } from "react";
import Cover from "./Cover";

const HUES = { daily: 205, top: 340, month: 25, artist: 265, genre: 150, forgotten: 45, new: 190 };

/**
 * Tarjeta de un mix: mosaico con hasta 4 carátulas y el nombre encima, sobre una franja oscura.
 * `covers`: las canciones de la portada (el servidor las elige sin repetir imágenes entre mixes).
 */
const MixCard = memo(function MixCard({ mix, songs, covers: coverSongs, onOpen, onPlay }) {
  const covers = (coverSongs?.length ? coverSongs : songs).slice(0, 4);
  return (
    <article className="card card--mix" onClick={() => onOpen(mix)} style={{ "--mix-hue": HUES[mix.kind] ?? 205 }}>
      <div className={`mixart mixart--${covers.length >= 4 ? 4 : 1}`}>
        {(covers.length >= 4 ? covers : covers.slice(0, 1)).map((s) => (
          <Cover key={s.id} song={s} size="fill" />
        ))}
        <span className="mixart__label">{mix.title}</span>
        <button
          type="button"
          className="play-fab"
          onClick={(e) => {
            e.stopPropagation();
            onPlay(mix);
          }}
          aria-label={`Reproducir ${mix.title}`}
          title="Reproducir"
        >
          <Play size={20} fill="currentColor" />
        </button>
      </div>
      <h3 className="card__title">
        <button type="button" className="link">
          {mix.title}
        </button>
      </h3>
      <p className="card__subtitle">{mix.subtitle}</p>
    </article>
  );
});

export default MixCard;
