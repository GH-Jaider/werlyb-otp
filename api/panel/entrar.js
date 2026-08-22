/** Login del panel: contraseña → cookie de sesión firmada. */
import { claveCorrecta, cookieDeSesion } from './_sesion.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const { PANEL_CLAVE_HASH, PANEL_SESION_SECRETO } = process.env;

  if (!PANEL_CLAVE_HASH || !PANEL_SESION_SECRETO) {
    return res.status(500).json({ error: 'El panel aún no está configurado.' });
  }

  const clave = typeof req.body === 'string' ? JSON.parse(req.body || '{}').clave : req.body?.clave;

  if (!claveCorrecta(clave, PANEL_CLAVE_HASH)) {
    // Pequeña espera: encarece probar contraseñas a lo bruto
    await new Promise((r) => setTimeout(r, 700));
    return res.status(401).json({ error: 'Contraseña incorrecta.' });
  }

  res.setHeader('Set-Cookie', cookieDeSesion(PANEL_SESION_SECRETO));
  return res.status(200).json({ ok: true });
}
