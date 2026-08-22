/**
 * Primer paso del login del CMS: redirige a GitHub para pedir permiso.
 * El CMS abre /api/auth?provider=github&site_id=<dominio>
 */
import { randomUUID } from 'node:crypto';
import { patronesDominio, responderHTML } from './_oauth.js';

export default function handler(req, res) {
  const { provider, site_id: dominio } = req.query ?? {};

  if (provider !== 'github') {
    return responderHTML(res, {
      error: 'Este autenticador solo admite GitHub.',
      errorCode: 'UNSUPPORTED_BACKEND',
    });
  }

  const patrones = patronesDominio(process.env.ALLOWED_DOMAINS);

  if (patrones.length && !patrones.some((p) => new RegExp(p).test(dominio ?? ''))) {
    return responderHTML(res, {
      error: 'Este dominio no puede usar el autenticador.',
      errorCode: 'UNSUPPORTED_DOMAIN',
    });
  }

  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = process.env;

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return responderHTML(res, {
      error: 'Falta configurar el ID o el secreto de la app OAuth.',
      errorCode: 'MISCONFIGURED_CLIENT',
    });
  }

  // Token aleatorio contra CSRF: viaja en la cookie y en el parámetro state
  const csrf = randomUUID().replaceAll('-', '');

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    scope: 'repo,user',
    state: csrf,
  });

  res.setHeader(
    'Set-Cookie',
    // 10 minutos; SameSite=Lax para que la cookie vuelva tras el redirect
    `csrf-token=github_${csrf}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax; Secure`,
  );
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, `https://github.com/login/oauth/authorize?${params.toString()}`);
}
