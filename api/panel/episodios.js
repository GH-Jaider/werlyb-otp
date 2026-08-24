/**
 * Lee y publica episodios desde el panel.
 *
 *   GET  → lista de episodios (frontmatter + notas + sha del archivo)
 *   PUT  → guarda un episodio y lo commitea en GitHub (el deploy va solo)
 *
 * Solo se tocan los campos que edita el panel: cualquier otro campo del
 * frontmatter (por ejemplo los que rellena la tarea nocturna) se conserva
 * tal cual.
 */
import yaml from 'js-yaml';
import { DIR_EPISODIOS, RAMA, REPO, exigeSesion, github } from './_sesion.js';

/** Orden canónico de las claves, para que los archivos no bailen. */
const ORDEN_CLAVES = [
  'orden',
  'campeon',
  'nombreCampeon',
  'tituloCampeon',
  'coach',
  'rolCoach',
  'canalCoach',
  'videos',
  'partidasDesde',
  'partidasHasta',
  'partidas',
  'victorias',
  'derrotas',
  'kda',
  'build',
  'runas',
  'acento',
];

/** Campos que el panel puede cambiar; el resto queda intacto. */
const CAMPOS_EDITABLES = [
  'orden',
  'campeon',
  'nombreCampeon',
  'tituloCampeon',
  'coach',
  'rolCoach',
  'canalCoach',
  'videos',
  'partidasDesde',
  'partidasHasta',
];

export const separaFrontmatter = (texto) => {
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { datos: {}, cuerpo: texto.trim() };
  return { datos: yaml.load(m[1]) ?? {}, cuerpo: (m[2] ?? '').trim() };
};

/** Claves que son fechas: se escriben como 2026-08-22, sin hora ni comillas. */
const CLAVES_FECHA = ['fecha', 'partidasDesde', 'partidasHasta'];

/** YAML convierte las fechas a Date; aquí vuelven a ser AAAA-MM-DD. */
const aFechaCorta = (valor) => {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'string') return valor.slice(0, 10);
  return valor;
};

const normalizaFechas = (valor) => {
  if (Array.isArray(valor)) return valor.map(normalizaFechas);
  if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
    return Object.fromEntries(
      Object.entries(valor).map(([k, v]) => [
        k,
        CLAVES_FECHA.includes(k) ? aFechaCorta(v) : normalizaFechas(v),
      ]),
    );
  }
  return valor;
};

/**
 * Rehace el archivo del episodio. Ojo: los comentarios YAML del frontmatter
 * (`# …`) se pierden al reescribir, porque el parser no los conserva. El
 * porqué de cada campo está documentado en src/content.config.ts.
 */
