// Arrastrar canciones (filas -> listas del menú lateral, o reordenar dentro de una lista).
export const DRAG_TYPE = "application/x-drmusic-songs";

export const hasSongs = (e) => [...(e.dataTransfer?.types ?? [])].includes(DRAG_TYPE);

export function readSongs(e) {
  try {
    const ids = JSON.parse(e.dataTransfer.getData(DRAG_TYPE));
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "number") : [];
  } catch {
    return [];
  }
}

/** Etiqueta que sigue al ratón al arrastrar ("3 canciones"). */
export function setDragImage(e, text) {
  const el = document.createElement("div");
  el.className = "drag-ghost";
  el.textContent = text;
  document.body.appendChild(el);
  e.dataTransfer.setDragImage(el, 16, 16);
  setTimeout(() => el.remove(), 0);
}
