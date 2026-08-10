/**
 * Datos de la serie que no son episodios.
 * Los enlaces solo se publican si están verificados; null = no se pinta.
 */
export const SERIE = {
  titulo: 'Siendo OTP por un día',
  claim: 'Un campeón. Un coach one-trick. Los días que hagan falta.',
  descripcion:
    'Tracker fan de la serie de Werlyb: cada episodio, un campeón distinto y, casi siempre, un one-trick como coach. Episodios, coaches, vídeos y stats.',
  playlist:
    'https://www.youtube.com/playlist?list=PLr8p9eQ_HwEEuZF5Rdi-WBlL84QFBSzze' as string | null,
  redes: {
    twitch: 'https://www.twitch.tv/werlyb' as string | null,
    youtube: 'https://www.youtube.com/@Werlyb' as string | null,
    x: 'https://x.com/werlyb' as string | null,
  },
  /** Campeones que suenan para próximos episodios */
  candidatos: [
    { ddragonId: 'Kled', nombre: 'Kled' },
    { ddragonId: 'Gangplank', nombre: 'Gangplank' },
    { ddragonId: 'Volibear', nombre: 'Volibear' },
  ],
};
