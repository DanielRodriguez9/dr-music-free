import { ArrowRight, Check, LoaderCircle, Play, RefreshCw, Wand2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { api, errorMessage } from "../api";
import Cover from "../components/Cover";
import { useLibrary, useUI } from "../context/hooks";
import useSongActions from "../hooks/useSongActions";
import useStableHandlers from "../hooks/useStableHandlers";
import { plural } from "../lib/format";

const KINDS = {
  all: "Todas",
  swapped: "Artista y título invertidos",
  missing: "Sin artista",
  spelling: "Misma persona, otra escritura",
};
const KIND_BADGE = { swapped: "Invertidos", missing: "Sin artista", spelling: "Escritura" };

const FixRow = memo(function FixRow({ p, song, checked, edit, h }) {
  const value = edit ?? p.proposed;
  return (
    <li className={`fix ${checked ? "is-checked" : ""}`}>
      <input type="checkbox" className="fix__check" checked={checked} onChange={() => h.toggle(p.song_id)} aria-label="Aplicar este cambio" />
      <button type="button" className="fix__cover" onClick={() => song && h.play(song)} title="Escuchar" disabled={!song}>
        <Cover song={song} size="sm" />
        <Play size={14} fill="currentColor" className="fix__play" />
      </button>
      <div className="fix__current">
        <span className="fix__artist" title="Artista actual">
          {p.current.artist || <em className="muted">Artista desconocido</em>}
        </span>
        <span className="fix__title" title="Título actual">
          {p.current.title}
        </span>
      </div>
      <ArrowRight size={16} className="fix__arrow" aria-hidden="true" />
      <div className="fix__proposed">
        <input
          className="input input--compact"
          value={value.artist ?? ""}
          onChange={(e) => h.edit(p.song_id, { ...value, artist: e.target.value })}
          aria-label="Artista propuesto"
          placeholder="Artista"
        />
        <input
          className="input input--compact"
          value={value.title}
          onChange={(e) => h.edit(p.song_id, { ...value, title: e.target.value })}
          aria-label="Título propuesto"
          placeholder="Título"
        />
      </div>
      <div className="fix__why">
        <span className={`badge ${p.confidence === "high" ? "badge--accent" : "badge--warn"}`}>
          {p.confidence === "high" ? "Fiable" : "Revisar"}
        </span>
        <span className="badge badge--muted">{KIND_BADGE[p.kind]}</span>
        <span className="fix__reason" title={p.original_title || ""}>
          {p.reason}
        </span>
      </div>
    </li>
  );
});

/** Revisión de las correcciones de artistas propuestas: nada cambia hasta pulsar «Aplicar». */
export default function Fixes() {
  const { byId, applySongs } = useLibrary();
  const { confirm } = useUI();
  const { playFrom } = useSongActions();
  const [state, setState] = useState(null);
  const [tab, setTab] = useState("all");
  const [checked, setChecked] = useState(() => new Set());
  const [edits, setEdits] = useState(() => new Map());
  const [applying, setApplying] = useState(false);

  const receive = useCallback((data) => {
    setState(data);
    if (data.status === "done") {
      // por defecto marcadas solo las fiables
      setChecked(new Set(data.proposals.filter((p) => p.confidence === "high").map((p) => p.song_id)));
      setEdits(new Map());
    }
  }, []);

  useEffect(() => {
    api.get("/fixes/").then(({ data }) => receive(data), (err) => toast.error(errorMessage(err)));
  }, [receive]);

  // mientras analiza, se consulta el avance cada segundo
  useEffect(() => {
    if (state?.status !== "running") return;
    const timer = setInterval(() => api.get("/fixes/").then(({ data }) => receive(data)).catch(() => {}), 1000);
    return () => clearInterval(timer);
  }, [state?.status, receive]);

  const analyze = () => api.post("/fixes/analyze").then(({ data }) => setState(data), (err) => toast.error(errorMessage(err)));

  const proposals = useMemo(() => state?.proposals ?? [], [state]);
  const counts = useMemo(() => {
    const c = { all: proposals.length, swapped: 0, missing: 0, spelling: 0 };
    for (const p of proposals) c[p.kind] += 1;
    return c;
  }, [proposals]);
  const shown = tab === "all" ? proposals : proposals.filter((p) => p.kind === tab);

  const h = useStableHandlers({
    toggle: (id) =>
      setChecked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    edit: (id, value) => {
      setEdits((prev) => new Map(prev).set(id, value));
      setChecked((prev) => new Set(prev).add(id)); // si la editas, es que la quieres aplicar
    },
    play: (song) => playFrom(song, [song], "Corregir artistas"),
  });

  const setAll = (on) =>
    setChecked((prev) => {
      const next = new Set(prev);
      for (const p of shown) {
        if (on) next.add(p.song_id);
        else next.delete(p.song_id);
      }
      return next;
    });

  const apply = async () => {
    const items = proposals
      .filter((p) => checked.has(p.song_id))
      .map((p) => {
        const v = edits.get(p.song_id) ?? p.proposed;
        return { song_id: p.song_id, artist: (v.artist || "").trim() || null, title: (v.title || "").trim() || p.current.title };
      });
    if (!items.length) return;
    const ok = await confirm({
      title: `¿Aplicar ${plural(items.length, "cambio", "cambios")}?`,
      message:
        "Se cambiará el artista o el título en tu biblioteca. Antes se guarda una copia de tu base en la carpeta de datos (backups). Los archivos de música no se tocan.",
      confirmLabel: `Aplicar ${items.length}`,
    });
    if (!ok) return;
    setApplying(true);
    try {
      const { data } = await api.post("/fixes/apply", { items });
      applySongs(data.songs);
      const done = new Set(items.map((i) => i.song_id));
      setState((s) => ({ ...s, proposals: s.proposals.filter((p) => !done.has(p.song_id)) }));
      setChecked(new Set());
      toast.success(`${plural(data.changed, "canción corregida", "canciones corregidas")}`);
    } catch (err) {
      toast.error(`No se pudo aplicar: ${errorMessage(err)}`);
    } finally {
      setApplying(false);
    }
  };

  const selected = proposals.filter((p) => checked.has(p.song_id)).length;

  return (
    <div className="page page--fixes">
      <h1 className="page-title">Corregir artistas</h1>
      <p className="muted fixes__intro">
        Propuestas automáticas para canciones sin artista, con artista y título invertidos o con el mismo artista escrito de
        varias formas. Se usan las etiquetas de los archivos, el título del video y el canal de YouTube.{" "}
        <b>Nada cambia hasta que pulses «Aplicar».</b>
      </p>

      {!state ? (
        <div className="page-loading">Cargando...</div>
      ) : state.status === "idle" || state.status === "error" ? (
        <div className="fixes__start">
          {state.error && <p className="form-error">El análisis falló: {state.error}</p>}
          <button type="button" className="btn btn--primary" onClick={analyze}>
            <Wand2 size={18} /> Analizar mi biblioteca
          </button>
          <p className="muted small">Consulta a YouTube el canal de cada canción (una sola vez). Tarda alrededor de un minuto.</p>
        </div>
      ) : state.status === "running" ? (
        <div className="fixes__start">
          <p>
            <LoaderCircle size={16} className="spin" /> Consultando YouTube... {state.done} de {state.total || "?"}
          </p>
          <div className="progressbar">
            <span style={{ width: `${state.total ? (state.done / state.total) * 100 : 5}%` }} />
          </div>
        </div>
      ) : proposals.length === 0 ? (
        <div className="fixes__start">
          <p>
            <Check size={16} /> No hay nada que corregir.
          </p>
          <button type="button" className="btn btn--ghost" onClick={analyze}>
            <RefreshCw size={16} /> Volver a analizar
          </button>
        </div>
      ) : (
        <>
          <div className="tabs" role="tablist">
            {Object.entries(KINDS).map(([k, label]) =>
              counts[k] || k === "all" ? (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab ${tab === k ? "is-active" : ""}`} onClick={() => setTab(k)}>
                  {label} <span className="tab__count">{counts[k]}</span>
                </button>
              ) : null,
            )}
            <div className="actionbar__spacer" />
            <button type="button" className="link link--muted" onClick={analyze}>
              <RefreshCw size={14} /> Volver a analizar
            </button>
          </div>
          <div className="fix fix--head" aria-hidden="true">
            <span />
            <span />
            <span>Ahora: artista / título</span>
            <span />
            <span>Propuesta: artista / título (puedes editarla)</span>
            <span>Motivo</span>
          </div>
          <ol className="fixes">
            {shown.map((p) => (
              <FixRow key={p.song_id} p={p} song={byId.get(p.song_id)} checked={checked.has(p.song_id)} edit={edits.get(p.song_id)} h={h} />
            ))}
          </ol>
          <div className="fixes__bar">
            <span>
              <b>{selected}</b> de {proposals.length} marcadas
            </span>
            <button type="button" className="btn btn--small btn--subtle" onClick={() => setAll(true)}>
              Marcar todas{tab !== "all" ? " de esta pestaña" : ""}
            </button>
            <button type="button" className="btn btn--small btn--subtle" onClick={() => setAll(false)}>
              Desmarcar
            </button>
            <div className="actionbar__spacer" />
            <button type="button" className="btn btn--primary" onClick={apply} disabled={!selected || applying}>
              {applying ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} Aplicar {selected || ""}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
