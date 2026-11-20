import { useEffect } from "react";
import { Toaster } from "react-hot-toast";
import { desktop } from "./api";
import Backdrop from "./components/Backdrop";
import ContextMenu from "./components/ContextMenu";
import Dialogs from "./components/Dialogs";
import EmptyLibrary from "./components/EmptyLibrary";
import Welcome from "./components/Welcome";
import { Karaoke, LyricsAutoOpen, LyricsPanel } from "./components/Lyrics";
import PlayerBar from "./components/PlayerBar";
import QueuePanel from "./components/QueuePanel";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import CollectionsProvider from "./context/CollectionsProvider";
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
import { AlbumPage, AlbumsPage } from "./pages/Albums";
import { ArtistPage, ArtistsPage } from "./pages/Artists";
import Fixes from "./pages/Fixes";
import MixPage from "./pages/Mix";
import { GenrePage, PlaylistPage } from "./pages/Playlist";
import Search from "./pages/Search";
import { parseView } from "./lib/views";
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
  const { name, param } = parseView(view);
  if (name === "playlist") return <PlaylistPage id={param} />;
  if (name === "genre") return <GenrePage name={param} />;
  if (name === "artist") return <ArtistPage id={param} />;
  if (name === "album") return <AlbumPage id={param} />;
  if (name === "mix") return <MixPage id={param} />;
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
          genreFilter
          emptyContent={<EmptyLibrary />}
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
    case "artists":
      return <ArtistsPage />;
    case "albums":
      return <AlbumsPage />;
    case "fixes":
      return <Fixes />;
    case "settings":
      return <Settings />;
    default:
      return <Home />;
  }
}

function Layout() {
  const { queueOpen, lyricsOpen, karaoke, welcome, scrollRef } = useUI();
  return (
    <div className={`app ${queueOpen || lyricsOpen ? "has-queue" : ""}`}>
      <Backdrop />
      <Sidebar />
      <main className="main" ref={scrollRef}>
        <TopBar />
        <Content />
      </main>
      {queueOpen ? <QueuePanel /> : lyricsOpen ? <LyricsPanel /> : null}
      <PlayerBar />
      <ContextMenu />
      <Dialogs />
      <Shortcuts />
      <LyricsAutoOpen />
      {karaoke && <Karaoke />}
      {welcome && <Welcome />}
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
        <CollectionsProvider>
          <PlayerProvider>
            <Layout />
          </PlayerProvider>
        </CollectionsProvider>
      </LibraryProvider>
    </UIProvider>
  );
}
