/**
 * Data Dragon — el CDN oficial y público de Riot para assets de LoL.
 * Splash y loading no llevan versión; los iconos cuadrados sí.
 */
export const DDRAGON_VERSION = '15.16.1';

export const splash = (id: string) =>
  `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${id}_0.jpg`;

export const loading = (id: string) =>
  `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${id}_0.jpg`;

export const cuadrado = (id: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${id}.png`;
