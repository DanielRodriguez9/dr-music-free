import { useCallback, useMemo, useRef, useState } from "react";
import { desktop } from "../api";
import { load, save } from "../lib/storage";
import { isView } from "../lib/views";
import { UIContext } from "./contexts";

export default function UIProvider({ children }) {
  const [view, setView] = useState(() => {
    const v = load("view", "home");
    return isView(v) ? v : "home";
  });
  const [query, setQuery] = useState("");
  // nombre para el saludo de Inicio: en la app de escritorio vive en settings.json
  const [userName, setUserNameState] = useState(() => (desktop ? desktop.userName || "" : load("userName", "")));
  const [queueOpen, setQueueOpen] = useState(() => Boolean(load("queueOpen", false)));
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

  const setUserName = useCallback((name) => {
    const clean = (name || "").replace(/\s+/g, " ").trim().slice(0, 40);
    setUserNameState(clean);
    if (desktop) return desktop.setSetting("userName", clean);
    save("userName", clean);
    return Promise.resolve();
  }, []);

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
    [view, navigate, query, userName, setUserName, searchFor, focusSearch, queueOpen, toggleQueue, dialog, closeDialog, confirm, prompt, menu, openMenu, closeMenu],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}
