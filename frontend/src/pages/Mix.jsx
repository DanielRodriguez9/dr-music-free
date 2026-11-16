import { useMemo } from "react";
import { useLibrary, useUI } from "../context/hooks";
import useMixes from "../hooks/useMixes";
import Collection from "./Collection";

/** Un mix automático, en su orden. */
export default function MixPage({ id }) {
  const mixes = useMixes();
  const { byId } = useLibrary();
  const { navigate } = useUI();
  const mix = mixes?.find((m) => m.id === id);
  const songs = useMemo(() => (mix ? mix.song_ids.map((sid) => byId.get(sid)).filter(Boolean) : []), [mix, byId]);

  if (!mixes) return <div className="page-loading">Preparando tus mixes...</div>;
  if (!mix) {
    return (
      <div className="page page--center">
        <p className="muted">Este mix ya no está disponible.</p>
        <button type="button" className="btn btn--ghost" onClick={() => navigate("home")}>
          Volver a Inicio
        </button>
      </div>
    );
  }
  return (
    <Collection
      key={`mix-${mix.id}`}
      id="mix"
      title={mix.title}
      kicker="Mix hecho para ti"
      icon="mix"
      heroSong={songs[0]}
      subtitle={mix.subtitle}
      songs={songs}
      orderLabel="Orden del mix"
      emptyText="Este mix está vacío."
    />
  );
}
