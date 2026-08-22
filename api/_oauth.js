/**
 * Cliente OAuth de GitHub para Sveltia CMS, servido por la propia web.
 *
 * Es un port del autenticador oficial (sveltia-cms-auth, pensado para
 * Cloudflare Workers) a funciones de Vercel, para no añadir otro proveedor:
 * el panel de /admin y su login viven en el mismo dominio.
 *
 * Flujo: /api/auth redirige a GitHub → GitHub vuelve a /api/callback con un
 * código → aquí se canjea por un token que se entrega a la ventana del CMS
 * por postMessage. El secreto NUNCA llega al navegador.
 *
 * @see https://github.com/sveltia/sveltia-cms-auth
 */

/** Dominios que pueden usar este autenticador (coma; admite comodín). */
const DOMINIOS_POR_DEFECTO = 'siendo-otp.vercel.app,*.vercel.app,localhost';

const escaparRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Convierte la lista de dominios en patrones anclados de expresión regular. */
export const patronesDominio = (dominios) =>
  (dominios ?? DOMINIOS_POR_DEFECTO)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `^${escaparRegExp(s).replaceAll('\\*', '.+')}$`);

const serializar = (valor) => JSON.stringify(valor ?? null).replaceAll('<', '\\u003c');

/**
 * Devuelve la página que habla con la ventana que abrió el popup: le entrega
 * el token (o el error) por postMessage, solo si su origen es de confianza.
 */
export const responderHTML = (res, { token, error, errorCode }) => {
  const estado = error ? 'error' : 'success';
  const contenido = error ? { provider: 'github', error, errorCode } : { provider: 'github', token };

  res.setHeader('Content-Type', 'text/html;charset=UTF-8');
  res.setHeader('Cache-Control', 'no-store');
  // Se borra el token CSRF: el flujo ha terminado
  res.setHeader('Set-Cookie', 'csrf-token=deleted; HttpOnly; Max-Age=0; Path=/; SameSite=Lax; Secure');

  res.status(200).send(`<!doctype html><html><body><script>
  (() => {
    const patrones = ${serializar(patronesDominio(process.env.ALLOWED_DOMAINS))};
    const hayToken = ${serializar(!!token)};

    const esDeConfianza = (origen) => {
      try {
        const { hostname } = new URL(origen);
        return patrones.some((p) => new RegExp(p).test(hostname));
      } catch {
        return false;
      }
    };

    window.addEventListener('message', ({ data, origin }) => {
      if (data !== 'authorizing:github') return;
      // El origen del mensaje lo pone el navegador y no se puede falsificar:
      // es la única señal fiable de quién abrió este popup. Un error no lleva
      // secretos, así que siempre se deja pasar.
      if (hayToken && patrones.length && !esDeConfianza(origin)) return;
      window.opener?.postMessage(
        'authorization:github:${estado}:${JSON.stringify(contenido).replaceAll('<', '\\u003c')}',
        origin,
      );
    });
    window.opener?.postMessage('authorizing:github', '*');
  })();
</script></body></html>`);
};

/** Lee una cookie de la cabecera cruda. */
export const leerCookie = (req, nombre) => {
  const cookies = req.headers.cookie ?? '';
  const m = cookies.match(new RegExp(`\\b${nombre}=([^;]+)`));
  return m ? m[1] : null;
};
