import { useEffect, useMemo, useRef } from "react";

/**
 * Devuelve funciones con identidad estable que siempre llaman a la versión más
 * reciente de `handlers`. Evita re-renderizar listas memorizadas en cada cambio.
 */
export default function useStableHandlers(handlers) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });
  const keys = Object.keys(handlers).join(",");
  return useMemo(
    () => Object.fromEntries(keys.split(",").map((k) => [k, (...args) => ref.current[k]?.(...args)])),
    [keys],
  );
}
