// Color de acento tomado de una imagen (fondo o carátula).

export const DEFAULT_ACCENT = { r: 34, g: 166, b: 242 }; // azul de la app

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

/**
 * Elige el color más representativo entre los píxeles con color (RGBA, como ImageData.data).
 * Agrupa por tono y se queda con el grupo más "pesado" (vivo y ni muy oscuro ni muy claro).
 * Devuelve null si la imagen es casi gris: entonces se deja el azul de la app.
 */
export function pickAccent(data) {
  const BINS = 24;
  const bins = Array.from({ length: BINS }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const { h, s, l } = rgbToHsl(r, g, b);
    const w = s * s * (1 - Math.abs(l - 0.5) * 2); // vivo y de luz media
    total += 1;
    if (w < 0.02) continue;
    const bin = bins[Math.floor(h / (360 / BINS)) % BINS];
    bin.w += w;
    bin.r += r * w;
    bin.g += g * w;
    bin.b += b * w;
  }
  const best = bins.reduce((a, c) => (c.w > a.w ? c : a));
  if (!total || best.w / total < 0.015) return null; // casi gris
  return { r: best.r / best.w, g: best.g / best.w, b: best.b / best.w };
}

/** Ajusta el color para que se lea sobre el tema oscuro (botones, barras, enlaces). */
export function usableAccent(rgb) {
  const { h, s } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  return hslToRgb(h, Math.min(0.85, Math.max(0.55, s)), 0.6);
}

/** Variables CSS del acento. */
export function accentVars(rgb) {
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const hover = hslToRgb(h, s, Math.min(0.75, l + 0.1));
  const ink = hslToRgb(h, 0.8, 0.08); // texto sobre el botón de acento
  const css = (c) => `rgb(${c.r}, ${c.g}, ${c.b})`;
  return {
    "--accent": css(rgb),
    "--accent-hover": css(hover),
    "--accent-ink": css(ink),
    "--accent-rgb": `${rgb.r}, ${rgb.g}, ${rgb.b}`,
    "--accent-soft": `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`,
  };
}
