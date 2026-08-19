/**
 * Ingesta automática de los vídeos nuevos de la playlist de la serie.
 *
 * Uso:  node scripts/videos.mjs
 *
 * Lee el feed RSS público de la playlist de YouTube (sin API key: solo trae
 * los ~15 vídeos más recientes, que sobra de margen si el job corre cada
 * pocas horas), detecta los que todavía no están referenciados en ningún
 * episodio y los añade al `videos:` del episodio ACTIVO (el de `orden:` más
 * alto en src/content/episodios/*.md).
 *
 * Como aviso de posible cambio de arco, compara el título de cada vídeo
 * nuevo contra la lista completa de campeones (Data Dragon, sin key): si
 * menciona un campeón distinto al del episodio activo, marca la tanda como
 * MISMATCH para que el workflow abra una PR en vez de commitear directo.
 */
import { readFile, readdir, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const DIR_EPISODIOS = path.join(RAIZ, 'src/content/episodios');
const ARCHIVO_SERIE = path.join(RAIZ, 'src/data/serie.ts');

// ── 1. Id de la playlist desde src/data/serie.ts ──
const serieSrc = await readFile(ARCHIVO_SERIE, 'utf8');
const valorPlaylist = serieSrc.match(/playlist:\s*(?:'([^']*)'|null)/)?.[1];
if (!valorPlaylist) {
  console.error('Error: `playlist` no está definida (o es null) en src/data/serie.ts.');
  process.exit(1);
}
const idPlaylist = valorPlaylist.match(/list=([\w-]+)/)?.[1];
if (!idPlaylist) {
  console.error(`Error: no se pudo extraer el id de playlist de la URL: ${valorPlaylist}`);
  process.exit(1);
}

// ── 2. Feed RSS de la playlist (últimos ~15 vídeos, sin key) ──
function decodeEntidades(texto) {
  return texto
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function parseaFeed(xml) {
  const entradas = [];
  for (const bloque of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const cuerpo = bloque[1];
    const videoId = cuerpo.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const tituloCrudo = cuerpo.match(/<title>([^<]*)<\/title>/)?.[1];
    const publicado = cuerpo.match(/<published>([^<]+)<\/published>/)?.[1];
    if (!videoId || !tituloCrudo || !publicado) continue;
    entradas.push({ videoId, titulo: decodeEntidades(tituloCrudo), publicado });
  }
  return entradas;
}

const resFeed = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${idPlaylist}`);
if (!resFeed.ok) throw new Error(`No se pudo descargar el feed de la playlist (HTTP ${resFeed.status}).`);
const entradas = parseaFeed(await resFeed.text());

// ── 3. Episodios: campeón, orden e ids ya referenciados ──
function extraeIdsReferenciados(crudo) {
  const ids = [];
  for (const linea of crudo.matchAll(/^[ \t]*url:\s*(\S+)/gm)) {
    const valor = linea[1];
    const id = valor.match(/[?&]v=([\w-]+)/)?.[1] ?? valor.match(/youtu\.be\/([\w-]+)/)?.[1];
    if (id) ids.push(id);
  }
  return ids;
}

async function leerEpisodios() {
  const archivos = (await readdir(DIR_EPISODIOS)).filter((f) => f.endsWith('.md')).sort();
  const episodios = [];
  for (const archivo of archivos) {
    const ruta = path.join(DIR_EPISODIOS, archivo);
    const crudo = await readFile(ruta, 'utf8');
    const orden = Number(crudo.match(/^orden:\s*(\d+)/m)?.[1] ?? NaN);
    const campeon = crudo.match(/^campeon:\s*(\S+)/m)?.[1] ?? null;
    const nombreCampeon =
      crudo
        .match(/^nombreCampeon:\s*(.+)$/m)?.[1]
        ?.trim()
        .replace(/^['"]|['"]$/g, '') ?? campeon;
    episodios.push({
      archivo,
      ruta,
      crudo,
      orden,
      campeon,
      nombreCampeon,
      idsReferenciados: extraeIdsReferenciados(crudo),
    });
  }
  return episodios;
}

const episodios = await leerEpisodios();
if (episodios.length === 0) {
  console.error('Error: no se encontraron episodios en src/content/episodios.');
  process.exit(1);
}

const conOrden = episodios.filter((e) => !Number.isNaN(e.orden));
if (conOrden.length === 0) {
  console.error('Error: ningún episodio tiene `orden:` en su frontmatter; no se puede saber cuál es el activo.');
  process.exit(1);
}
const activo = conOrden.reduce((a, b) => (b.orden > a.orden ? b : a));

const referenciados = new Set(episodios.flatMap((e) => e.idsReferenciados));

// ── 4. Vídeos nuevos = en el feed pero sin referenciar en ningún episodio ──
const nuevos = entradas
  .filter((e) => !referenciados.has(e.videoId))
  .sort((a, b) => a.publicado.localeCompare(b.publicado));

async function escribeSalidaGithub(texto) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, texto);
}

if (nuevos.length === 0) {
  console.log('Sin vídeos nuevos.');
  await escribeSalidaGithub('nuevos=0\nmismatch=false\n');
  process.exit(0);
}

// ── 5. Aviso de posible cambio de arco: ¿algún título menciona otro campeón? ──
async function ddragon(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ddragon ${res.status} en ${url}`);
  return res.json();
}

