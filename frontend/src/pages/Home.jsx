import React from "react";
import { Download, Library, Play, ArrowRight } from "lucide-react";
import SongCard from "../components/SongCard";

function Home({
  songs,
  currentSong,
  isPlaying,
  thumbnails,
  onPlaySong,
  onLoadThumbnail,
  onViewAll,
}) {
  const recentSongs = [...songs].reverse().slice(0, 10);

  return (
    <>
      <div style={{ textAlign: "center", marginBottom: "48px" }}>
        <h1
          style={{
            fontSize: "48px",
            marginBottom: "16px",
            background: "linear-gradient(135deg, #fff, #0ea5e9)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        ></h1>
        <p style={{ color: "#b3b3b3", fontSize: "18px" }}>
          Descarga y reproduce música gratis, sin virus y sin anuncios
        </p>

        <p style={{ fontSize: "10px", color: "#666", textAlign: "center" }}>
          DR Music Free es una herramienta para gestionar tu música local. El
          usuario es responsable del uso que le dé a esta herramienta. No
          descargues material con derechos de autor sin permiso.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: "24px",
          marginBottom: "48px",
        }}
      >
        <div
          style={{
            backgroundColor: "#181818",
            padding: "32px 24px",
            borderRadius: "12px",
            textAlign: "center",
          }}
        >
          <Download size={32} color="#0ea5e9" />
          <h3 style={{ margin: "16px 0 8px" }}>Descarga música</h3>
          <p style={{ color: "#b3b3b3", fontSize: "14px" }}>
            Pega cualquier URL de YouTube y conviértela a MP3
          </p>
        </div>
        <div
          style={{
            backgroundColor: "#181818",
            padding: "32px 24px",
            borderRadius: "12px",
            textAlign: "center",
          }}
        >
          <Library size={32} color="#0ea5e9" />
          <h3 style={{ margin: "16px 0 8px" }}>Tu biblioteca</h3>
          <p style={{ color: "#b3b3b3", fontSize: "14px" }}>
            Todas tus canciones organizadas en un solo lugar
          </p>
        </div>
        <div
          style={{
            backgroundColor: "#181818",
            padding: "32px 24px",
            borderRadius: "12px",
            textAlign: "center",
          }}
        >
          <Play size={32} color="#0ea5e9" />
          <h3 style={{ margin: "16px 0 8px" }}>Reproducción local</h3>
          <p style={{ color: "#b3b3b3", fontSize: "14px" }}>
            Escucha tu música sin conexión a internet
          </p>
        </div>
      </div>

      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <h2 style={{ fontSize: "24px" }}>Recientemente agregadas</h2>
          {songs.length > 6 && ( // ← Aquí está la condición
            <button
              onClick={onViewAll}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "none",
                border: "none",
                color: "#0ea5e9",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "500",
                padding: "8px 16px",
                borderRadius: "20px",
                transition: "0.2s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "#0ea5e920")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              Ver todas las canciones ({songs.length} canciones)
              <ArrowRight size={16} />
            </button>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "24px",
          }}
        >
          {recentSongs.length === 0 ? (
            <div
              style={{
                gridColumn: "1 / -1",
                textAlign: "center",
                padding: "60px",
                backgroundColor: "#181818",
                borderRadius: "12px",
              }}
            >
              <p style={{ color: "#b3b3b3" }}>
                No hay canciones aún. ¡Descarga tu primera canción!
              </p>
            </div>
          ) : (
            recentSongs.map((song) => (
              <SongCard
                key={song.id}
                song={song}
                isActive={currentSong?.id === song.id}
                isPlaying={isPlaying}
                thumbnail={thumbnails[song.id]}
                onClick={() => onPlaySong(song)}
                onMouseEnter={() => onLoadThumbnail(song.id)}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

export default Home;
