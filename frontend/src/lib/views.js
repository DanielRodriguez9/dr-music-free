export const VIEWS = ["home", "search", "library", "liked", "history", "settings"];

// vistas con parámetro: "playlist:12", "genre:Salsa"
export const isView = (v) =>
  typeof v === "string" && (VIEWS.includes(v) || /^playlist:\d+$/.test(v) || /^genre:.+/.test(v));

/** "playlist:12" -> { name: "playlist", param: "12" } */
export function parseView(view) {
  const i = view.indexOf(":");
  return i < 0 ? { name: view, param: null } : { name: view.slice(0, i), param: view.slice(i + 1) };
}
