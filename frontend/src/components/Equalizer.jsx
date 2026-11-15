/** Barras animadas de "sonando ahora" (solo CSS; se detienen en pausa). */
export default function Equalizer({ playing }) {
  return (
    <span className={`eq ${playing ? "is-playing" : ""}`} aria-label={playing ? "Sonando" : "En pausa"}>
      <i />
      <i />
      <i />
    </span>
  );
}