export const componeArchivo = (datos, cuerpo) => {
  const limpio = normalizaFechas(
    Object.fromEntries(
      Object.entries(datos).map(([k, v]) => [k, CLAVES_FECHA.includes(k) ? aFechaCorta(v) : v]),
    ),
  );

  const ordenado = {};
  for (const clave of ORDEN_CLAVES) {
    if (limpio[clave] !== undefined && limpio[clave] !== null && limpio[clave] !== '') {
      ordenado[clave] = limpio[clave];
    }
  }
  // Cualquier campo desconocido se conserva al final
  for (const [clave, valor] of Object.entries(limpio)) {
    if (!(clave in ordenado) && valor !== undefined && valor !== null && valor !== '') {
      ordenado[clave] = valor;
    }
  }

  const frontmatter = yaml
    .dump(ordenado, { lineWidth: -1, quotingType: "'", noRefs: true })
    // las fechas quedan sin comillas, como en los archivos escritos a mano
    .replace(
      new RegExp(`^(\\s*)(${CLAVES_FECHA.join('|')}): '(\\d{4}-\\d{2}-\\d{2})'$`, 'gm'),
      '$1$2: $3',
    )
    // los títulos de vídeo siempre entre comillas, igual que los escribe
    // scripts/videos.mjs, para que panel y bot no se pisen el formato
    .replace(/^(\s*)(- )?titulo: (?!['"|>])(.+)$/gm, (_, sangria, guion, valor) => {
      return `${sangria}${guion ?? ''}titulo: '${valor.replace(/'/g, "''")}'`;
    });

  const notas = (cuerpo ?? '').trim();

  return `---\n${frontmatter}---\n${notas ? `\n${notas}\n` : ''}`;
};

const limpiaVideos = (videos) =>
  (Array.isArray(videos) ? videos : [])
    .map((v) => ({
      titulo: String(v?.titulo ?? '').trim(),
      url: String(v?.url ?? '').trim(),
      ...(v?.fecha ? { fecha: String(v.fecha).slice(0, 10) } : {}),
    }))
    .filter((v) => v.titulo && /^https?:\/\//.test(v.url));

export default async function handler(req, res) {
  if (!exigeSesion(req, res)) return;

  if (!process.env.PANEL_TOKEN_GITHUB) {
    return res.status(500).json({ error: 'Falta el token de GitHub del panel.' });
  }

  // ── Resumen de partidas de un episodio (solo lectura: lo escribe el bot) ──
  if (req.method === 'GET' && req.query?.resumen) {
    const slug = String(req.query.resumen);

    if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) {
      return res.status(400).json({ error: 'Episodio no válido.' });
    }

    const datos = await github(
      `/repos/${REPO}/contents/src/data/partidas/${slug}.json?ref=${RAMA}`,
      { headers: { Accept: 'application/vnd.github.raw+json' } },
    );

    if (!datos.ok) return res.status(200).json({ resumen: null });

    try {
      const { resumen, actualizado, cuentas } = await datos.json();
      return res.status(200).json({ resumen, actualizado, cuentas });
    } catch {
      return res.status(200).json({ resumen: null });
    }
  }

  // ── Lista de episodios ──
  if (req.method === 'GET') {
    const lista = await github(`/repos/${REPO}/contents/${DIR_EPISODIOS}?ref=${RAMA}`);

    if (!lista.ok) {
      return res.status(502).json({ error: 'No se pudo leer el repositorio.' });
    }

    const archivos = (await lista.json()).filter((f) => f.name.endsWith('.md'));

    const episodios = await Promise.all(
      archivos.map(async (f) => {
        const bruto = await github(`/repos/${REPO}/contents/${f.path}?ref=${RAMA}`, {
          headers: { Accept: 'application/vnd.github.raw+json' },
        });
        const texto = await bruto.text();
        const { datos, cuerpo } = separaFrontmatter(texto);

        return { slug: f.name.replace(/\.md$/, ''), sha: f.sha, datos, cuerpo };
      }),
    );

    episodios.sort((a, b) => (b.datos.orden ?? 0) - (a.datos.orden ?? 0));

    return res.status(200).json({ episodios });
  }

  // ── Guardar un episodio ──
  if (req.method === 'PUT') {
    const cuerpoPeticion =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
    const { slug, sha, datos = {}, notas = '', esNuevo = false } = cuerpoPeticion;

    if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug ?? '')) {
      return res.status(400).json({ error: 'El nombre del archivo no es válido.' });
    }

    if (!datos.campeon || !datos.nombreCampeon || !Number.isInteger(Number(datos.orden))) {
      return res.status(400).json({ error: 'Faltan el número de episodio o el campeón.' });
    }

    const ruta = `${DIR_EPISODIOS}/${slug}.md`;

    // Se parte SIEMPRE del archivo actual para no perder lo que el panel no edita
    let previo = { datos: {}, cuerpo: '' };
    let shaActual = sha;

    const actual = await github(`/repos/${REPO}/contents/${ruta}?ref=${RAMA}`);

    if (actual.ok) {
      const info = await actual.json();
      shaActual = info.sha;
      previo = separaFrontmatter(Buffer.from(info.content, 'base64').toString('utf8'));
    } else if (!esNuevo) {
      return res.status(404).json({ error: 'Ese episodio ya no existe.' });
    } else {
      shaActual = undefined;
    }

    const fusionado = { ...previo.datos };

    for (const campo of CAMPOS_EDITABLES) {
      if (!(campo in datos)) continue;
      const valor = datos[campo];

      if (campo === 'videos') {
        fusionado.videos = limpiaVideos(valor);
      } else if (campo === 'orden') {
        fusionado.orden = Number(valor);
      } else {
        const limpio = typeof valor === 'string' ? valor.trim() : valor;
        if (limpio === '' || limpio == null) delete fusionado[campo];
        else fusionado[campo] = limpio;
      }
    }

    const contenido = componeArchivo(fusionado, notas);

    const guardado = await github(`/repos/${REPO}/contents/${ruta}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `${shaActual ? 'Episodio actualizado' : 'Nuevo episodio'}: ${slug} (desde el panel)`,
        content: Buffer.from(contenido, 'utf8').toString('base64'),
        branch: RAMA,
        ...(shaActual ? { sha: shaActual } : {}),
        committer: {
          name: 'Panel Siendo OTP',
          email: '41898282+github-actions[bot]@users.noreply.github.com',
        },
      }),
    });

    if (!guardado.ok) {
      const detalle = await guardado.text();
      return res.status(502).json({
        error: guardado.status === 409
          ? 'Alguien ha tocado ese episodio mientras editabas. Recarga y repite.'
          : 'GitHub rechazó el guardado.',
        detalle: detalle.slice(0, 200),
      });
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Método no permitido.' });
}
