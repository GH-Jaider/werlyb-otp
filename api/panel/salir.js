/** Cierra la sesión del panel. */
import { cookieBorrada } from './_sesion.js';

export default function handler(req, res) {
  res.setHeader('Set-Cookie', cookieBorrada());
  return res.status(200).json({ ok: true });
}
