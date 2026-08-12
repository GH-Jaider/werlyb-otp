/**
 * Carga de las partidas descargadas por scripts/partidas.mjs.
 * Si el JSON de un episodio no existe, todo degrada sin romperse.
 */
export interface IconoDD {
  nombre: string;
  icono: string;
}

export interface Jugador {
  campeon: string;
  icono: string;
  nombre: string;
  equipo: 'azul' | 'rojo';
  posicion: string;
  kills: number;
  deaths: number;
  assists: number;
  protagonista: boolean;
}

export interface Partida {
  n: number;
  matchId: string;
  jugadores?: Jugador[];
  ganaAzul?: boolean | null;
  cuenta: string;
  inicio: string;
  duracionSeg: number;
  cola: string;
  victoria: boolean;
  nivel: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  items: (IconoDD | null)[];
  trinket: IconoDD | null;
  hechizos: (IconoDD | null)[];
  runaPrincipal: IconoDD | null;
  estiloSecundario: IconoDD | null;
}

export interface DatosPartidas {
  actualizado: string;
  ddragon: string;
  cuentas: string[];
  resumen: { partidas: number; victorias: number; derrotas: number; kda: number };
  partidas: Partida[];
}

const modulos = import.meta.glob('../data/partidas/*.json', { eager: true });

export function partidasDe(episodioId: string): DatosPartidas | null {
  const mod = modulos[`../data/partidas/${episodioId}.json`] as
    | { default?: DatosPartidas }
    | DatosPartidas
    | undefined;
  if (!mod) return null;
  return (mod as { default?: DatosPartidas }).default ?? (mod as DatosPartidas);
}
