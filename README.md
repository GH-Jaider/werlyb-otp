# Siendo OTP por un día — tracker fan

Web no oficial de la serie **Siendo OTP por un día** de [Werlyb](https://www.twitch.tv/werlyb):
cada episodio, un campeón distinto de League of Legends con un one-trick de alto elo como coach.
La web es el archivo de la serie — episodios, coaches, stats del día y VODs — pensada para
sustituir al bloc de notas.

> Proyecto fan hecho por la comunidad. Sin afiliación con Werlyb, Team Heretics ni Riot Games.
> Creado bajo la política «Legal Jibber Jabber» de Riot Games usando recursos propiedad de
> Riot Games; Riot Games no lo respalda ni lo patrocina.

## Editar la web

**Un episodio (arco) = un archivo** en `src/content/episodios/`. Un arco es un campeón con
sus vídeos, sean uno o varios días. Para añadir el arco 15, crea `15-kled.md` con esto
(solo `orden`, `campeon` y `nombreCampeon` son obligatorios; el resto se completa cuando
se sepa):

```markdown
---
orden: 15
campeon: Kled              # ID exacto de Data Dragon (con esto salen solas las imágenes)
nombreCampeon: Kled
tituloCampeon: El Jinete Cascarrabias
coach: NombreDelCoach
# canalCoach: https://www.twitch.tv/...
videos:
  - titulo: 'OTP Kled, día 1'
    url: https://www.youtube.com/watch?v=...
    fecha: 2026-08-20
  - titulo: 'OTP Kled, día 2'
    url: https://www.youtube.com/watch?v=...
    fecha: 2026-08-21
# partidas: 10
# victorias: 6
# derrotas: 4
# kda: 3.1
# build:
#   - Cuchilla oscura de Draktharr
#   - Filo infinito
# runas:
#   - Conquistador
---

Aquí van las notas del arco en texto normal: qué enseñó el coach, los mejores
momentos, lo que se aprendió. Si se deja vacío, la página lo indica sin romperse.
```

El primer vídeo de la lista es el que se incrusta en la página del episodio; el resto
aparece en la lista del arco con su fecha.

El splash art, la imagen de la tarjeta y el icono salen automáticamente de Data Dragon
(el CDN oficial de Riot) a partir del campo `campeon` — no hay que subir ninguna imagen.
Ojo con los IDs compuestos: son en formato Data Dragon (`Gangplank`, `Volibear`, `MonkeyKing`
para Wukong, `Fiddlesticks` sin mayúscula intermedia…).

Los campeones "que suenan" de la sección **Pide tu OTP** y los enlaces de redes se editan
en `src/data/serie.ts`.

## Desarrollo

```bash
npm install
npm run dev      # servidor local en http://localhost:4321
npm run build    # build de producción en dist/
```

Hecho con [Astro](https://astro.build): la web sale 100 % estática, sin nada que mantener.

## Desplegar en Vercel

El proyecto se autodetecta como Astro, sin configuración:

```bash
npx vercel login
npx vercel --prod
```

O conecta el repositorio de GitHub desde el panel de Vercel y cada push publica solo.

## Hoja de ruta

- **V2 — panel de edición**: Sveltia CMS en `/admin` para editar los episodios desde el
  navegador con un formulario (pensado para regalarle la web a Werlyb: transferir el
  repositorio y listo).
- **V3 — stats automáticas**: un proceso nocturno contra la API de Riot que rellene solo
  partidas, balance y KDA del día.
