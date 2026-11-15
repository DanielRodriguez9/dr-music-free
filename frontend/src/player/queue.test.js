import { describe, expect, it } from "vitest";
import { initialQueueState as init, peekNext, queueReducer, upcomingFromContext } from "./queue";

const ids = [10, 20, 30, 40, 50];
// "aleatorio" determinista: invierte el orden
const rev = () => 0;

const run = (state, ...actions) => actions.reduce((s, a) => queueReducer(s, a), state);
const play = (startId, extra = {}) =>
  run({ ...init, ...extra }, { type: "PLAY_CONTEXT", ids, startId, label: "Biblioteca", random: rev });

describe("reproducir una lista", () => {
  it("empieza en la canción elegida y sigue en orden", () => {
    let s = play(30);
    expect(s.currentId).toBe(30);
    s = run(s, { type: "NEXT" });
    expect(s.currentId).toBe(40);
    expect(peekNext(s)).toBe(50);
  });

  it("al final de la lista se detiene si repetir está apagado", () => {
    const s = play(50);
    expect(peekNext(s)).toBeNull();
    expect(run(s, { type: "NEXT" })).toBe(s);
  });

  it("repetir todas vuelve al principio (siguiente y anterior)", () => {
    let s = play(50, { repeat: "all" });
    s = run(s, { type: "NEXT" });
    expect(s.currentId).toBe(10);
    s = run(s, { type: "PREV" });
    expect(s.currentId).toBe(50);
  });

  it("anterior en la primera canción la reinicia (cambia el token)", () => {
    const s = play(10);
    const p = run(s, { type: "PREV" });
    expect(p.currentId).toBe(10);
    expect(p.token).toBe(s.token + 1);
  });

  it("repetir cicla off -> all -> one -> off", () => {
    const modes = [];
    let s = init;
    for (let i = 0; i < 3; i++) {
      s = run(s, { type: "CYCLE_REPEAT" });
      modes.push(s.repeat);
    }
    expect(modes).toEqual(["all", "one", "off"]);
  });
});

describe("aleatorio", () => {
  it("la canción actual queda primera y luego suenan todas sin repetir", () => {
    let s = play(30, { shuffle: true });
    const seen = [s.currentId];
    while (peekNext(s) != null) {
      s = run(s, { type: "NEXT" });
      seen.push(s.currentId);
    }
    expect(seen[0]).toBe(30);
    expect([...seen].sort()).toEqual([...ids].sort());
  });

  it("anterior con aleatorio vuelve a la canción anterior, no a una al azar", () => {
    let s = play(10, { shuffle: true });
    s = run(s, { type: "NEXT" });
    const second = s.currentId;
    s = run(s, { type: "NEXT" }, { type: "PREV" });
    expect(s.currentId).toBe(second);
  });

  it("activar y desactivar mantiene la canción actual y el orden original", () => {
    let s = play(30);
    s = run(s, { type: "TOGGLE_SHUFFLE", random: rev });
    expect(s.currentId).toBe(30);
    expect(s.order[s.pos]).toBe(2);
    s = run(s, { type: "TOGGLE_SHUFFLE" });
    expect(s.order).toEqual([0, 1, 2, 3, 4]);
    expect(run(s, { type: "NEXT" }).currentId).toBe(40);
  });
});

describe("cola manual", () => {
  it("la cola tiene prioridad y luego se retoma la lista", () => {
    let s = play(10);
    s = run(s, { type: "ADD_TO_QUEUE", id: 50 }, { type: "ADD_TO_QUEUE", id: 40, next: true });
    expect(s.userQueue).toEqual([40, 50]);
    s = run(s, { type: "NEXT" });
    expect([s.currentId, s.fromQueue]).toEqual([40, true]);
    s = run(s, { type: "NEXT" });
    expect(s.currentId).toBe(50);
    s = run(s, { type: "NEXT" });
    expect([s.currentId, s.fromQueue]).toEqual([20, false]);
  });

  it("anterior desde una canción de la cola la devuelve a la cola", () => {
    let s = play(10);
    s = run(s, { type: "ADD_TO_QUEUE", id: 50 }, { type: "NEXT" }, { type: "PREV" });
    expect(s.currentId).toBe(10);
    expect(s.userQueue).toEqual([50]);
  });

  it("añadir a la cola sin nada sonando la reproduce", () => {
    const s = run(init, { type: "ADD_TO_QUEUE", id: 7 });
    expect(s.currentId).toBe(7);
  });

  it("saltar a un elemento de la cola descarta los anteriores", () => {
    let s = play(10);
    s = run(s, { type: "ADD_TO_QUEUE", id: 30 }, { type: "ADD_TO_QUEUE", id: 40 }, { type: "ADD_TO_QUEUE", id: 50 });
    s = run(s, { type: "JUMP_QUEUE", index: 1 });
    expect(s.currentId).toBe(40);
    expect(s.userQueue).toEqual([50]);
  });

  it("quitar y vaciar", () => {
    let s = play(10);
    s = run(s, { type: "ADD_TO_QUEUE", id: 30 }, { type: "ADD_TO_QUEUE", id: 40 });
    expect(run(s, { type: "REMOVE_FROM_QUEUE", index: 0 }).userQueue).toEqual([40]);
    expect(run(s, { type: "CLEAR_QUEUE" }).userQueue).toEqual([]);
  });

  it("A continuación lista las próximas de la lista", () => {
    const s = play(30);
    expect(upcomingFromContext(s).map((u) => u.id)).toEqual([40, 50]);
  });
});

