/**
 * Extracción de un color de acento por campeón a partir del splash art.
 *
 * Uso:  pnpm paleta          (solo campeones sin color en la paleta)
 *       pnpm paleta --force  (recalcula todos)
 *
 * Por cada campeón sin entrada en src/data/paleta.json baja el splash de
 * Data Dragon, lo reduce con sharp y elige un color vibrante (no el
 * promedio): cada píxel se pondera por saturación² y se penaliza si es
 * casi negro o casi blanco, se agrupan los pesos en 24 bins de matiz y
 * gana el bin con más peso; el color final es el promedio ponderado de
 * los píxeles de ese bin. La normalización a OKLCH para que el acento
 * se lea bien sobre el fondo casi negro del sitio vive en src/lib/paleta.ts,
 * en tiempo de build — aquí solo se guarda el color crudo extraído.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const RAIZ = path.resolve(import.meta.dirname, '..');
const DIR_EPISODIOS = path.join(RAIZ, 'src/content/episodios');
const ARCHIVO_SALIDA = path.join(RAIZ, 'src/data/paleta.json');

const FORZAR = process.argv.includes('--force');
const ANCHO_MUESTREO = 96;
const BINS_DE_MATIZ = 24; // 360° / 24 = 15° por bin
const L_MIN = 0.15; // por debajo: casi negro, se descarta
const L_MAX = 0.85; // por encima: casi blanco, se descarta
const PENALIZACION_EXTREMOS = 0.05;

const splash = (id) => `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${id}_0.jpg`;

// ── Campeones: parseo mínimo del frontmatter que necesitamos ──
async function leerCampeones() {
  const archivos = (await readdir(DIR_EPISODIOS)).filter((f) => f.endsWith('.md'));
  const campeones = new Set();
  for (const archivo of archivos) {
    const crudo = await readFile(path.join(DIR_EPISODIOS, archivo), 'utf8');
    const campeon = crudo.match(/^campeon:\s*(\S+)/m)?.[1]?.replace(/^['"]|['"]$/g, '');
    if (campeon) campeones.add(campeon);
  }
  return [...campeones].sort();
}

// ── RGB [0,255] → HSL (h en [0,360), s y l en [0,1]) ──
function rgbAHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  return { h: h * 60, s, l };
}

const aHex = (n) => Math.round(n).toString(16).padStart(2, '0');

// ── Color vibrante: agrupa píxeles por matiz, pondera por saturación²,
// penaliza los extremos de luminosidad y gana el bin con más peso ──
async function colorVibrante(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ddragon ${res.status} en ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const { data, info } = await sharp(buffer)
    .resize({ width: ANCHO_MUESTREO })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const canales = info.channels;
  const bins = Array.from({ length: BINS_DE_MATIZ }, () => ({ peso: 0, r: 0, g: 0, b: 0 }));

  for (let i = 0; i < data.length; i += canales) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const { h, s, l } = rgbAHsl(r, g, b);

    let peso = s * s;
    if (l < L_MIN || l > L_MAX) peso *= PENALIZACION_EXTREMOS;
    if (peso <= 0) continue;

    const bin = Math.min(BINS_DE_MATIZ - 1, Math.floor(h / (360 / BINS_DE_MATIZ)));
    bins[bin].peso += peso;
    bins[bin].r += r * peso;
    bins[bin].g += g * peso;
    bins[bin].b += b * peso;
  }

  const ganador = bins.reduce((mejor, bin) => (bin.peso > mejor.peso ? bin : mejor), bins[0]);
  if (ganador.peso === 0) return null; // splash sin color dominante (raro)

  return `#${aHex(ganador.r / ganador.peso)}${aHex(ganador.g / ganador.peso)}${aHex(ganador.b / ganador.peso)}`;
}

// ── Extracción ──
const previa = await readFile(ARCHIVO_SALIDA, 'utf8')
  .then(JSON.parse)
  .catch(() => ({ acentos: {} }));
const acentos = FORZAR ? {} : { ...previa.acentos };

const campeones = await leerCampeones();
console.log(`${campeones.length} campeones en el arco\n`);

for (const campeon of campeones) {
  if (acentos[campeon] && !FORZAR) {
    console.log(`· ${campeon}: ya en paleta (${acentos[campeon]})`);
    continue;
  }
  try {
    const hex = await colorVibrante(splash(campeon));
    if (!hex) {
      console.warn(`⚠ ${campeon}: sin color dominante, se omite`);
      continue;
    }
    acentos[campeon] = hex;
    console.log(`✓ ${campeon}: ${hex}`);
  } catch (error) {
    // Un fallo puntual (red, 404, etc.) no debe tirar los colores ya calculados
    console.warn(`⚠ ${campeon}: ${error.message}, se omite`);
  }
}

const salida = {
  actualizado: new Date().toISOString(),
  acentos: Object.fromEntries(Object.keys(acentos).sort().map((k) => [k, acentos[k]])),
};

await writeFile(ARCHIVO_SALIDA, `${JSON.stringify(salida, null, 2)}\n`);
console.log(`\nPaleta guardada en ${path.relative(RAIZ, ARCHIVO_SALIDA)}`);
