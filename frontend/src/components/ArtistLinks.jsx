import { Fragment } from "react";
import { artistKey } from "../lib/artists";

// mismos separadores que splitArtists, pero conservando cómo están escritos
const SEP = /(\s*(?:,|;|\s\/\s|\s+(?:feat\.?|ft\.?|featuring|x|vs\.?)\s+)\s*)/i;

/** "Feid, El Americano 4KT": un enlace por artista, cada uno a su página. */
export default function ArtistLinks({ artist, onOpen, className = "link" }) {
  const parts = (artist || "").split(SEP);
  return parts.map((part, i) =>
    i % 2 ? (
      <Fragment key={i}>{part}</Fragment>
    ) : part.trim() ? (
      <button
        key={i}
        type="button"
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(artistKey(part));
        }}
      >
        {part}
      </button>
    ) : null,
  );
}
