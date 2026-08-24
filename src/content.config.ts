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
    rolCoach: z.string().optional(), // p. ej. "OTP de Nami" — solo si está contrastado
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
    // Límites manuales del arco para el backfill de Riot: fuera de este rango
    // las partidas del campeón se excluyen. Vacíos = todo el rango de la serie.
    partidasDesde: z.coerce.date().optional(),
    partidasHasta: z.coerce.date().optional(),
    // Partidas quitadas a mano: caen dentro del arco pero no son del reto.
    // Se guardan por su id de Riot (EUW1_1234567890).
    partidasExcluidas: z.array(z.string()).optional(),
    partidas: z.number().int().nonnegative().optional(),
    victorias: z.number().int().nonnegative().optional(),
    derrotas: z.number().int().nonnegative().optional(),
    kda: z.number().nonnegative().optional(),
    build: z.array(z.string()).optional(),
    runas: z.array(z.string()).optional(),
    acento: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(), // anula el color extraído automáticamente en src/data/paleta.json
  }),
});

export const collections = { episodios };
