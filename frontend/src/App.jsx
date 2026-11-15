import React, { useState, useEffect, useRef } from "react";
import { api, audioUrl, waitForDownload } from "./api";
import toast, { Toaster } from "react-hot-toast";
import Sidebar from "./components/Sidebar";
import DownloadBar from "./components/DownloadBar";
import Player from "./components/Player";
import Home from "./pages/Home";
import Search from "./pages/Search";
import Library from "./pages/Library";
import "./index.css";

function App() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [songs, setSongs] = useState([]);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [activeTab, setActiveTab] = useState("home");

  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(70);
  const [thumbnails, setThumbnails] = useState({});
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);

  const audioRef = useRef(null);

  const loadSongs = async () => {
    try {
      const response = await api.get("/songs/");
      setSongs(response.data);
      setThumbnails(
        Object.fromEntries(
          response.data.filter((s) => s.thumbnail_url).map((s) => [s.id, s.thumbnail_url]),
        ),
      );
    } catch (error) {
      console.error(error);
      toast.error("Error al cargar tu biblioteca");
    }
  };

  // Las carátulas ya vienen con la lista de canciones
  const loadThumbnail = () => {};

  // Solo se puede reproducir lo que tiene archivo
  const playable = songs.filter((s) => s.public_url);

  useEffect(() => {
    loadSongs();
  }, []);

  const getNextSong = () => {
    if (playable.length === 0) return null;
    if (shuffle) {
      const otherSongs = playable.filter((s) => s.id !== currentSong?.id);
      if (otherSongs.length === 0) return null;
      return otherSongs[Math.floor(Math.random() * otherSongs.length)];
    } else {
      const currentIndex = playable.findIndex((s) => s.id === currentSong?.id);
      if (currentIndex !== -1 && currentIndex + 1 < playable.length) {
        return playable[currentIndex + 1];
      }
      return null;
    }
  };

  const playSong = (song) => {
    if (currentSong?.id === song.id && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    } else {
      const src = audioUrl(song);
      if (!src) {
        toast.error("Falta el archivo de esta canción. Vuelve a descargarla con su enlace.");
        return;
      }
      setCurrentSong(song);
      api.post(`/songs/${song.id}/play`).catch(() => {});
      if (audioRef.current) {
        audioRef.current.src = src;
        audioRef.current.load();
        audioRef.current.play().catch((e) => console.error(e));
        setIsPlaying(true);
      }
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => {
      if (repeat && currentSong) {
        audio.currentTime = 0;
        audio.play();
      } else {
        setIsPlaying(false);
        setCurrentTime(0);
        const next = getNextSong();
        if (next) playSong(next);
      }
    };

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [currentSong, songs, shuffle, repeat]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume]);

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleViewAll = () => setActiveTab("library");

  const handleProgressChange = (e) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) audioRef.current.currentTime = newTime;
  };

  const nextSong = () => {
    if (repeat && currentSong) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
    } else {
      const next = getNextSong();
      if (next) playSong(next);
    }
  };

  const prevSong = () => {
    if (shuffle) {
      nextSong();
    } else {
      const currentIndex = playable.findIndex((s) => s.id === currentSong?.id);
      if (currentIndex > 0) playSong(playable[currentIndex - 1]);
    }
  };

  const handleShuffleToggle = () => {
    setShuffle(!shuffle);
    toast.success(shuffle ? "🔀 Shuffle desactivado" : "🔀 Shuffle activado", {
      duration: 1500,
      style: { background: "#0ea5e9", color: "#fff" },
    });
  };

  const handleRepeatToggle = () => {
    setRepeat(!repeat);
    toast.success(repeat ? "🔁 Repetir desactivado" : "🔁 Repetir activado", {
      duration: 1500,
      style: { background: "#0ea5e9", color: "#fff" },
    });
  };

  const handleDownload = async () => {
    if (!url.trim()) {
      toast.error("❌ Por favor ingresa una URL de YouTube");
      return;
    }

    if (!url.includes("youtube.com/watch") && !url.includes("youtu.be/")) {
      toast.error("🔗 Por favor ingresa una URL válida de YouTube");
      return;
    }

    const loadingToast = toast.loading("⏳ Preparando descarga...");

    try {
      setLoading(true);
      setDownloadProgress(0);

      const { data } = await api.post("/downloads/", { url });

      if (data.status === "exists") {
        toast.error(`Ya está en tu biblioteca: ${data.song.title}`);
      } else {
        const job = await waitForDownload(data.job.id, (j) => {
          setDownloadProgress(Math.max(j.progress, 2));
          const msg = j.status === "processing" ? "🎛️ Convirtiendo a MP3..." : `⏳ Descargando... ${Math.round(j.progress)}%`;
          toast.loading(msg, { id: loadingToast });
        });
        if (job.status === "error") throw new Error(job.error);
        toast.success(`✅ ${job.title}`, {
          duration: 4000,
          icon: "🎵",
          style: { background: "#0ea5e9", color: "#fff", fontWeight: "bold" },
        });
        await loadSongs();
      }

      setUrl("");
      setTimeout(() => setDownloadProgress(0), 1000);
    } catch (error) {
      toast.error(`❌ Error: ${error.response?.data?.detail || error.message}`);
      setDownloadProgress(0);
    } finally {
      setLoading(false);
      toast.dismiss(loadingToast);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return (
          <Home
            songs={songs}
            currentSong={currentSong}
            isPlaying={isPlaying}
            thumbnails={thumbnails}
            onPlaySong={playSong}
            onLoadThumbnail={loadThumbnail}
            onViewAll={handleViewAll}
          />
        );
      case "search":
        return (
          <Search
            songs={songs}
            currentSong={currentSong}
            isPlaying={isPlaying}
            thumbnails={thumbnails}
            onPlaySong={playSong}
            onLoadThumbnail={loadThumbnail}
          />
        );
      case "library":
        return (
          <Library
            songs={songs}
            currentSong={currentSong}
            isPlaying={isPlaying}
            thumbnails={thumbnails}
            onPlaySong={playSong}
            onLoadThumbnail={loadThumbnail}
            onSongDeleted={loadSongs}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="app-container">
      <audio ref={audioRef} />
      <Toaster position="top-center" />

      {/* BOTÓN HAMBURGUESA */}
      <button
        className="menu-toggle"
        onClick={() => setMenuAbierto(!menuAbierto)}
      >
        ☰
      </button>

      {/* OVERLAY OSCURO */}
      <div
        className={`sidebar-overlay ${menuAbierto ? "active" : ""}`}
        onClick={() => setMenuAbierto(false)}
      />

      {/* SIDEBAR */}
      <div className={`sidebar-wrapper ${menuAbierto ? "open" : ""}`}>
        <Sidebar
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setActiveTab(tab);
            setMenuAbierto(false);
          }}
        />
      </div>

      {/* CONTENIDO PRINCIPAL + FOOTER */}
      <div className="main-area">
        <main className="main-content">
          <DownloadBar
            url={url}
            setUrl={setUrl}
            loading={loading}
            downloadProgress={downloadProgress}
            onDownload={handleDownload}
          />
          {renderContent()}
        </main>

        {/* PLAYER (ahora dentro del main-area) */}
        <Player
          currentSong={currentSong}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          shuffle={shuffle}
          repeat={repeat}
          onPlayPause={() => playSong(currentSong)}
          onPrev={prevSong}
          onNext={nextSong}
          onProgressChange={handleProgressChange}
          onVolumeChange={(e) => setVolume(e.target.value)}
          onShuffleToggle={handleShuffleToggle}
          onRepeatToggle={handleRepeatToggle}
          formatTime={formatTime}
        />
      </div>
    </div>
  );
}

export default App;
