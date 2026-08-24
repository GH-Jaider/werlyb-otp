/**
 * Prueba del backfill (scripts/partidas.mjs) con la API de Riot y Data
 * Dragon simuladas: no hace falta clave ni red.
 *
 *   node scripts/pruebas/partidas.test.mjs
 *
 * Monta un repo de mentira, ejecuta el script dos veces y comprueba que la
 * segunda no vuelve a pedir detalles a Riot.
 */
import { mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import path from 'node:path';

import { tmpdir } from 'node:os';

const TMP = path.join(tmpdir(), 'prueba-partidas');
const REAL = path.resolve(import.meta.dirname, '../..');

// ── Repo de mentira ──
await rm(TMP, { recursive: true, force: true });
await mkdir(path.join(TMP, 'scripts'), { recursive: true });
await mkdir(path.join(TMP, 'src/content/episodios'), { recursive: true });
await mkdir(path.join(TMP, 'src/data/partidas'), { recursive: true });
await cp(path.join(REAL, 'scripts/partidas.mjs'), path.join(TMP, 'scripts/partidas.mjs'));

await writeFile(
  path.join(TMP, 'src/data/cuentas.json'),
  JSON.stringify([{ riotId: 'cuenta uno#EUW', region: 'europe' }]),
);

await writeFile(
  path.join(TMP, 'src/content/episodios/01-gwen.md'),
  `---\norden: 1\ncampeon: Gwen\nnombreCampeon: Gwen\nvideos:\n  - titulo: 'v1'\n    url: https://x/1\n    fecha: 2026-07-11\n---\n`,
);
await writeFile(
  path.join(TMP, 'src/content/episodios/02-jax.md'),
  `---\norden: 2\ncampeon: Jax\nnombreCampeon: Jax\npartidasDesde: 2026-07-20\npartidasHasta: 2026-07-21\nvideos:\n  - titulo: 'v1'\n    url: https://x/2\n    fecha: 2026-07-20\n---\n`,
);

// ── Partidas de mentira ──
const dia = (d) => Date.UTC(2026, 6, d, 12, 0, 0); // julio de 2026

const jugadores = (campeonProta) =>
  Array.from({ length: 10 }, (_, i) => ({
    puuid: i === 0 ? 'PUUID-1' : `otro-${i}`,
    championName: i === 0 ? campeonProta : 'Ahri',
    riotIdGameName: i === 0 ? 'cuenta uno' : `jug${i}`,
    riotIdTagline: 'EUW',
    teamId: i < 5 ? 100 : 200,
    teamPosition: ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'][i % 5],
    kills: 5,
    deaths: 2,
    assists: 7,
    win: true,
    champLevel: 16,
    item0: 3153,
    item1: 0,
    item2: 0,
    item3: 0,
    item4: 0,
    item5: 0,
    item6: 3340,
    totalMinionsKilled: 180,
    neutralMinionsKilled: 20,
    summoner1Id: 4,
    summoner2Id: 12,
    perks: { styles: [{ selections: [{ perk: 8010 }] }, { style: 8300 }] },
  }));

const partida = (id, campeon, dias, extra = {}) => ({
  info: {
    gameStartTimestamp: dia(dias),
    gameDuration: 1800,
    mapId: 11,
    gameMode: 'CLASSIC',
    queueId: 420,
    teams: [
      { teamId: 100, win: true },
      { teamId: 200, win: false },
    ],
    participants: jugadores(campeon),
    ...extra,
  },
});

const PARTIDAS = {
  M1: partida('M1', 'Gwen', 11), // Gwen dentro de ventana → cuenta
  M2: partida('M2', 'Gwen', 30), // Gwen fuera de ventana → en caché, sin asignar
  M3: partida('M3', 'Jax', 20), // Jax dentro del rango manual → cuenta
  M4: partida('M4', 'Jax', 25), // Jax fuera del rango manual → sin asignar
  M5: partida('M5', 'Ahri', 11), // otro campeón → descartada con su nombre
  M6: partida('M6', 'Gwen', 12, { mapId: 30, gameMode: 'CHERRY' }), // Arena → descartada
  M7: partida('M7', 'Gwen', 12, { gameDuration: 120 }), // remake → descartada
};

// ── Contadores para saber cuántas llamadas se hacen ──
globalThis.LLAMADAS = { detalles: 0, listas: 0 };

const DD = {
  versiones: ['26.1.1'],
  campeones: { data: { Gwen: { id: 'Gwen', name: 'Gwen', title: 'x' } } },
  items: { data: { 3153: { name: 'Filo' }, 3340: { name: 'Centinela' } } },
  hechizos: { data: { SummonerFlash: { key: '4', id: 'SummonerFlash', name: 'Destello' } } },
  runas: [{ id: 8300, name: 'Inspiración', icon: 'i.png', slots: [{ runes: [{ id: 8010, name: 'Conquistador', icon: 'c.png' }] }] }],
};

globalThis.fetch = async (url) => {
  const u = String(url);
  const json = (d) => ({ ok: true, status: 200, json: async () => d, headers: new Map() });

  if (u.includes('/api/versions.json')) return json(DD.versiones);
  if (u.includes('/data/es_ES/champion.json')) return json(DD.campeones);
  if (u.includes('/data/es_ES/item.json')) return json(DD.items);
  if (u.includes('/data/es_ES/summoner.json')) return json(DD.hechizos);
  if (u.includes('/data/es_ES/runesReforged.json')) return json(DD.runas);

  if (u.includes('/riot/account/v1/accounts/by-riot-id/')) {
    return json({ puuid: 'PUUID-1', gameName: 'cuenta uno', tagLine: 'EUW' });
  }

  if (u.includes('/matches/by-puuid/')) {
    globalThis.LLAMADAS.listas += 1;
    return json(u.includes('start=0') ? Object.keys(PARTIDAS) : []);
  }

  const m = u.match(/\/matches\/(M\d+)/);
  if (m) {
    globalThis.LLAMADAS.detalles += 1;
    return json(PARTIDAS[m[1]]);
  }

  throw new Error(`URL no simulada: ${u}`);
};

process.env.RIOT_API_KEY = 'test';

const ejecuta = async () => {
  globalThis.LLAMADAS = { detalles: 0, listas: 0 };
  const antes = process.argv.slice();
  process.argv = [antes[0], path.join(TMP, 'scripts/partidas.mjs')];
  // cache-buster para poder importar el módulo dos veces
  await import(`${path.join(TMP, 'scripts/partidas.mjs')}?v=${Math.random()}`);
  process.argv = antes;
  return globalThis.LLAMADAS;
};

const leer = async (f) => JSON.parse(await readFile(path.join(TMP, 'src/data/partidas', f), 'utf8'));

console.log('══ PRIMERA PASADA (caché vacía) ══');
const l1 = await ejecuta();
console.log(`   llamadas de detalle: ${l1.detalles}`);

const gwen1 = await leer('01-gwen.json');
const jax1 = await leer('02-jax.json');
const cache1 = JSON.parse(await readFile(path.join(TMP, 'src/data/partidas-cache.json'), 'utf8'));

console.log('\n══ SEGUNDA PASADA (con caché) ══');
const l2 = await ejecuta();
console.log(`   llamadas de detalle: ${l2.detalles}`);

const gwen2 = await leer('01-gwen.json');
const jax2 = await leer('02-jax.json');

// ── Tercera pasada: Ahri estrena episodio, su partida debe rescatarse ──
console.log('\n══ TERCERA PASADA (Ahri estrena episodio) ══');
await writeFile(
  path.join(TMP, 'src/content/episodios/03-ahri.md'),
  `---\norden: 3\ncampeon: Ahri\nnombreCampeon: Ahri\nvideos:\n  - titulo: 'v1'\n    url: https://x/3\n    fecha: 2026-07-11\n---\n`,
);
const l3 = await ejecuta();
console.log(`   llamadas de detalle: ${l3.detalles}`);
const ahri = await leer('03-ahri.json');
const cache3 = JSON.parse(await readFile(path.join(TMP, 'src/data/partidas-cache.json'), 'utf8'));

// ── Cuarta pasada: nada cambia, no debe volver a pedir la rescatada ──
const l4 = await ejecuta();

// ── Comprobaciones ──
const pruebas = [
  ['al estrenar Ahri se rescata solo su partida', l3.detalles === 1],
  ['Ahri queda con su partida asignada', ahri.resumen.partidas === 1],
  ['la rescatada sale de la lista de descartadas', cache3.descartadas.M5 === undefined],
  ['tras rescatarla, no se vuelve a pedir', l4.detalles === 0],
  ['1ª pasada pide los 7 detalles', l1.detalles === 7],
  ['2ª pasada no pide ninguno', l2.detalles === 0],
  ['Gwen: solo la partida dentro de ventana', gwen1.resumen.partidas === 1],
  ['Jax: solo la del rango manual', jax1.resumen.partidas === 1],
  ['caché guarda las 4 partidas de campeones de la serie', Object.keys(cache1.partidas).length === 4],
  ['Arena y remake quedan descartados para siempre', cache1.descartadas.M6 === '' && cache1.descartadas.M7 === ''],
  ['otro campeón se anota con su nombre', cache1.descartadas.M5 === 'Ahri'],
  ['los resultados no cambian entre pasadas', JSON.stringify(gwen1.partidas) === JSON.stringify(gwen2.partidas) && JSON.stringify(jax1.partidas) === JSON.stringify(jax2.partidas)],
  ['los iconos se derivan de Data Dragon', gwen1.partidas[0].items[0]?.nombre === 'Filo'],
  ['los 10 jugadores llevan icono', gwen1.partidas[0].jugadores.every((j) => j.icono.includes('/img/champion/'))],
];

console.log('\n══ RESULTADO ══');
let fallos = 0;
for (const [nombre, ok] of pruebas) {
  console.log(`   ${ok ? '✓' : '✗'} ${nombre}`);
  if (!ok) fallos += 1;
}
console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
