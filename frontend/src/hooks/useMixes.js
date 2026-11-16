import { useEffect, useState } from "react";
import { api } from "../api";
import { useLibrary } from "../context/hooks";

const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

let cache = { key: null, data: null };

/** Mixes de Inicio (los calcula el servidor con la fecha local: el mix diario cambia cada día). */
export default function useMixes() {
  const { playsVersion, stats } = useLibrary();
  const key = `${localDay()}|${playsVersion}|${stats.total}`;
  const [state, setState] = useState(() => (cache.key === key ? cache.data : null));

  useEffect(() => {
    if (cache.key === key) return;
    let alive = true;
    api
      .get("/mixes/", { params: { day: key.split("|")[0] } })
      .then(({ data }) => {
        cache = { key, data };
        if (alive) setState(data);
      })
      .catch(() => alive && setState((s) => s ?? []));
    return () => {
      alive = false;
    };
  }, [key]);

  return cache.key === key ? cache.data : state;
}
