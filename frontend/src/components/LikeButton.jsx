import { Heart } from "lucide-react";

export default function LikeButton({ song, onToggle, size = 16, className = "" }) {
  const liked = Boolean(song?.liked);
  return (
    <button
      type="button"
      className={`icon-btn like-btn ${liked ? "is-liked" : ""} ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(song);
      }}
      aria-pressed={liked}
      aria-label={liked ? "Quitar de Tus me gusta" : "Añadir a Tus me gusta"}
      title={liked ? "Quitar de Tus me gusta" : "Añadir a Tus me gusta"}
    >
      <Heart size={size} fill={liked ? "currentColor" : "none"} />
    </button>
  );
}
