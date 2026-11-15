import React from "react";
import { CheckCircle, Download, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { audioUrl, artistLabel } from "../api";

function SongCard({
  song,
  isActive,
  isPlaying,
  thumbnail,
  onClick,
  onMouseEnter,
  onDelete,
}) {
  const handleDownload = async (e) => {
    e.stopPropagation();

    try {
      const src = audioUrl(song);
      if (!src) throw new Error("sin archivo");
      const response = await fetch(src);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = song.filename || `${song.title}.mp3`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);

      toast.success(`📥 Descargando: ${song.title}`, {
        duration: 2000,
        style: {
          background: "#0ea5e9",
          color: "#fff",
        },
      });
    } catch (error) {
      toast.error("❌ Error al descargar");
    }
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (onDelete) onDelete(song.id);
  };

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`song-card ${isActive && isPlaying ? "active" : ""}`}
      style={{
        backgroundColor: isActive && isPlaying ? "#0ea5e920" : "#181818",
        padding: "16px",
        borderRadius: "8px",
        transition: "all 0.2s ease",
        cursor: "pointer",
        border: isActive && isPlaying ? "1px solid #0ea5e9" : "1px solid #282828",
        position: "relative",
      }}
    >
      <div style={{ position: "relative", marginBottom: "16px" }}>
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={song.title}
            style={{
              width: "100%",
              height: "180px",
              objectFit: "cover",
              borderRadius: "6px",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "180px",
              background: "linear-gradient(135deg, #0ea5e920, #0a0a0a)",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "56px",
            }}
          >
            🎵
          </div>
        )}

        {/* BOTONES SOLO SI EXISTE onDelete (LIBRARY MODE) */}
        {onDelete && (
          <div
            style={{
              position: "absolute",
              top: "8px",
              right: "8px",
              display: "flex",
              gap: "6px",
              zIndex: 10,
            }}
          >
            <button
              onClick={handleDelete}
              style={{
                backgroundColor: "#ef4444",
                border: "none",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "white",
              }}
              title="Eliminar canción"
            >
              <Trash2 size={16} />
            </button>

            <button
              onClick={handleDownload}
              style={{
                backgroundColor: "#0ea5e9",
                border: "none",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
              title="Descargar canción"
            >
              <Download size={16} color="white" />
            </button>
          </div>
        )}

        {/* INDICADOR PLAYING */}
        {isActive && isPlaying && (
          <div
            style={{
              position: "absolute",
              bottom: "8px",
              left: "8px",
              backgroundColor: "#0ea5e9",
              borderRadius: "50%",
              padding: "6px",
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                backgroundColor: "white",
                borderRadius: "50%",
              }}
            />
          </div>
        )}
      </div>

      <strong style={{ fontSize: "14px" }}>
        {song.title.length > 35
          ? song.title.substring(0, 32) + "..."
          : song.title}
      </strong>

      <p style={{ color: "#b3b3b3", fontSize: "12px", margin: 0 }}>
        {artistLabel(song)}
        {song.status === "missing" && " · ⚠️ falta archivo"}
      </p>

      {isActive && (
        <CheckCircle
          size={14}
          style={{
            position: "absolute",
            bottom: "12px",
            right: "12px",
            color: "#0ea5e9",
          }}
        />
      )}
    </div>
  );
}

export default SongCard;