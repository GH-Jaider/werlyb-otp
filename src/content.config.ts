import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Un episodio = un arco de la serie (un campeón, uno o varios vídeos) =
 * un archivo .md en src/content/episodios/.
 * Solo `orden`, `campeon` y `nombreCampeon` son obligatorios: el resto
 * se puede ir completando después (coach, stats, build…).
 */
const episodios = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/episodios' }),
  schema: z.object({
    orden: z.number(),
    campeon: z.string(), // ID exacto de Data Dragon, p. ej. "LeeSin"
    nombreCampeon: z.string(),
    tituloCampeon: z.string().optional(), // "El Monje Ciego"
    coach: z.string().optional(),
    canalCoach: z.string().url().optional(),
    videos: z
      .array(
        z.object({
          titulo: z.string(),
          url: z.string().url(),
          fecha: z.coerce.date().optional(),
        }),
      )
      .default([]),
    partidas: z.number().int().nonnegative().optional(),
    victorias: z.number().int().nonnegative().optional(),
    derrotas: z.number().int().nonnegative().optional(),
    kda: z.number().nonnegative().optional(),
    build: z.array(z.string()).optional(),
    runas: z.array(z.string()).optional(),
  }),
});

export const collections = { episodios };
