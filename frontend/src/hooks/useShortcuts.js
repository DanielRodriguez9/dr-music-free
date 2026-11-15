import { useEffect } from "react";
import { usePlayer, usePlayerTime, useUI } from "../context/hooks";

const isTyping = (el) =>
  el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) && el.type !== "range";

export const SHORTCUTS = [
  ["Espacio", "Reproducir / pausar"],
  ["← / →", "Retroceder / avanzar 5 s"],
  ["Ctrl + ← / →", "Canción anterior / siguiente"],
  ["↑ / ↓", "Subir / bajar volumen"],
  ["M", "Silenciar"],
  ["S", "Aleatorio"],
  ["R", "Repetir (todas / una / no)"],
  ["L", "Me gusta en la canción actual"],
  ["Q", "Mostrar / ocultar la cola"],
  ["Ctrl + F", "Buscar"],
  ["?", "Ver atajos"],
  ["Esc", "Cerrar menús y diálogos"],
];

/** Atajos de teclado globales. */
export default function useShortcuts({ onToggleLike }) {
  const player = usePlayer();
  const { seekBy } = usePlayerTime();
  const ui = useUI();

  useEffect(() => {
    const onKey = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key.toLowerCase() === "f") {
        e.preventDefault();
        ui.navigate("search");
        // espera a que se pinte la vista de búsqueda
        requestAnimationFrame(ui.focusSearch);
        return;
      }
      if (e.key === "Escape") {
        if (ui.menu) ui.closeMenu();
        else if (ui.dialog) ui.closeDialog(false);
        else if (isTyping(document.activeElement)) document.activeElement.blur();
        return;
      }
      if (ui.dialog || isTyping(e.target) || e.altKey) return;

      const actions = {
        " ": () => player.togglePlay(),
        ArrowLeft: () => (ctrl ? player.prev() : seekBy(-5)),
        ArrowRight: () => (ctrl ? player.next() : seekBy(5)),
        ArrowUp: () => player.changeVolume(0.05),
        ArrowDown: () => player.changeVolume(-0.05),
      };
      const letters = {
        m: player.toggleMute,
        s: player.toggleShuffle,
        r: player.cycleRepeat,
        q: ui.toggleQueue,
        l: () => player.current && onToggleLike(player.current),
        "?": () => ui.openDialog({ type: "shortcuts" }),
      };
      const fn = actions[e.key] ?? (!ctrl ? letters[e.key.toLowerCase()] ?? letters[e.key] : null);
      if (!fn) return;
      // la barra espaciadora sobre un botón no debe "pulsarlo" además de pausar
      e.preventDefault();
      fn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player, seekBy, ui, onToggleLike]);
}
