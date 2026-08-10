/** Extrae el ID de un vídeo de YouTube de sus formatos habituales de URL. */
export function youtubeId(url: string): string | null {
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|embed\/|shorts\/))([\w-]{11})/,
  );
  return m ? m[1] : null;
}
