export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function formatTotal(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

const dateFmt = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" });

export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : dateFmt.format(d);
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 6) return "Buenas noches";
  if (h < 12) return "Buenos días";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

export const plural = (n, one, many) => `${n.toLocaleString("es")} ${n === 1 ? one : many}`;

/** Texto sin tildes y en minúsculas, para buscar. */
export const normalize = (text = "") =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

/** Ordena canciones por una columna; los vacíos siempre al final. */
export function sortSongs(songs, { key, dir }) {
  const sign = dir === "asc" ? 1 : -1;
  return [...songs].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    const ea = va == null || va === "";
    const eb = vb == null || vb === "";
    if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
    const cmp = typeof va === "string" && key !== "created_at" ? collator.compare(va, vb) : va < vb ? -1 : va > vb ? 1 : 0;
    return cmp * sign || a.id - b.id;
  });
}
