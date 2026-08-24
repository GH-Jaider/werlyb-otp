/**
 * Backfill de partidas de la serie desde la API oficial de Riot (Match-V5).
 *
 * Uso:  RIOT_API_KEY=RGAPI-... node scripts/partidas.mjs
 *
 * Baja de una sola vez todas las partidas de las cuentas de
 * src/data/cuentas.json desde el inicio de la serie hasta hoy, asigna cada
 * una a su episodio (src/content/episodios/*.md) por el campeón jugado y
 * guarda un JSON en src/data/partidas/<episodio>.json con las URLs de iconos
 * ya resueltas (Data Dragon), para que la web siga siendo 100 % estática.
 *
 * La key NUNCA se guarda en el repo: solo viaja por variable de entorno.
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const API_KEY = process.env.RIOT_API_KEY;
if (!API_KEY) {
  console.error('Falta RIOT_API_KEY. Uso: RIOT_API_KEY=RGAPI-... node scripts/partidas.mjs');
  process.exit(1);
}

const RAIZ = path.resolve(import.meta.dirname, '..');
const DIR_EPISODIOS = path.join(RAIZ, 'src/content/episodios');
const DIR_SALIDA = path.join(RAIZ, 'src/data/partidas');
const ARCHIVO_CACHE = path.join(RAIZ, 'src/data/partidas-cache.json');

// Sube este número al cambiar la forma de lo que se guarda por partida: la
// caché se invalida sola y se vuelve a bajar todo una vez, sin datos a medias.
const FORMATO_CACHE = 1;

// `node scripts/partidas.mjs --completo` ignora la caché y rebaja la serie
// entera (para depurar o tras un cambio raro en la API).
const COMPLETO = process.argv.includes('--completo');
const CUENTAS = JSON.parse(await readFile(path.join(RAIZ, 'src/data/cuentas.json'), 'utf8'));

// La descarga se hace de una sola pasada por todo el rango de la serie (los
// arcos se solapan e intercalan: Riven siguió mientras arrancaba Nami, y Nami
// volvió tras un parón), y luego cada partida se asigna a su episodio por el
// campeón jugado. Pero el campeón NO basta: Werlyb también juega esos campeones
// fuera del reto (Gwen, Jayce, Hecarim…), así que además se exige que la
// partida caiga en la ventana del arco — desde una semana antes del primer
// vídeo hasta cuatro días después del último, porque las sesiones se juegan
// antes de publicarse y a veces se alargan. `partidasDesde:`/`partidasHasta:`
// en el frontmatter sustituyen esa ventana cuando hace falta afinar a mano.
const MARGEN_ANTES_DIAS = 7;
const MARGEN_DESPUES_DIAS = 4;

// Match-V5 arrastra peculiaridades de nombre respecto a Data Dragon
const CAMPEON_RARO = { FiddleSticks: 'Fiddlesticks' };
const normalizaCampeon = (nombre) => CAMPEON_RARO[nombre] ?? nombre;

const COLAS = {
  420: 'SoloQ',
  440: 'Flex',
  400: 'Normal',
  430: 'Normal',
  450: 'ARAM',
  480: 'Swiftplay',
  490: 'Quickplay',
  700: 'Clash',
  900: 'URF',
  1700: 'Arena',
  1710: 'Arena',
};

// ── Rate limiter: la key personal permite 100 peticiones / 2 min ──
let ultimaPeticion = 0;
const INTERVALO_MS = 1350; // ~89 peticiones / 2 min, con colchón

async function riot(url, intento = 0) {
  const espera = ultimaPeticion + INTERVALO_MS - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimaPeticion = Date.now();

  const res = await fetch(url, { headers: { 'X-Riot-Token': API_KEY } });
  if (res.status === 429 && intento < 5) {
    const retry = Number(res.headers.get('retry-after') ?? 10);
    console.log(`  · 429, esperando ${retry}s…`);
    await new Promise((r) => setTimeout(r, (retry + 1) * 1000));
    return riot(url, intento + 1);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Riot ${res.status} en ${url}`);
  return res.json();
}

// ── Data Dragon: mapas de iconos (una sola vez, sin key) ──
async function ddragon(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ddragon ${res.status} en ${url}`);
  return res.json();
}

const versiones = await ddragon('https://ddragon.leagueoflegends.com/api/versions.json');
const V = versiones[0];
const CDN = 'https://ddragon.leagueoflegends.com/cdn';

const hechizosData = await ddragon(`${CDN}/${V}/data/es_ES/summoner.json`);
const hechizoPorClave = {}; // 4 -> { nombre: "Flash", icono: url }
for (const h of Object.values(hechizosData.data)) {
  hechizoPorClave[h.key] = { nombre: h.name, icono: `${CDN}/${V}/img/spell/${h.id}.png` };
}

const runasData = await ddragon(`${CDN}/${V}/data/es_ES/runesReforged.json`);
const runaPorId = {}; // perkId/styleId -> { nombre, icono }
for (const estilo of runasData) {
  runaPorId[estilo.id] = { nombre: estilo.name, icono: `${CDN}/img/${estilo.icon}` };
  for (const fila of estilo.slots) {
    for (const runa of fila.runes) {
      runaPorId[runa.id] = { nombre: runa.name, icono: `${CDN}/img/${runa.icon}` };
    }
  }
}

const itemsData = await ddragon(`${CDN}/${V}/data/es_ES/item.json`);
const itemPorId = {}; // 3153 -> { nombre, icono }
for (const [id, item] of Object.entries(itemsData.data)) {
  itemPorId[id] = { nombre: item.name, icono: `${CDN}/${V}/img/item/${id}.png` };
}

// ── Episodios: parseo mínimo del frontmatter que necesitamos ──
async function leerEpisodios() {
  const archivos = (await readdir(DIR_EPISODIOS)).filter((f) => f.endsWith('.md'));
  const episodios = [];
  for (const archivo of archivos) {
    const crudo = await readFile(path.join(DIR_EPISODIOS, archivo), 'utf8');
    const campeon = crudo.match(/^campeon:\s*(\S+)/m)?.[1];
    const orden = Number(crudo.match(/^orden:\s*(\d+)/m)?.[1] ?? NaN);
    const fechas = [...crudo.matchAll(/^[ \t]+fecha:\s*(\d{4}-\d{2}-\d{2})/gm)]
      .map((m) => m[1])
      .sort();
    const desde = crudo.match(/^partidasDesde:\s*(\d{4}-\d{2}-\d{2})/m)?.[1] ?? null;
    const hasta = crudo.match(/^partidasHasta:\s*(\d{4}-\d{2}-\d{2})/m)?.[1] ?? null;
    if (!campeon || (fechas.length === 0 && !desde)) continue;
    episodios.push({ id: archivo.replace(/\.md$/, ''), campeon, orden, fechas, desde, hasta });
  }
  // Clave única y transitiva: sin `orden:` va al final, con id como desempate.
  const claveOrden = (ep) => (Number.isNaN(ep.orden) ? Infinity : ep.orden);
  return episodios.sort((a, b) => claveOrden(a) - claveOrden(b) || a.id.localeCompare(b.id));
}

// ── Cuentas → puuid ──
const cuentas = [];
for (const c of CUENTAS) {
  const [nombre, tag] = c.riotId.split('#');
  const cuenta = await riot(
    `https://${c.region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(nombre)}/${encodeURIComponent(tag)}`,
  );
  if (!cuenta) {
    console.warn(`⚠ Cuenta no encontrada: ${c.riotId}`);
    continue;
  }
  cuentas.push({ ...c, puuid: cuenta.puuid });
  console.log(`Cuenta OK: ${c.riotId}`);
}
if (cuentas.length === 0) {
  console.error('Ninguna cuenta válida.');
  process.exit(1);
}

// ── Caché de partidas ya vistas ──
//
// Guarda los HECHOS de Riot (ids de objetos, claves de hechizos…), no los
// nombres ni las URLs de iconos: esos se derivan de Data Dragon en cada
// pasada, así que al cambiar de parche los iconos se actualizan solos sin
// volver a preguntar a Riot.
//
//   partidas    → partida de un campeón de la serie, en la Grieta y sin remake
//   descartadas → matchId: campeón jugado, o '' si nunca vale la pena mirarla
//                 (otro modo o remake). Si un campeón descartado estrena
//                 episodio más adelante, sus partidas se rescatan solas.
const cache = { formato: FORMATO_CACHE, partidas: {}, descartadas: {} };

if (!COMPLETO) {
  try {
    const guardada = JSON.parse(await readFile(ARCHIVO_CACHE, 'utf8'));
    if (guardada.formato === FORMATO_CACHE) {
      cache.partidas = guardada.partidas ?? {};
      cache.descartadas = guardada.descartadas ?? {};
    } else {
      console.log(
        `Caché con formato ${guardada.formato} (ahora ${FORMATO_CACHE}): se rebaja la serie entera.`,
      );
    }
  } catch {
    console.log('Sin caché previa: primera pasada completa.');
  }
}

await mkdir(DIR_SALIDA, { recursive: true });

const DIA_MS = 24 * 60 * 60 * 1000;
const episodios = await leerEpisodios();
if (episodios.length === 0) {
  console.error('Ningún episodio con fechas; se aborta.');
  process.exit(1);
}
console.log(`${episodios.length} episodios con fechas\n`);

// Inicio del arco: `partidasDesde` si existe; si no, primer vídeo con margen.
const inicioArco = (ep) =>
  ep.desde
    ? Math.floor(Date.parse(ep.desde) / 1000)
    : Math.floor((Date.parse(ep.fechas[0]) - MARGEN_ANTES_DIAS * DIA_MS) / 1000);

const inicioSerie = Math.min(...episodios.map(inicioArco));
const ahora = Math.floor(Date.now() / 1000);
console.log(`Rango de la serie: ${new Date(inicioSerie * 1000).toISOString().slice(0, 10)} → hoy\n`);

// ── Descarga: solo lo que la caché no conoce ──
const campeonesDeLaSerie = new Set(episodios.map((e) => e.campeon));
let nuevas = 0;
let descartadasNuevas = 0;
let rescatadas = 0;
let reutilizadas = 0;

for (const cuenta of cuentas) {
  let inicio = 0;
  while (true) {
    const ids = await riot(
      `https://${cuenta.region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${cuenta.puuid}/ids?startTime=${inicioSerie}&endTime=${ahora}&start=${inicio}&count=100`,
    );
    if (!ids || ids.length === 0) break;

    for (const matchId of ids) {
      if (cache.partidas[matchId]) {
        reutilizadas += 1;
        continue;
      }

      // Ya vista y descartada: solo se vuelve a mirar si su campeón estrena
      // episodio (la cadena vacía marca «otro modo o remake», nunca sirve).
      const descartada = cache.descartadas[matchId];
      if (descartada !== undefined) {
        if (!descartada || !campeonesDeLaSerie.has(descartada)) continue;
        rescatadas += 1;
        delete cache.descartadas[matchId];
      }

      const detalle = await riot(
        `https://${cuenta.region}.api.riotgames.com/lol/match/v5/matches/${matchId}`,
      );
      if (!detalle) continue;

      const p = detalle.info.participants.find((x) => x.puuid === cuenta.puuid);
      if (!p) continue;

      // Remakes y todo lo que no sea la Grieta clásica (Arena, ARAM, URF…): no
      // son el reto y descuadran el arco (0 CS, KDA disparado, «victoria» que
      // no es una partida ganada). No vale la pena volver a mirarlas nunca.
      if (
        detalle.info.gameDuration < 300 ||
        detalle.info.mapId !== 11 ||
        detalle.info.gameMode !== 'CLASSIC'
      ) {
        cache.descartadas[matchId] = '';
        descartadasNuevas += 1;
        continue;
      }

      const campeon = normalizaCampeon(p.championName);

      // De otro campeón: se anota con su nombre por si algún día tiene episodio
      if (!campeonesDeLaSerie.has(campeon)) {
        cache.descartadas[matchId] = campeon;
        descartadasNuevas += 1;
        continue;
      }

      cache.partidas[matchId] = {
        campeon,
        cuenta: cuenta.riotId,
        inicio: new Date(detalle.info.gameStartTimestamp).toISOString(),
        duracionSeg: detalle.info.gameDuration,
        queueId: detalle.info.queueId,
        victoria: p.win,
        nivel: p.champLevel,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        cs: p.totalMinionsKilled + p.neutralMinionsKilled,
        items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5],
        trinket: p.item6,
        hechizos: [p.summoner1Id, p.summoner2Id],
        runaPrincipal: p.perks?.styles?.[0]?.selections?.[0]?.perk ?? null,
        estiloSecundario: p.perks?.styles?.[1]?.style ?? null,
        ganaAzul: detalle.info.teams?.find((t) => t.teamId === 100)?.win ?? null,
        jugadores: detalle.info.participants.map((x) => ({
          campeon: normalizaCampeon(x.championName),
          nombre: x.riotIdGameName
            ? `${x.riotIdGameName}#${x.riotIdTagline}`
            : (x.summonerName || '—'),
          equipo: x.teamId === 100 ? 'azul' : 'rojo',
          posicion: x.teamPosition || '',
          kills: x.kills,
          deaths: x.deaths,
          assists: x.assists,
          protagonista: x.puuid === cuenta.puuid,
        })),
      };
      nuevas += 1;
    }
    if (ids.length < 100) break;
    inicio += 100;
  }
}

console.log(
  `Partidas: ${reutilizadas} ya en caché · ${nuevas} nuevas` +
    `${rescatadas ? ` · ${rescatadas} rescatadas` : ''}` +
    `${descartadasNuevas ? ` · ${descartadasNuevas} descartadas` : ''}\n`,
);

// Si no queda NINGUNA partida (API caída o degradada, aunque los ids
// respondan), algo falló: no pisamos los JSON con datos vacíos.
if (Object.keys(cache.partidas).length === 0) {
  console.error('No hay ninguna partida que repartir; se aborta sin escribir.');
  process.exit(1);
}

await writeFile(ARCHIVO_CACHE, `${JSON.stringify(cache, null, 2)}\n`);

// ── Presentación: los ids de Riot se convierten en nombres e iconos ──
const icono = (mapa, id) => (id > 0 ? (mapa[id] ?? null) : null);

const paraLaWeb = (m, matchId) => ({
  matchId,
  cuenta: m.cuenta,
  inicio: m.inicio,
  duracionSeg: m.duracionSeg,
  cola: COLAS[m.queueId] ?? 'Otra cola',
  queueId: m.queueId,
  victoria: m.victoria,
  nivel: m.nivel,
  kills: m.kills,
  deaths: m.deaths,
  assists: m.assists,
  cs: m.cs,
  items: m.items.map((id) => icono(itemPorId, id)),
  trinket: icono(itemPorId, m.trinket),
  hechizos: m.hechizos.map((k) => hechizoPorClave[k] ?? null),
  runaPrincipal: m.runaPrincipal ? (runaPorId[m.runaPrincipal] ?? null) : null,
  estiloSecundario: m.estiloSecundario ? (runaPorId[m.estiloSecundario] ?? null) : null,
  ganaAzul: m.ganaAzul,
  jugadores: m.jugadores.map((j) => ({
    ...j,
    icono: `${CDN}/${V}/img/champion/${j.campeon}.png`,
  })),
});

const porCampeon = new Map(); // campeon -> partidas listas para la web
for (const [matchId, m] of Object.entries(cache.partidas)) {
  if (!porCampeon.has(m.campeon)) porCampeon.set(m.campeon, []);
  porCampeon.get(m.campeon).push(paraLaWeb(m, matchId));
}

// ── Asignación por episodio y escritura ──
for (const ep of episodios) {
  // Sin límites manuales, la ventana sale de las fechas de los vídeos del arco
  const desde = ep.desde
    ? Math.floor(Date.parse(ep.desde) / 1000)
    : ep.fechas.length
      ? Math.floor((Date.parse(ep.fechas[0]) - MARGEN_ANTES_DIAS * DIA_MS) / 1000)
      : null;
  const hasta = ep.hasta
    ? Math.floor((Date.parse(ep.hasta) + DIA_MS) / 1000)
    : ep.fechas.length
      ? Math.floor(
          (Date.parse(ep.fechas[ep.fechas.length - 1]) + (MARGEN_DESPUES_DIAS + 1) * DIA_MS) / 1000,
        )
      : null;
  if (desde !== null && hasta !== null && hasta <= desde) {
    console.warn(`── ${ep.id} (${ep.campeon}) · límites vacíos, revisar partidasDesde/partidasHasta`);
    continue;
  }
  const manual = [ep.desde && 'desde', ep.hasta && 'hasta'].filter(Boolean).join(' y ');
  const ventana =
    desde === null && hasta === null
      ? 'todo el rango'
      : `${desde ? new Date(desde * 1000).toISOString().slice(0, 10) : '…'} → ${
          hasta ? new Date(hasta * 1000 - DIA_MS).toISOString().slice(0, 10) : '…'
        }`;

  const partidas = (porCampeon.get(ep.campeon) ?? []).filter((p) => {
    const t = Math.floor(Date.parse(p.inicio) / 1000);
    return (desde === null || t >= desde) && (hasta === null || t < hasta);
  });

  partidas.sort((a, b) => a.inicio.localeCompare(b.inicio));
  partidas.forEach((p, i) => (p.n = i + 1));

  const victorias = partidas.filter((p) => p.victoria).length;
  const kills = partidas.reduce((s, p) => s + p.kills, 0);
  const deaths = partidas.reduce((s, p) => s + p.deaths, 0);
  const assists = partidas.reduce((s, p) => s + p.assists, 0);

  const salida = {
    actualizado: new Date().toISOString(),
    ddragon: V,
    cuentas: cuentas.map((c) => c.riotId),
    resumen: {
      partidas: partidas.length,
      victorias,
      derrotas: partidas.length - victorias,
      kda: deaths > 0 ? Number(((kills + assists) / deaths).toFixed(1)) : kills + assists,
    },
    partidas,
  };

  await writeFile(path.join(DIR_SALIDA, `${ep.id}.json`), JSON.stringify(salida, null, 2));
  console.log(
    `── ${ep.id} (${ep.campeon}) · ${ventana}${manual ? ` (${manual} manual)` : ''}: ${partidas.length} partidas (${victorias}V–${partidas.length - victorias}D)`,
  );
}

console.log('\nBackfill completo.');
