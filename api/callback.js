/**
 * Segundo paso del login del CMS: GitHub vuelve aquí con un código, que se
 * canjea por un token de acceso y se entrega a la ventana del CMS.
 */
import { leerCookie, responderHTML } from './_oauth.js';

export default async function handler(req, res) {
  const { code, state } = req.query ?? {};
  const cookie = leerCookie(req, 'csrf-token') ?? '';
  const [, csrf] = cookie.match(/^github_([0-9a-f]{32})$/) ?? [];

  if (!code || !state) {
    return responderHTML(res, {
      error: 'No se recibió el código de autorización. Inténtalo de nuevo.',
      errorCode: 'AUTH_CODE_REQUEST_FAILED',
    });
  }

  if (!csrf || state !== csrf) {
    return responderHTML(res, {
      error: 'Posible ataque CSRF: se ha abortado el inicio de sesión.',
      errorCode: 'CSRF_DETECTED',
    });
  }

  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = process.env;

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return responderHTML(res, {
      error: 'Falta configurar el ID o el secreto de la app OAuth.',
      errorCode: 'MISCONFIGURED_CLIENT',
    });
  }

  let respuesta;

  try {
    respuesta = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
      }),
    });
  } catch {
    return responderHTML(res, {
      error: 'No se pudo pedir el token de acceso. Inténtalo de nuevo.',
      errorCode: 'TOKEN_REQUEST_FAILED',
    });
  }

  let token = '';
  let error = '';

  try {
    ({ access_token: token, error } = await respuesta.json());
  } catch {
    return responderHTML(res, {
      error: 'El servidor respondió con datos mal formados.',
      errorCode: 'MALFORMED_RESPONSE',
    });
  }

  return responderHTML(res, { token, error });
}
