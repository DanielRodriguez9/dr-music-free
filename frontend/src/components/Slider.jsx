import { useState } from "react";

/**
 * Barra deslizante con relleno de color. Mientras se arrastra muestra el valor
 * local y solo confirma (onCommit) al soltar, para no pelear con el audio.
 */
export default function Slider({ value, max, onCommit, onLive, label, className = "", step = "any" }) {
  const [drag, setDrag] = useState(null);
  const shown = drag ?? value;
  const pct = max > 0 ? Math.min(100, (shown / max) * 100) : 0;

  return (
    <input
      type="range"
      className={`slider ${className}`}
      min={0}
      max={max || 0}
      step={step}
      value={Math.min(shown, max || 0)}
      aria-label={label}
      title={label}
      style={{ "--pct": `${pct}%` }}
      disabled={!max}
      onPointerDown={() => setDrag(value)}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (drag != null) {
          setDrag(v);
          onLive?.(v);
        } else {
          onCommit(v); // teclado
        }
      }}
      onPointerUp={(e) => {
        if (drag != null) onCommit(Number(e.currentTarget.value));
        setDrag(null);
      }}
      onPointerCancel={() => setDrag(null)}
    />
  );
}
