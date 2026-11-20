import { useEffect, useState } from "react";
import { API_BASE } from "../api";
import { usePlayer, useUI } from "../context/hooks";
import { accentVars, pickAccent, usableAccent } from "../lib/color";

// El difuminado se calcula UNA vez en un canvas pequeño y se guarda como imagen:
// en pantalla no hay ningún filtro activo, así que desplazarse o animar no cuesta nada extra.
const WIDTH = 480;
const MAX_CACHE = 24;
const cache = new Map(); // `${url}|${blur}` -> Promise<{ src, accent }>

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // para leer los colores (el servidor y YouTube lo permiten)
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("imagen no disponible"));
    img.src = url;
  });
}

function readAccent(img) {
  try {
    const c = document.createElement("canvas");
    c.width = 48;
    c.height = 48;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 48, 48);
    const rgb = pickAccent(ctx.getImageData(0, 0, 48, 48).data);
    return rgb ? usableAccent(rgb) : null;
  } catch {
    return null; // imagen de otro origen sin permiso: se deja el acento de siempre
  }
}

async function render(url, blur) {
  const img = await loadImage(url);
  const accent = readAccent(img);
  if (blur <= 0) return { src: url, accent };
  const w = WIDTH;
  const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
  // el radio se escala al tamaño de la ventana, porque la imagen se estira para cubrirla
  const r = (blur * w) / Math.max(window.innerWidth, 800);
  const pad = Math.ceil(r * 2); // se dibuja más grande para que los bordes no queden transparentes
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.filter = `blur(${r}px)`;
  ctx.drawImage(img, -pad, -pad, w + pad * 2, h + pad * 2);
  const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.9));
  return { src: blob ? URL.createObjectURL(blob) : url, accent };
}

function prepare(url, blur) {
  const key = `${url}|${blur}`;
  if (cache.has(key)) {
    // se usa: pasa al final, para que la que se ve nunca sea la primera en salir de la caché
    const hit = cache.get(key);
    cache.delete(key);
    cache.set(key, hit);
  } else {
    const p = render(url, blur);
    p.catch(() => cache.delete(key)); // falló: se reintenta la próxima vez
    cache.set(key, p);
    if (cache.size > MAX_CACHE) {
      const [oldKey, old] = cache.entries().next().value;
      cache.delete(oldKey);
      old.then((r) => r.src.startsWith("blob:") && URL.revokeObjectURL(r.src)).catch(() => {});
    }
  }
  return cache.get(key);
}

/** Imagen para el modo "carátula": la guardada en disco o la miniatura de YouTube. */
function coverSource(song) {
  if (!song) return null;
  if (typeof song.id === "number") return `${API_BASE}/cover/${song.id}`;
  return song.youtube_id ? `https://i.ytimg.com/vi/${song.youtube_id}/mqdefault.jpg` : null;
}

/** Fondo personalizado detrás de toda la app (oscurecido y difuminado). */
export default function Backdrop() {
  const { prefs, bgImage } = useUI();
  const { current } = usePlayer();
  const custom = bgImage ? `${API_BASE}${bgImage.url}` : null;
  // con la carátula y sin canción sonando, se usa la imagen propia (si hay)
  const url = prefs.bgMode === "image" ? custom : prefs.bgMode === "cover" ? coverSource(current) || custom : null;
  const [layers, setLayers] = useState([]); // la anterior se queda debajo mientras aparece la nueva
  const [accent, setAccent] = useState(null);
  const [failed, setFailed] = useState(null);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    prepare(url, prefs.bgBlur).then(
      (r) => {
        if (!alive) return;
        setLayers((l) => [...l.slice(-1), { id: `${url}|${prefs.bgBlur}`, src: r.src }]);
        setAccent(r.accent);
        setFailed(null);
      },
      () => alive && setFailed(url), // sin carátula: fondo liso
    );
    return () => {
      alive = false;
    };
  }, [url, prefs.bgBlur]);

  const active = Boolean(url) && failed !== url && layers.length > 0;
  const useAccent = active && prefs.bgAccent && accent;

  useEffect(() => {
    document.body.classList.toggle("has-backdrop", active);
    return () => document.body.classList.remove("has-backdrop");
  }, [active]);

  useEffect(() => {
    if (!useAccent) return;
    const root = document.documentElement.style;
    const vars = accentVars(accent);
    for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
    return () => Object.keys(vars).forEach((k) => root.removeProperty(k));
  }, [useAccent, accent]);

  if (!active) return null;
  // intensidad 0 -> casi no se ve; 100 -> se ve bastante (siempre queda oscuro para leer bien)
  const shade = 0.92 - (prefs.bgIntensity / 100) * 0.6;
  return (
    <div className="backdrop" aria-hidden="true">
      {layers.map((l) => (
        <div key={l.id} className="backdrop__img" style={{ backgroundImage: `url("${l.src}")` }} />
      ))}
      <div className="backdrop__shade" style={{ opacity: shade }} />
    </div>
  );
}
