import {
  Download, ExternalLink, Heart, ListEnd, ListStart, Pause, Play, RotateCw, Trash2, User,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { isPlayable } from "../api";
import { usePlayer, useUI } from "../context/hooks";
import useSongActions from "../hooks/useSongActions";

/** Menú contextual de una canción (clic derecho o botón "···"). */
export default function ContextMenu() {
  const { menu, closeMenu, searchFor } = useUI();
  const player = usePlayer();
  const actions = useSongActions();
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  // Mantener el menú dentro de la ventana
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !menu) return;
    const { width, height } = el.getBoundingClientRect();
    const x = menu.alignRight ? menu.x - width : menu.x;
    const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
    const top = menu.y + height > window.innerHeight - 8 ? Math.max(8, menu.y - height) : menu.y;
    // medir antes de pintar evita que el menú "salte"
    setPos({ left, top });
  }, [menu]);

  if (!menu) return null;
  const { song, context } = menu;
  const playable = isPlayable(song);
  const isCurrent = player.current?.id === song.id;

  const item = (icon, label, onClick, { danger = false, disabled = false } = {}) => (
    <button
      type="button"
      role="menuitem"
      className={`menu__item ${danger ? "menu__item--danger" : ""}`}
      disabled={disabled}
      onClick={() => {
        closeMenu();
        onClick();
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div className="menu-layer" onMouseDown={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu(); }}>
      <div
        ref={ref}
        className="menu"
        role="menu"
        style={pos ? { left: pos.left, top: pos.top } : { left: menu.x, top: menu.y, visibility: "hidden" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="menu__title">{song.title}</p>
        {playable ? (
          <>
            {item(
              isCurrent && player.isPlaying ? <Pause size={16} /> : <Play size={16} />,
              isCurrent && player.isPlaying ? "Pausar" : "Reproducir",
              () => actions.playFrom(song, context?.list, context?.label),
            )}
            {item(<ListStart size={16} />, "Reproducir después", () => actions.addToQueue(song, true))}
            {item(<ListEnd size={16} />, "Añadir a la cola", () => actions.addToQueue(song))}
          </>
        ) : (
          song.youtube_url && item(<RotateCw size={16} />, "Volver a descargar", () => actions.redownload(song))
        )}
        <hr />
        {item(
          <Heart size={16} fill={song.liked ? "currentColor" : "none"} />,
          song.liked ? "Quitar de Tus me gusta" : "Añadir a Tus me gusta",
          () => actions.toggleLike(song),
        )}
        {song.artist && item(<User size={16} />, `Ver más de ${song.artist}`, () => searchFor(song.artist))}
        {song.youtube_url &&
          item(<ExternalLink size={16} />, "Abrir en YouTube", () => window.open(song.youtube_url, "_blank", "noopener"))}
        {playable && item(<Download size={16} />, "Guardar una copia...", () => actions.saveCopy(song))}
        <hr />
        {item(<Trash2 size={16} />, "Eliminar de la biblioteca", () => actions.remove(song), { danger: true })}
      </div>
    </div>
  );
}