describe("borrar canciones", () => {
  it("borrar la que suena pasa a la siguiente", () => {
    const s = run(play(30), { type: "REMOVE_SONGS", ids: [30] });
    expect(s.currentId).toBe(40);
    expect(s.context.ids).toEqual([10, 20, 40, 50]);
    expect(run(s, { type: "NEXT" }).currentId).toBe(50);
  });

  it("borrar la última que suena sin repetir detiene la reproducción", () => {
    const s = run(play(50), { type: "REMOVE_SONGS", ids: [50] });
    expect(s.currentId).toBeNull();
  });

  it("borrar la que suena prioriza la cola manual", () => {
    let s = run(play(30), { type: "ADD_TO_QUEUE", id: 10 });
    s = run(s, { type: "REMOVE_SONGS", ids: [30] });
    expect(s.currentId).toBe(10);
    expect(run(s, { type: "NEXT" }).currentId).toBe(40);
  });

  it("borrar otra canción mantiene la actual y su posición", () => {
    let s = run(play(30), { type: "REMOVE_SONGS", ids: [10, 50] });
    expect(s.currentId).toBe(30);
    expect(s.token).toBe(play(30).token);
    s = run(s, { type: "NEXT" });
    expect(s.currentId).toBe(40);
    expect(peekNext(s)).toBeNull();
  });

  it("borrar mientras suena una de la cola conserva el punto de la lista", () => {
    let s = run(play(20), { type: "ADD_TO_QUEUE", id: 50 }, { type: "NEXT" });
    s = run(s, { type: "REMOVE_SONGS", ids: [20] });
    expect(s.currentId).toBe(50);
    expect(run(s, { type: "NEXT" }).currentId).toBe(30);
  });

  it("borrar la que suena con aleatorio sigue el orden mezclado", () => {
    let s = play(10, { shuffle: true });
    const after = peekNext(s);
    s = run(s, { type: "REMOVE_SONGS", ids: [10] });
    expect(s.currentId).toBe(after);
  });
});

describe("restaurar", () => {
  it("RESTORE recupera el estado guardado", () => {
    const saved = { ...play(30), userQueue: [50] };
    const s = run(init, { type: "RESTORE", state: saved });
    expect([s.currentId, s.userQueue]).toEqual([30, [50]]);
  });
});

describe("varias canciones y canciones en línea", () => {
  it("añade varias a la cola en orden (al final y a continuación)", () => {
    let s = play(10);
    s = run(s, { type: "ADD_TO_QUEUE", ids: [40, 50] });
    s = run(s, { type: "ADD_TO_QUEUE", ids: [20, 30], next: true });
    expect(s.userQueue).toEqual([20, 30, 40, 50]);
  });

  it("sin nada sonando, empieza con la primera y deja el resto en la cola", () => {
    const s = run(init, { type: "ADD_TO_QUEUE", ids: ["yt:aaaaaaaaaaa", 20] });
    expect(s.currentId).toBe("yt:aaaaaaaaaaa");
    expect(s.userQueue).toEqual([20]);
  });

  it("REPLACE_ID cambia la canción en línea por la descargada sin cambiar de pista", () => {
    let s = run(init, { type: "PLAY_CONTEXT", ids: ["yt:aaaaaaaaaaa", "yt:bbbbbbbbbbb"], startId: "yt:aaaaaaaaaaa" });
    s = run(s, { type: "ADD_TO_QUEUE", id: "yt:aaaaaaaaaaa" });
    const r = run(s, { type: "REPLACE_ID", from: "yt:aaaaaaaaaaa", to: 7 });
    expect(r.currentId).toBe(7);
    expect(r.context.ids).toEqual([7, "yt:bbbbbbbbbbb"]);
    expect(r.userQueue).toEqual([7]);
    expect(r.token).toBe(s.token);
  });
});
