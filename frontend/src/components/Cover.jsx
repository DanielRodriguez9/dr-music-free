import { Music2 } from "lucide-react";
import { useState } from "react";
import { coverUrls } from "../api";

// Color estable a partir del título para las canciones sin carátula
function hue(text = "") {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

// Cuando una miniatura no existe, YouTube responde 404 con una imagen gris de 120x90
// que el navegador muestra como si fuera válida: se trata como un fallo.
const isYouTubePlaceholder = (img) => img.naturalWidth === 120 && img.naturalHeight === 90;

/** Carátula cuadrada. Prueba varias miniaturas y, si ninguna existe, muestra una nota musical. */
export default function Cover({ song, size = "md", className = "", children }) {
  const urls = coverUrls(song);
  const [attempt, setAttempt] = useState({ key: null, index: 0, ready: false });
  // si cambia la canción, se reinician los intentos
  const current = attempt.key === song?.id ? attempt : { key: song?.id, index: 0, ready: false };
  const src = urls[current.index];
  const next = () => setAttempt({ key: song?.id, index: current.index + 1, ready: false });

  return (
    <div className={`cover cover--${size} ${className}`} style={{ "--cover-hue": hue(song?.title) }}>
      {src && (
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable="false"
          className={current.ready ? "is-ready" : ""}
          onLoad={(e) => (isYouTubePlaceholder(e.currentTarget) ? next() : setAttempt({ ...current, ready: true }))}
          onError={next}
        />
      )}
      {!current.ready && <Music2 className="cover__icon" aria-hidden="true" />}
      {children}
    </div>
  );
}
