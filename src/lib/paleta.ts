/**
 * Acento por campeón: colores extraídos por scripts/paleta.mjs
 * (src/data/paleta.json) o el override editorial de `acento` en el
 * frontmatter. Todo pasa por una normalización en OKLCH para que
 * cualquier matiz se lea bien como acento sobre el fondo casi negro
 * del sitio (#0a0a0c), sin importar lo oscuro o desaturado que haya
 * salido de la extracción.
 */
import paleta from '../data/paleta.json';

const acentos = (paleta as { acentos: Record<string, string> }).acentos;

// Rojo de marca: mismos valores que --red en global.css. Acento por defecto
// cuando un campeón no tiene color extraído ni override.
export const ROJO_MARCA = { hex: '#f5342b', rgb: '245, 52, 43' };

// Rango de luminosidad y croma en el que el acento se ve bien sobre --bg
const L_MIN = 0.62;
const L_MAX = 0.75;
const C_MIN = 0.14;
const C_MAX = 0.24;

// ── sRGB ↔ lineal ──
const srgbALineal = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linealASrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

// ── sRGB → OKLCH (vía OKLab; matrices de Björn Ottosson) ──
function hexAOklch(hex: string) {
  const r = srgbALineal(parseInt(hex.slice(1, 3), 16) / 255);
  const g = srgbALineal(parseInt(hex.slice(3, 5), 16) / 255);
  const b = srgbALineal(parseInt(hex.slice(5, 7), 16) / 255);

  const lms = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(lms);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bLab = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const c = Math.sqrt(a * a + bLab * bLab);
  let h = (Math.atan2(bLab, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

// ── OKLCH → RGB lineal (sin recortar todavía a [0,1]) ──
function oklchARgbLineal(l: number, c: number, h: number): [number, number, number] {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const bLab = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * bLab;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * bLab;
  const s_ = l - 0.0894841775 * a - 1.291485548 * bLab;

  const lms = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return [
    4.0767416621 * lms - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * lms + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * lms - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const dentroDeGama = (rgb: [number, number, number]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

// ── OKLCH → hex/rgb sRGB, reduciendo el croma hasta entrar en gama ──
function oklchASrgb(l: number, c: number, h: number): { hex: string; rgb: string } {
  let croma = c;
  let lineal = oklchARgbLineal(l, croma, h);
  for (let i = 0; i < 20 && !dentroDeGama(lineal); i++) {
    croma *= 0.92;
    lineal = oklchARgbLineal(l, croma, h);
  }

  const canal = (v: number) => Math.round(Math.min(1, Math.max(0, linealASrgb(Math.min(1, Math.max(0, v))))) * 255);
  const [r, g, b] = lineal.map(canal);

  return {
    hex: `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`,
    rgb: `${r}, ${g}, ${b}`,
  };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// ── Normaliza cualquier color (extraído u override) al rango legible ──
function normalizar(hex: string): { hex: string; rgb: string } {
  const { l, c, h } = hexAOklch(hex);
  return oklchASrgb(clamp(l, L_MIN, L_MAX), clamp(c, C_MIN, C_MAX), h);
}

/**
 * Resuelve el acento de un campeón: el override del frontmatter manda si
 * existe, si no se usa el color extraído en la paleta. Devuelve null si no
 * hay ningún color conocido, para que quien llame recaiga en el rojo de marca.
 */
export function acentoDe(campeon: string, override?: string): { hex: string; rgb: string } | null {
  const crudo = override ?? acentos[campeon];
  if (!crudo) return null;
  return normalizar(crudo);
}
