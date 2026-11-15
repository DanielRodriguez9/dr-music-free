import { Music2 } from "lucide-react";
import { useState } from "react";
import { coverUrls } from "../api";

// Color estable a partir del título para las canciones sin carátula
function hue(text = "") {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** Carátula cuadrada. Prueba varias URLs y, si fallan, muestra un degradado. */
export default function Cover({ song, size = "md", className = "", children }) {
  const urls = coverUrls(song);
  const [failed, setFailed] = useState({ key: null, count: 0 });
  // si cambia la canción, se reinician los intentos
  const tries = failed.key === song?.id ? failed.count : 0;
  const src = urls[tries];

  return (
    <div
      className={`cover cover--${size} ${className}`}
      style={{ "--cover-hue": hue(song?.title) }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable="false"
          onError={() => setFailed({ key: song?.id, count: tries + 1 })}
        />
      ) : (
        <Music2 className="cover__icon" aria-hidden="true" />
      )}
      {children}
    </div>
  );
}
