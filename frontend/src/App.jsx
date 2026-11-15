import { useEffect } from "react";
import { Toaster } from "react-hot-toast";
import { desktop } from "./api";
import ContextMenu from "./components/ContextMenu";
import Dialogs from "./components/Dialogs";
import PlayerBar from "./components/PlayerBar";
import QueuePanel from "./components/QueuePanel";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import LibraryProvider from "./context/LibraryProvider";
import UIProvider from "./context/UIProvider";
import { useLibrary, usePlayer, useUI } from "./context/hooks";
import useShortcuts from "./hooks/useShortcuts";
import useStableHandlers from "./hooks/useStableHandlers";
import useSongActions from "./hooks/useSongActions";
import Collection from "./pages/Collection";
import History from "./pages/History";
import Settings from "./pages/Settings";
import Home from "./pages/Home";
import Search from "./pages/Search";
import PlayerProvider from "./player/PlayerProvider";

/** Componente sin interfaz que registra los atajos de teclado. */
function Shortcuts() {
  const { toggleLike } = useSongActions();
  useShortcuts({ onToggleLike: toggleLike });
  return null;
}

/** App de escritorio: órdenes de la bandeja del sistema y estado para su menú. */
function DesktopBridge() {
  const player = usePlayer();
  const { current, isPlaying } = player;
  const h = useStableHandlers({
    command: (cmd) => {
      if (cmd === "toggle") player.togglePlay();
      else if (cmd === "next") player.next();
      else if (cmd === "prev") player.prev();
    },
  });

  useEffect(() => desktop.onPlayerCommand(h.command), [h]);

  useEffect(() => {
    desktop.sendPlayerState({ title: current?.title ?? null, artist: current?.artist ?? null, isPlaying });
  }, [current?.title, current?.artist, isPlaying]);

  return null;
}

function BackendError() {
  const { error, reload } = useLibrary();
  return (
    <div className="page page--center">
      <h1 className="page-title">No se pudo conectar con la biblioteca</h1>
      <p className="muted">El servidor de música no responde ({error}). Comprueba que el backend esté en marcha.</p>
      <button type="button" className="btn btn--primary" onClick={() => reload().catch(() => {})}>
        Reintentar
      </button>
    </div>
  );
}

function Content() {
  const { view } = useUI();
  const { songs, playable, status } = useLibrary();

  if (status === "error") return <BackendError />;
  switch (view) {
    case "search":
      return <Search />;
    case "library":
      return (
        <Collection
          id="library"
          title="Tu biblioteca"
          kicker="Colección"
          songs={songs}
          emptyText="Tu biblioteca está vacía. Usa «Descargar» para añadir canciones."
        />
      );
    case "liked":
      return (
        <Collection
          id="liked"
          title="Tus me gusta"
          kicker="Lista"
          icon="liked"
          songs={playable.filter((s) => s.liked)}
          emptyText="Pulsa el corazón en cualquier canción para guardarla aquí."
        />
      );
    case "history":
      return <History />;
    case "settings":
      return <Settings />;
    default:
      return <Home />;
  }
}

function Layout() {
  const { queueOpen, scrollRef } = useUI();
  return (
    <div className={`app ${queueOpen ? "has-queue" : ""}`}>
      <Sidebar />
      <main className="main" ref={scrollRef}>
        <TopBar />
        <Content />
      </main>
      {queueOpen && <QueuePanel />}
      <PlayerBar />
      <ContextMenu />
      <Dialogs />
      <Shortcuts />
      {desktop && <DesktopBridge />}
      <Toaster
        position="bottom-center"
        containerStyle={{ bottom: "calc(var(--player-h) + 16px)" }}
        toastOptions={{ className: "toast", duration: 2500 }}
      />
    </div>
  );
}

export default function App() {
  return (
    <UIProvider>
      <LibraryProvider>
        <PlayerProvider>
          <Layout />
        </PlayerProvider>
      </LibraryProvider>
    </UIProvider>
  );
}