const versiones = await ddragon('https://ddragon.leagueoflegends.com/api/versions.json');
const ultimaVersion = versiones[0];
const campeonesData = await ddragon(
  `https://ddragon.leagueoflegends.com/cdn/${ultimaVersion}/data/es_ES/champion.json`,
);
const campeones = Object.values(campeonesData.data).map((c) => ({ id: c.id, nombre: c.name }));

// Normaliza a minúsculas sin acentos y colapsa toda la puntuación a espacios,
// para poder comparar por palabra completa sin líos de mayúsculas/tildes/apóstrofos.
function limpia(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tituloIncluyePalabras(titulo, nombreOId) {
  const t = ` ${limpia(titulo)} `;
  const n = ` ${limpia(nombreOId)} `;
  return t.includes(n);
}

function buscaCampeonEnTitulo(titulo) {
  for (const c of campeones) {
    if (tituloIncluyePalabras(titulo, c.nombre) || tituloIncluyePalabras(titulo, c.id)) return c.nombre;
  }
  return null;
}

const nombresActivo = [activo.nombreCampeon, activo.campeon].filter(Boolean).map(limpia);
let mismatch = false;
const detalles = nuevos.map((v) => {
  const mencionado = buscaCampeonEnTitulo(v.titulo);
  const esOtroCampeon = mencionado !== null && !nombresActivo.includes(limpia(mencionado));
  if (esOtroCampeon) mismatch = true;
  return { ...v, mencionado };
});

// ── 6. Añadir los vídeos nuevos al `videos:` del episodio activo ──
function fechaMadrid(iso) {
  const partes = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const obj = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  return `${obj.year}-${obj.month}-${obj.day}`;
}

const escapaYaml = (texto) => texto.replace(/'/g, "''");

function lineasEntradaVideo(v) {
  return [
    `  - titulo: '${escapaYaml(v.titulo)}'`,
    `    url: https://www.youtube.com/watch?v=${v.videoId}`,
    `    fecha: ${fechaMadrid(v.publicado)}`,
  ];
}

// `videos:` es siempre la última clave del frontmatter, pero en vez de asumir
// que está pegada al `---` de cierre, se busca el final real de su bloque
// (líneas indentadas que cuelgan de `videos:`) y se inserta justo después.
function insertaVideos(crudo, nuevasLineas) {
  const lineas = crudo.split('\n');
  // Lista vacía inline (`videos: []`): se reemplaza por la forma en bloque.
  const idxVacio = lineas.findIndex((l) => /^videos:\s*\[\]\s*$/.test(l));
  if (idxVacio !== -1) {
    lineas.splice(idxVacio, 1, 'videos:', ...nuevasLineas);
    return lineas.join('\n');
  }
  const idxVideos = lineas.findIndex((l) => /^videos:\s*$/.test(l));
  if (idxVideos === -1) {
    const idxCierre = lineas.indexOf('---', 1);
    lineas.splice(idxCierre, 0, 'videos:', ...nuevasLineas);
    return lineas.join('\n');
  }
  let idxFin = idxVideos + 1;
  while (idxFin < lineas.length && /^[ \t]{2,}\S/.test(lineas[idxFin])) idxFin += 1;
  lineas.splice(idxFin, 0, ...nuevasLineas);
  return lineas.join('\n');
}

const nuevasLineas = detalles.flatMap(lineasEntradaVideo);
await writeFile(activo.ruta, insertaVideos(activo.crudo, nuevasLineas));

// ── 7. Resumen para consola y para el workflow ──
const formateaDetalle = (v) =>
  `${fechaMadrid(v.publicado)} · ${v.titulo} — campeón mencionado: ${v.mencionado ?? 'ninguno'}`;

console.log(`${nuevos.length} vídeo(s) nuevo(s) añadidos a ${activo.archivo}:`);
for (const v of detalles) {
  console.log(`  · ${formateaDetalle(v)}`);
}
if (mismatch) {
  console.log('\n⚠ Posible cambio de arco: algún vídeo nuevo menciona un campeón distinto al activo.');
}

const detalle = detalles.map(formateaDetalle).join('\n');
await escribeSalidaGithub(`nuevos=${nuevos.length}\nmismatch=${mismatch}\ndetalle<<EOF\n${detalle}\nEOF\n`);

process.exit(0);
