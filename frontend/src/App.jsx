import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
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

  // Estados del reproductor
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(70);
  const [thumbnails, setThumbnails] = useState({});

  const audioRef = useRef(null);

  // Cargar canciones desde el backend
  const loadSongs = async () => {
    try {
      const response = await axios.get("http://127.0.0.1:8000/songs/");
      setSongs(response.data);
      console.log("Canciones cargadas:", response.data);
    } catch (error) {
      console.error("Error al cargar canciones:", error);
      toast.error("Error al cargar tu biblioteca");
    }
  };

  // Cargar thumbnail de una canción
  const loadThumbnail = async (songId) => {
    if (thumbnails[songId]) return;
    try {
      const response = await axios.get(`http://127.0.0.1:8000/thumb/${songId}`);
      if (response.data.thumbnail_url) {
        setThumbnails((prev) => ({
          ...prev,
          [songId]: response.data.thumbnail_url,
        }));
        console.log(`Thumbnail cargada para canción ${songId}`);
      }
    } catch (error) {
      console.error("Error al cargar thumbnail:", error);
    }
  };

  useEffect(() => {
    loadSongs();
  }, []);

  // Control del reproductor
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
      setCurrentSong(song);
      const audioUrl = `http://127.0.0.1:8000${song.public_url}`;
      console.log("Reproduciendo:", audioUrl);

      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.load();
        audioRef.current
          .play()
          .catch((e) => console.error("Error al reproducir:", e));
        setIsPlaying(true);
      }
    }
  };

  // Eventos del audio
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      // Pasar a la siguiente canción automáticamente
      const currentIndex = songs.findIndex((s) => s.id === currentSong?.id);
      if (currentIndex !== -1 && currentIndex + 1 < songs.length) {
        playSong(songs[currentIndex + 1]);
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
  }, [currentSong, songs]);

  // Control de volumen
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  // Formatear tiempo
  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleViewAll = () => {
    setActiveTab("library"); // Cambia a la pestaña de biblioteca
  };

  const handleProgressChange = (e) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const nextSong = () => {
    const currentIndex = songs.findIndex((s) => s.id === currentSong?.id);
    if (currentIndex !== -1 && currentIndex + 1 < songs.length) {
      playSong(songs[currentIndex + 1]);
    }
  };

  const prevSong = () => {
    const currentIndex = songs.findIndex((s) => s.id === currentSong?.id);
    if (currentIndex > 0) {
      playSong(songs[currentIndex - 1]);
    }
  };

  const handleDownload = async () => {
    if (!url.trim()) {
      toast.error(" Por favor ingresa una URL de YouTube");
      return;
    }

    if (!url.includes("youtube.com/watch") && !url.includes("youtu.be/")) {
      toast.error("🔗 Por favor ingresa una URL válida de YouTube");
      return;
    }

    const loadingToast = toast.loading("⏳ Descargando canción...");

    try {
      setLoading(true);
      setDownloadProgress(0);

      const progressInterval = setInterval(() => {
        setDownloadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 500);

      const apiUrl = `http://127.0.0.1:8000/download/?url=${encodeURIComponent(url)}`;
      const response = await axios.post(apiUrl);

      clearInterval(progressInterval);
      setDownloadProgress(100);

      toast.success(`✅ ${response.data.song}`, {
        duration: 4000,
        icon: "🎵",
        style: { background: "#0ea5e9", color: "#fff", fontWeight: "bold" },
      });

      setUrl("");
      await loadSongs();
      setTimeout(() => setDownloadProgress(0), 1000);
    } catch (error) {
      console.error("Error detallado:", error);
      toast.error(`❌ Error: ${error.response?.data?.detail || error.message}`);
      setDownloadProgress(0);
    } finally {
      setLoading(false);
      toast.dismiss(loadingToast);
    }
  };

  // Renderizar contenido según tab activa
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
            onViewAll={handleViewAll} // ← Agrega esta línea
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

      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

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

      <Player
        currentSong={currentSong}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        onPlayPause={() => playSong(currentSong)}
        onPrev={prevSong}
        onNext={nextSong}
        onProgressChange={handleProgressChange}
        onVolumeChange={(e) => setVolume(e.target.value)}
        formatTime={formatTime}
      />
    </div>
  );
}

export default App;
