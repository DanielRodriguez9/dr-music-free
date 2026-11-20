import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, desktop } from "../api";
import { DEFAULT_PREFS } from "../lib/prefs";
import { load, save } from "../lib/storage";
import { isView } from "../lib/views";
import { UIContext } from "./contexts";

export default function UIProvider({ children }) {
  const [view, setView] = useState(() => {
    const v = load("view", "home");
    return isView(v) ? v : "home";
  });
  const [query, setQuery] = useState("");
  // preferencias (nombre del saludo, letras, fondo): en la app de escritorio viven en settings.json
  const [prefs, setPrefs] = useState(() => ({ ...DEFAULT_PREFS, ...(desktop ? desktop.prefs : load("prefs", { userName: load("userName", "") })) }));
  const userName = prefs.userName || "";
  // panel de la derecha: la cola o la letra (no las dos a la vez)
  const [queueOpen, setQueueOpen] = useState(() => Boolean(load("queueOpen", false)));
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [karaoke, setKaraoke] = useState(false);
  // bienvenida: { defaultMusicDir } la primera vez en este equipo
  const [welcome, setWelcome] = useState(() => desktop?.welcome ?? null);
  // imagen de fondo propia guardada en la carpeta de datos: { url } o null
  const [bgImage, setBgImage] = useState(null);
  useEffect(() => {
    api
      .get("/appearance/")
      .then(({ data }) => setBgImage(data.background))
      .catch(() => {});
  }, []);
  const [dialog, setDialog] = useState(null); // { type: "download" | "shortcuts" | "confirm", ... }
  const [menu, setMenu] = useState(null); // { x, y, song, context }
  const searchRef = useRef(null);
  const scrollRef = useRef(null);

  const navigate = useCallback((next) => {
    if (!isView(next)) return;
    setView(next);
    save("view", next);
    scrollRef.current?.scrollTo({ top: 0 });
  }, []);

  /** Cambia una preferencia; en la app de escritorio la valida y la guarda Electron. */
  const setPref = useCallback(async (key, value) => {
    let saved = value;
    if (desktop) saved = await desktop.setSetting(key, value);
    setPrefs((p) => {
      const next = { ...p, [key]: saved };
      if (!desktop) save("prefs", next);
      return next;
    });
    return saved;
  }, []);

  /** Cambia una preferencia solo en pantalla (mientras se arrastra un deslizador). */
  const previewPref = useCallback((key, value) => setPrefs((p) => ({ ...p, [key]: value })), []);

  const setUserName = useCallback(
    (name) => setPref("userName", (name || "").replace(/\s+/g, " ").trim().slice(0, 40)),
    [setPref],
  );

  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
    searchRef.current?.select();
  }, []);

  const searchFor = useCallback(
    (text) => {
      setQuery(text);
      navigate("search");
    },
    [navigate],
  );

  const toggleQueue = useCallback(() => {
    setQueueOpen((open) => {
      save("queueOpen", !open);
      if (!open) setLyricsOpen(false);
      return !open;
    });
  }, []);

  const openLyrics = useCallback((open = true) => {
    setLyricsOpen(open);
    if (open) {
      setQueueOpen(false);
      save("queueOpen", false);
    }
  }, []);
  const toggleLyrics = useCallback(() => {
    setLyricsOpen((open) => {
      if (!open) {
        setQueueOpen(false);
        save("queueOpen", false);
      }
      return !open;
    });
  }, []);

  /** Diálogo de confirmación que devuelve una promesa con true/false. */
  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        setDialog({ type: "confirm", ...options, resolve });
      }),
    [],
  );

  /** Diálogo para escribir un texto (nombre de lista o género). Devuelve el texto o null. */
  const prompt = useCallback(
    (options) =>
      new Promise((resolve) => {
        setDialog({ type: "prompt", ...options, resolve });
      }),
    [],
  );

  const closeDialog = useCallback((result = false) => {
    setDialog((d) => {
      d?.resolve?.(result);
      return null;
    });
  }, []);

  const openMenu = useCallback((event, song, context = {}) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget?.getBoundingClientRect?.();
    // desde el botón "..." se abre bajo el botón; con clic derecho, donde está el ratón
    const fromButton = event.type === "click" && rect;
    setMenu({
      x: fromButton ? rect.right : event.clientX,
      y: fromButton ? rect.bottom + 4 : event.clientY,
      alignRight: Boolean(fromButton),
      id: Date.now(),
      song,
      context,
    });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const value = useMemo(
    () => ({
      view,
      navigate,
      query,
      setQuery,
      userName,
      setUserName,
      prefs,
      setPref,
      previewPref,
      bgImage,
      setBgImage,
      lyricsOpen,
      openLyrics,
      toggleLyrics,
      karaoke,
      setKaraoke,
      welcome,
      setWelcome,
      searchFor,
      searchRef,
      scrollRef,
      focusSearch,
      queueOpen,
      toggleQueue,
      dialog,
      openDialog: setDialog,
      closeDialog,
      confirm,
      prompt,
      menu,
      openMenu,
      closeMenu,
    }),
    [view, navigate, query, userName, setUserName, prefs, setPref, previewPref, bgImage, lyricsOpen, openLyrics, toggleLyrics, karaoke, welcome, searchFor, focusSearch, queueOpen, toggleQueue, dialog, closeDialog, confirm, prompt, menu, openMenu, closeMenu],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}
