import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import toast from "react-hot-toast";
import { api, artistLabel, audioUrlForId, coverUrls, isOnlineId, isPlayable, prepareOnline } from "../api";
import { PlayerContext, PlayerTimeContext } from "../context/contexts";
import { useLibrary } from "../context/hooks";
import { load, save } from "../lib/storage";
import { onlineErrorToast } from "../lib/ytdlp";
import { initialQueueState, peekNext, queueReducer, serializeQueue, upcomingFromContext } from "./queue";

const POSITION_SAVE_MS = 5000;

// Un único elemento de audio para toda la app (vive fuera de React).
const audio = typeof Audio === "undefined" ? null : new Audio();
if (audio) audio.preload = "auto";
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function restoreQueue() {
  const saved = load("queue", null);
  return saved && typeof saved === "object" ? { ...initialQueueState, ...saved } : initialQueueState;
}

export default function PlayerProvider({ children }) {
  const { byId, status: libraryStatus, recordPlay } = useLibrary();

  const [state, dispatch] = useReducer(queueReducer, undefined, restoreQueue);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(() => clamp01(Number(load("volume", 0.7)) || 0));
  const [muted, setMuted] = useState(() => Boolean(load("muted", false)));
  const [time, setTime] = useState({ pos: 0, dur: 0 });
  const [loading, setLoading] = useState(false); // esperando audio (sobre todo en línea)

  // Refs para leer el estado más reciente desde los eventos del <audio>
  const stateRef = useRef(state);
  const autoplayRef = useRef(false); // ¿reproducir al cambiar de pista?
  const loadedKeyRef = useRef(null); // pista cargada (id:token)
  const restoreRef = useRef(load("position", null)); // { id, t } de la última sesión
  const lastSaveRef = useRef(0);
  const errorsRef = useRef(0);
  const handlersRef = useRef({});
  // Escucha en curso para el historial: { songId, startedAt, listened, lastPos }
  const sessionRef = useRef(null);
  const byIdRef = useRef(byId);
  useEffect(() => {
    byIdRef.current = byId;
  }, [byId]);

  const finishSession = useCallback(
    (reason, opts) => {
      const ses = sessionRef.current;
      sessionRef.current = null;
      if (!ses || ses.listened < 1) return; // ni un segundo: no es una escucha
      const base = { started_at: ses.startedAt, listened_seconds: ses.listened, end_reason: reason };
      if (isOnlineId(ses.songId)) {
        // canción en línea: se guarda el video y sus datos (no está en la biblioteca)
        const t = byIdRef.current.get(ses.songId);
        recordPlay(
          { ...base, youtube_id: ses.songId.slice(3), title: t?.title, artist: t?.artist, duration: t?.duration || null },
          opts,
        );
      } else {
        recordPlay({ ...base, song_id: ses.songId }, opts);
      }
    },
    [recordPlay],
  );

  const startSession = useCallback((songId, fromPos = 0) => {
    sessionRef.current = { songId, startedAt: null, listened: 0, lastPos: fromPos };
  }, []);

  useEffect(() => {
    stateRef.current = state;
    save("queue", serializeQueue(state));
  }, [state]);

  // ---------- cargar la pista actual en el <audio> ----------
  useEffect(() => {
    // el token cambia con cada cambio de pista; REPLACE_ID (en línea -> descargada) no lo cambia
    // y así la canción sigue sonando sin cortes
    const key = state.token;
    if (loadedKeyRef.current === key) return;
    loadedKeyRef.current = key;
    finishSession("skipped"); // si la anterior terminó sola, ya se cerró como "ended"

    if (state.currentId == null) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      return;
    }

    const url = audioUrlForId(state.currentId);
    if (audio.src === url) {
      audio.currentTime = 0;
    } else {
      audio.src = url;
    }

    const restore = restoreRef.current;
    restoreRef.current = null;
    const resumeAt = restore && restore.id === state.currentId && restore.t > 1 ? restore.t : 0;
    if (resumeAt) {
      audio.addEventListener("loadedmetadata", () => (audio.currentTime = resumeAt), { once: true });
    }
    startSession(state.currentId, resumeAt);

    if (autoplayRef.current) audio.play().catch(() => {});
  }, [state.currentId, state.token, finishSession, startSession]);

  // ---------- quitar de la cola lo que ya no existe (borrado o sin archivo) ----------
  useEffect(() => {
    if (libraryStatus !== "ready") return;
    const gone = new Set();
    for (const id of [...state.context.ids, ...state.userQueue, state.currentId]) {
      if (id != null && !isPlayable(byId.get(id))) gone.add(id);
    }
    if (gone.size) {
      autoplayRef.current = !audio.paused; // si estaba sonando, la siguiente también suena
      dispatch({ type: "REMOVE_SONGS", ids: gone });
    }
  }, [libraryStatus, byId, state.context.ids, state.userQueue, state.currentId]);

  // ---------- volumen ----------
  useEffect(() => {
    audio.volume = volume * volume; // curva perceptual: más control en volúmenes bajos
    audio.muted = muted;
    save("volume", volume);
    save("muted", muted);
  }, [volume, muted]);

  // ---------- eventos del <audio> ----------
  useEffect(() => {
    const savePosition = () => {
      const id = stateRef.current.currentId;
      if (id != null) save("position", { id, t: audio.currentTime });
    };
    const onPlay = () => setIsPlaying(true);
    const onWaiting = () => setLoading(true);
    const onReady = () => setLoading(false);
    const onPlaying = () => {
      errorsRef.current = 0;
      setLoading(false);
      const ses = sessionRef.current;
      if (ses && !ses.startedAt) ses.startedAt = new Date().toISOString();
    };
    const onSeeked = () => {
      if (sessionRef.current) sessionRef.current.lastPos = audio.currentTime;
    };
    const onPause = () => {
      setIsPlaying(false);
      setLoading(false);
      savePosition();
    };
    const onTime = () => {
      setTime((t) => ({ ...t, pos: audio.currentTime }));
      // suma solo el tiempo realmente escuchado (los saltos con la barra no cuentan)
      const ses = sessionRef.current;
      if (ses && !audio.paused) {
        const delta = audio.currentTime - ses.lastPos;
        if (delta > 0 && delta < 1.5) ses.listened += delta;
        ses.lastPos = audio.currentTime;
      }
      const now = Date.now();
      if (now - lastSaveRef.current > POSITION_SAVE_MS) {
        lastSaveRef.current = now;
        savePosition();
      }
    };
    const onDuration = () => setTime((t) => ({ ...t, dur: Number.isFinite(audio.duration) ? audio.duration : 0 }));
    const onEmptied = () => setTime({ pos: 0, dur: 0 });
    const onEnded = () => handlersRef.current.ended?.();
    const onError = () => {
      setLoading(false);
      handlersRef.current.error?.();
    };
    const onLoadStart = () => {
      if (!audio.paused || autoplayRef.current) setLoading(true);
    };

    const events = {
      play: onPlay,
      playing: onPlaying,
      pause: onPause,
      seeked: onSeeked,
      timeupdate: onTime,
      durationchange: onDuration,
      loadedmetadata: onDuration,
      emptied: onEmptied,
      ended: onEnded,
      error: onError,
      waiting: onWaiting,
      loadstart: onLoadStart,
      canplay: onReady,
    };
    Object.entries(events).forEach(([e, fn]) => audio.addEventListener(e, fn));
    const onPageHide = () => {
      savePosition();
      handlersRef.current.close?.();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      Object.entries(events).forEach(([e, fn]) => audio.removeEventListener(e, fn));
      window.removeEventListener("pagehide", onPageHide);
      savePosition();
    };
  }, []);

  // ---------- acciones ----------
  const changeTrack = useCallback((action, autoplay = true) => {
    autoplayRef.current = autoplay;
    dispatch(action);
  }, []);

  const playContext = useCallback(
    (ids, startId, label) => changeTrack({ type: "PLAY_CONTEXT", ids, startId, label }),
    [changeTrack],
  );

  const play = useCallback(() => {
    if (stateRef.current.currentId == null) return;
    audio.play().catch(() => {});
  }, []);

  const pause = useCallback(() => audio.pause(), []);

  const togglePlay = useCallback(() => {
    if (stateRef.current.currentId == null) return false;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
    return true;
  }, []);

  const next = useCallback(() => {
    if (peekNext(stateRef.current) == null) {
      toast("Fin de la lista", { icon: "⏹️", id: "end-of-list" });
      return;
    }
    changeTrack({ type: "NEXT" });
  }, [changeTrack]);

  const prev = useCallback(() => {
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    changeTrack({ type: "PREV" });
  }, [changeTrack]);

  const seek = useCallback(
    (t) => {
      if (!Number.isFinite(t)) return;
      const max = Number.isFinite(audio.duration) ? audio.duration : t;
      audio.currentTime = Math.min(Math.max(t, 0), max);
      setTime((cur) => ({ ...cur, pos: audio.currentTime }));
    },
    [],
  );

  const seekBy = useCallback((delta) => seek(audio.currentTime + delta), [seek]);

  const setVolume = useCallback((v) => {
    const nv = clamp01(v);
    setVolumeState(nv);
    if (nv > 0) setMuted(false);
  }, []);

  const changeVolume = useCallback((delta) => {
    setVolumeState((v) => clamp01(Math.round((v + delta) * 100) / 100));
    setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);
  const toggleShuffle = useCallback(() => dispatch({ type: "TOGGLE_SHUFFLE" }), []);
  const cycleRepeat = useCallback(() => dispatch({ type: "CYCLE_REPEAT" }), []);

  // id o lista de ids
  const addToQueue = useCallback(
    (ids) => {
      const starting = stateRef.current.currentId == null;
      changeTrack({ type: "ADD_TO_QUEUE", ids: [].concat(ids) }, starting);
    },
    [changeTrack],
  );
  const playNext = useCallback(
    (ids) => {
      const starting = stateRef.current.currentId == null;
      changeTrack({ type: "ADD_TO_QUEUE", ids: [].concat(ids), next: true }, starting);
    },
    [changeTrack],
  );
  /** Una canción en línea ya se descargó: se cambia por la de la biblioteca sin cortar el audio. */
  const replaceTrack = useCallback((from, to) => {
    if (sessionRef.current?.songId === from) sessionRef.current.songId = to;
    dispatch({ type: "REPLACE_ID", from, to });
  }, []);
  const removeFromQueue = useCallback((index) => dispatch({ type: "REMOVE_FROM_QUEUE", index }), []);
  const clearQueue = useCallback(() => dispatch({ type: "CLEAR_QUEUE" }), []);
  const jumpToQueue = useCallback((index) => changeTrack({ type: "JUMP_QUEUE", index }), [changeTrack]);
  const jumpToContext = useCallback((pos) => changeTrack({ type: "JUMP_CONTEXT", pos }), [changeTrack]);

  // Fin de canción y errores (leen el estado más reciente vía ref)
  useEffect(() => {
    handlersRef.current = {
      ended() {
        const s = stateRef.current;
        finishSession("ended");
        startSession(s.currentId);
        if (s.repeat === "one") {
          audio.currentTime = 0;
          audio.play().catch(() => {});
        } else if (peekNext(s) != null) {
          changeTrack({ type: "NEXT" });
        } else {
          audio.currentTime = 0; // fin de la lista: queda en pausa al principio
        }
      },
      close() {
        finishSession("closed", { beacon: true });
      },
      error() {
        if (!audio.getAttribute("src")) return;
        const id = stateRef.current.currentId;
        const song = byId.get(id);
        if (isOnlineId(id)) {
          // el reproductor no dice por qué falló: se le pregunta al servidor
          api
            .get(`/stream/${id.slice(3)}/info`, { timeout: 120000 })
            .then(() =>
              toast.error(`Se cortó el audio en línea de "${song?.title ?? "la canción"}". Prueba otra vez.`, {
                id: "audio-error",
              }),
            )
            .catch((err) => onlineErrorToast(err, song));
          return; // no se salta sola: el aviso explica qué hacer
        }
        toast.error(`No se pudo reproducir ${song ? `"${song.title}"` : "la canción"}`, { id: "audio-error" });
        errorsRef.current += 1;
        if (errorsRef.current < 3 && peekNext(stateRef.current) != null && !audio.paused) {
          changeTrack({ type: "NEXT" });
        }
      },
    };
  }, [byId, changeTrack, finishSession, startSession]);

  const current = state.currentId != null ? byId.get(state.currentId) ?? null : null;

  // si la siguiente es en línea, se prepara mientras suena esta
  useEffect(() => {
    if (!isPlaying) return;
    const nextId = peekNext(state);
    if (!isOnlineId(nextId)) return;
    const timer = setTimeout(() => prepareOnline(nextId.slice(3)), 3000);
    return () => clearTimeout(timer);
  }, [state, isPlaying]);

  // ---------- teclas multimedia del teclado / Windows (MediaSession) ----------
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms) return;
    const handlers = {
      play,
      pause,
      previoustrack: prev,
      nexttrack: next,
      seekbackward: (d) => seekBy(-(d.seekOffset || 10)),
      seekforward: (d) => seekBy(d.seekOffset || 10),
      seekto: (d) => seek(d.seekTime),
      stop: pause,
    };
    for (const [action, fn] of Object.entries(handlers)) {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        /* acción no soportada */
      }
    }
    return () => {
      for (const action of Object.keys(handlers)) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          /* acción no soportada */
        }
      }
    };
  }, [play, pause, prev, next, seek, seekBy]);

  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms || typeof window.MediaMetadata === "undefined") return;
    ms.metadata = current
      ? new window.MediaMetadata({
          title: current.title,
          artist: artistLabel(current),
          album: current.album || "DR Music Free",
          artwork: coverUrls(current)
            .slice(-1)
            .map((src) => ({ src, sizes: "320x180", type: "image/jpeg" })),
        })
      : null;
  }, [current]);

  useEffect(() => {
    if (navigator.mediaSession) navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms?.setPositionState || !time.dur) return;
    try {
      ms.setPositionState({ duration: time.dur, position: Math.min(audio.currentTime, time.dur), playbackRate: 1 });
    } catch {
      /* valores fuera de rango durante la carga */
    }
    // solo al cambiar de pista o al pausar/reanudar: no en cada timeupdate
  }, [time.dur, isPlaying, state.token]);

  const upcoming = useMemo(() => upcomingFromContext(state, 50), [state]);

  const value = useMemo(
    () => ({
      queue: state,
      upcoming,
      current,
      isPlaying,
      loading,
      volume,
      muted,
      playContext,
      play,
      pause,
      togglePlay,
      next,
      prev,
      setVolume,
      changeVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      addToQueue,
      playNext,
      removeFromQueue,
      clearQueue,
      jumpToQueue,
      jumpToContext,
      replaceTrack,
    }),
    [state, upcoming, current, isPlaying, loading, replaceTrack, volume, muted, playContext, play, pause, togglePlay, next, prev, setVolume,
      changeVolume, toggleMute, toggleShuffle, cycleRepeat, addToQueue, playNext, removeFromQueue, clearQueue,
      jumpToQueue, jumpToContext],
  );

  const fallbackDuration = current?.duration || 0;
  const timeValue = useMemo(
    () => ({ currentTime: time.pos, duration: time.dur || fallbackDuration, seek, seekBy }),
    [time, fallbackDuration, seek, seekBy],
  );

  return (
    <PlayerContext.Provider value={value}>
      <PlayerTimeContext.Provider value={timeValue}>{children}</PlayerTimeContext.Provider>
    </PlayerContext.Provider>
  );
}
