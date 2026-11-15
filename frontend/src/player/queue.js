// Lógica pura de la cola de reproducción (sin React, fácil de testear).
//
// - context: la lista desde la que se reprodujo (Biblioteca, Búsqueda, ...).
// - order:   índices de context.ids en orden de reproducción (mezclado si shuffle).
// - pos:     posición actual dentro de `order`.
// - userQueue: canciones añadidas a mano ("Añadir a la cola"); tienen prioridad.
// - fromQueue: la canción actual salió de userQueue (no de la lista).
// - token:   cambia con cada cambio de pista, aunque se repita la misma canción.

export const REPEAT_MODES = ["off", "all", "one"];

export const initialQueueState = {
  context: { ids: [], label: "" },
  order: [],
  pos: -1,
  userQueue: [],
  currentId: null,
  fromQueue: false,
  shuffle: false,
  repeat: "off",
  token: 0,
};

export function shuffleArray(arr, random = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const range = (n) => Array.from({ length: n }, (_, i) => i);

function buildOrder(length, startIndex, shuffle, random) {
  if (!shuffle) return { order: range(length), pos: Math.max(startIndex, 0) };
  const rest = range(length).filter((i) => i !== startIndex);
  const order = startIndex >= 0 ? [startIndex, ...shuffleArray(rest, random)] : shuffleArray(rest, random);
  return { order, pos: 0 };
}

const contextIdAt = (s, pos) => s.context.ids[s.order[pos]] ?? null;

const withTrack = (s, patch) => ({ ...s, ...patch, token: s.token + 1 });

/** Siguiente canción sin modificar el estado (null si se acaba la lista). */
export function peekNext(s) {
  if (s.userQueue.length) return s.userQueue[0];
  if (s.pos + 1 < s.order.length) return contextIdAt(s, s.pos + 1);
  if (s.repeat === "all" && s.order.length) return contextIdAt(s, 0);
  return null;
}

/** Próximas canciones de la lista (para el panel "A continuación"). */
export function upcomingFromContext(s, limit = 50) {
  const out = [];
  for (let p = s.pos + 1; p < s.order.length && out.length < limit; p++) {
    out.push({ id: contextIdAt(s, p), pos: p });
  }
  return out;
}

export function queueReducer(s, action) {
  const random = action.random ?? Math.random;
  switch (action.type) {
    case "PLAY_CONTEXT": {
      const ids = action.ids;
      const start = action.startId == null ? 0 : ids.indexOf(action.startId);
      if (!ids.length || start < 0) return s;
      const { order, pos } = buildOrder(ids.length, start, s.shuffle, random);
      return withTrack(s, {
        context: { ids, label: action.label ?? "" },
        order,
        pos,
        currentId: ids[order[pos]],
        fromQueue: false,
      });
    }

    case "NEXT": {
      if (s.userQueue.length) {
        const [next, ...rest] = s.userQueue;
        return withTrack(s, { currentId: next, userQueue: rest, fromQueue: true });
      }
      if (s.pos + 1 < s.order.length) {
        return withTrack(s, { pos: s.pos + 1, currentId: contextIdAt(s, s.pos + 1), fromQueue: false });
      }
      if (s.repeat === "all" && s.order.length) {
        const cur = s.order[s.pos];
        const order = s.shuffle ? shuffleArray(s.order, random) : s.order;
        // evita que al re-mezclar suene dos veces seguidas la misma
        if (s.shuffle && order.length > 1 && order[0] === cur) [order[0], order[1]] = [order[1], order[0]];
        return withTrack(s, { order, pos: 0, currentId: s.context.ids[order[0]], fromQueue: false });
      }
      return s; // fin de la lista
    }

    case "PREV": {
      if (s.fromQueue) {
        // la canción de la cola vuelve al principio de la cola
        return withTrack(s, {
          userQueue: [s.currentId, ...s.userQueue],
          currentId: contextIdAt(s, s.pos),
          fromQueue: false,
        });
      }
      if (s.pos > 0) return withTrack(s, { pos: s.pos - 1, currentId: contextIdAt(s, s.pos - 1) });
      if (s.repeat === "all" && s.order.length > 1) {
        const last = s.order.length - 1;
        return withTrack(s, { pos: last, currentId: contextIdAt(s, last) });
      }
      return withTrack(s, {}); // reinicia la misma
    }

    case "TOGGLE_SHUFFLE": {
      const shuffle = !s.shuffle;
      if (!s.order.length) return { ...s, shuffle };
      const anchor = s.order[s.pos] ?? -1; // índice en context.ids de la canción de referencia
      const { order, pos } = buildOrder(s.context.ids.length, anchor, shuffle, random);
      return { ...s, shuffle, order, pos: shuffle ? pos : Math.max(anchor, 0) };
    }

    case "CYCLE_REPEAT": {
      const i = REPEAT_MODES.indexOf(s.repeat);
      return { ...s, repeat: REPEAT_MODES[(i + 1) % REPEAT_MODES.length] };
    }

    case "ADD_TO_QUEUE": {
      if (s.currentId == null) {
        // no hay nada sonando: empieza directamente
        return withTrack(s, { currentId: action.id, fromQueue: true });
      }
      const userQueue = action.next ? [action.id, ...s.userQueue] : [...s.userQueue, action.id];
      return { ...s, userQueue };
    }

    case "REMOVE_FROM_QUEUE":
      return { ...s, userQueue: s.userQueue.filter((_, i) => i !== action.index) };

    case "CLEAR_QUEUE":
      return { ...s, userQueue: [] };

    case "JUMP_QUEUE": {
      const id = s.userQueue[action.index];
      if (id == null) return s;
      return withTrack(s, { currentId: id, userQueue: s.userQueue.slice(action.index + 1), fromQueue: true });
    }

    case "JUMP_CONTEXT": {
      if (action.pos < 0 || action.pos >= s.order.length) return s;
      return withTrack(s, { pos: action.pos, currentId: contextIdAt(s, action.pos), fromQueue: false });
    }

    case "REMOVE_SONGS": {
      // Canciones borradas o sin archivo: se quitan de todo.
      // Si sonaba una de ellas, se pasa a la siguiente como si se pulsara "siguiente".
      const gone = action.ids instanceof Set ? action.ids : new Set(action.ids);
      const newIndex = [];
      let n = 0;
      s.context.ids.forEach((id, i) => (newIndex[i] = gone.has(id) ? -1 : n++));
      const ids = s.context.ids.filter((id) => !gone.has(id));
      const order = s.order.map((i) => newIndex[i]).filter((i) => i >= 0);
      // ancla: la última canción viva en o antes de la posición actual
      const alive = s.order.slice(0, s.pos + 1).filter((i) => newIndex[i] >= 0).length;
      const base = {
        ...s,
        context: { ...s.context, ids },
        order,
        pos: alive - 1,
        userQueue: s.userQueue.filter((id) => !gone.has(id)),
      };
      if (!gone.has(s.currentId)) return base;
      const next = queueReducer(base, { type: "NEXT", random });
      if (next !== base) return next;
      return withTrack(base, { currentId: null, fromQueue: false });
    }

    case "RESTORE":
      return { ...initialQueueState, ...action.state, token: s.token + 1 };

    default:
      return s;
  }
}

/** Parte del estado que se guarda para restaurar al reabrir la app. */
export function serializeQueue(s) {
  const { context, order, pos, userQueue, currentId, fromQueue, shuffle, repeat } = s;
  return { context, order, pos, userQueue, currentId, fromQueue, shuffle, repeat };
}
