import { useCallback, useMemo, useRef, useState } from "react";
import { load, save } from "../lib/storage";
import { UIContext } from "./contexts";

const VIEWS = ["home", "search", "library", "liked", "history", "settings"];

export default function UIProvider({ children }) {
  const [view, setView] = useState(() => {
    const v = load("view", "home");
    return VIEWS.includes(v) ? v : "home";
  });
  const [query, setQuery] = useState("");
  const [queueOpen, setQueueOpen] = useState(() => Boolean(load("queueOpen", false)));
  const [dialog, setDialog] = useState(null); // { type: "download" | "shortcuts" | "confirm", ... }
  const [menu, setMenu] = useState(null); // { x, y, song, context }
  const searchRef = useRef(null);
  const scrollRef = useRef(null);

  const navigate = useCallback((next) => {
    if (!VIEWS.includes(next)) return;
    setView(next);
    save("view", next);
    scrollRef.current?.scrollTo({ top: 0 });
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

  const closeDialog = useCallback((result = false) => {
    setDialog((d) => {
      d?.resolve?.(result);
      return null;
    });
  }, []);

  const openMenu = useCallback((event, song, context) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget?.getBoundingClientRect?.();
    // desde el botón "..." se abre bajo el botón; con clic derecho, donde está el ratón
    const fromButton = event.type === "click" && rect;
    setMenu({
      x: fromButton ? rect.right : event.clientX,
      y: fromButton ? rect.bottom + 4 : event.clientY,
      alignRight: Boolean(fromButton),
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
      menu,
      openMenu,
      closeMenu,
    }),
    [view, navigate, query, searchFor, focusSearch, queueOpen, toggleQueue, dialog, closeDialog, confirm, menu, openMenu, closeMenu],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}
