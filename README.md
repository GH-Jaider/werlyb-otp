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
# rolCoach: OTP de Kled        # solo si está contrastado; si no, no se pinta
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

## Partidas (API de Riot)

Las partidas de cada arco se bajan de la API oficial de Riot y quedan guardadas como JSON
en `src/data/partidas/` — la web sigue siendo estática y no depende de que la key viva.

```bash
RIOT_API_KEY=RGAPI-... npm run partidas
```

- Las cuentas de Werlyb se listan en `src/data/cuentas.json` (Riot ID + región de routing).
- El script toma la ventana de fechas de los vídeos de cada arco (con margen), filtra por el
  campeón y descarta remakes. Los iconos de ítems/runas/hechizos quedan resueltos a URLs de
  Data Dragon dentro del JSON.
- En las páginas de episodio, los campos manuales del frontmatter (`partidas`, `victorias`…)
  mandan sobre lo descargado, por si hay que corregir algo a mano.
- La key se pasa SIEMPRE por variable de entorno; nunca se guarda en el repo.

Para la actualización automática nocturna: sube el repo a GitHub, crea el secret
`RIOT_API_KEY` (con una **Personal App Key**, que no caduca) y el workflow
`.github/workflows/partidas.yml` hace el resto — si hay partidas nuevas, committea y
Vercel redespliega solo.

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

## Panel para editar sin GitHub (`/panel`)

Pensado para quien no tiene (ni quiere) cuenta de GitHub: se entra en
`https://siendo-otp.vercel.app/panel` con una contraseña y se edita el coach, los vídeos y las
notas de cada episodio; al publicar, el servidor commitea y la web se redespliega sola. El
campeón se elige de un buscador que lee Data Dragon, así que no hay que saber IDs como
`MonkeyKing`.

Necesita tres variables de entorno en Vercel:

- `PANEL_CLAVE_HASH` — hash scrypt de la contraseña. Se genera con:
  `node -e "import('./api/panel/_sesion.js').then(m => console.log(m.hashDeClave('LA-CLAVE')))"`
- `PANEL_SESION_SECRETO` — cadena aleatoria para firmar la cookie de sesión.
- `PANEL_TOKEN_GITHUB` — token fine-grained con permiso *Contents: Read and write* **solo**
  sobre este repositorio. Nunca sale del servidor.

El panel solo escribe los campos que edita (`orden`, `campeon`, `nombreCampeon`,
`tituloCampeon`, `coach`, `rolCoach`, `canalCoach`, `videos`, `partidasDesde`,
`partidasHasta`) y las notas: cualquier otro campo del frontmatter, como las estadísticas que
rellena la tarea nocturna, se conserva intacto. Al reescribir el archivo se pierden los
comentarios YAML del frontmatter.

Los campos que se rellenan solos van marcados en la interfaz («entran solos», «las cuenta el
robot») y el resto como «opcional», para que quede claro qué hay que tocar y qué no. El bloque
de partidas muestra en solo lectura lo que encontró la tarea nocturna y permite fijar el rango
de fechas (`partidasDesde` / `partidasHasta`) para los campeones que también se juegan fuera
del reto.

## Administración alternativa (Sveltia CMS)

En `/admin` hay un panel de [Sveltia CMS](https://github.com/sveltia/sveltia-cms) para editar
los episodios desde el navegador, sin tocar Markdown a mano. Los archivos de configuración son
`public/admin/index.html` y `public/admin/config.yml`.

El acceso es **«Sign In with GitHub»**: cada editor entra con su propia cuenta de GitHub, en un
clic. No hay que generar ni compartir tokens; basta con tener acceso de escritura al
repositorio (como colaborador o como propietario).

El intercambio OAuth lo sirve la propia web, sin proveedores extra: `api/auth.js` y
`api/callback.js` son funciones de Vercel que portan el
[autenticador oficial](https://github.com/sveltia/sveltia-cms-auth) (pensado para Cloudflare
Workers). Necesitan dos variables de entorno en Vercel, que salen de una
[OAuth App de GitHub](https://github.com/settings/developers) cuyo callback sea
`https://siendo-otp.vercel.app/api/callback`:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET` (solo vive en Vercel; nunca llega al navegador)

Opcionalmente, `ALLOWED_DOMAINS` restringe qué dominios pueden usar el autenticador (por
defecto, el de producción, los previos de Vercel y `localhost`).

El inicio de sesión con token personal sigue disponible como alternativa. Para dejar
únicamente el de GitHub, añadir `auth_methods: [oauth]` al bloque `backend` de `config.yml`.

## Hoja de ruta

- **Caché incremental de partidas**: guardar los matchIds ya procesados para que el
  proceso nocturno solo descargue lo nuevo en vez de recorrer toda la serie.

V2 (panel de edición con Sveltia CMS en `/admin`) y V3 (stats automáticas nocturnas con el
workflow «Actualizar partidas») ya están entregadas, junto con la ingesta automática de
vídeos («Actualizar vídeos»).
