/**
 * Sesión del panel propio (/panel).
 *
 * La idea: quien edita entra con una contraseña, sin cuenta de GitHub ni
 * tokens. El commit lo hace el servidor con un token que solo vive en las
 * variables de entorno de Vercel y nunca llega al navegador.
 *
 * Variables necesarias:
 *   PANEL_CLAVE_HASH     scrypt$<salt hex>$<hash hex> de la contraseña
 *   PANEL_SESION_SECRETO cadena aleatoria para firmar la cookie de sesión
 *   PANEL_TOKEN_GITHUB   token fine-grained con Contents R/W SOLO de este repo
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const REPO = 'GH-Jaider/werlyb-otp';
export const RAMA = 'main';
export const DIR_EPISODIOS = 'src/content/episodios';

const COOKIE = 'panel-sesion';
const HORAS_SESION = 8;

/** Genera el valor de PANEL_CLAVE_HASH para una contraseña dada. */
export const hashDeClave = (clave) => {
  const salt = randomBytes(16);
  const hash = scryptSync(clave, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
};

/** Comprueba la contraseña contra el hash almacenado, en tiempo constante. */
export const claveCorrecta = (clave, almacenado) => {
  const [algoritmo, saltHex, hashHex] = (almacenado ?? '').split('$');
  if (algoritmo !== 'scrypt' || !saltHex || !hashHex) return false;

  const esperado = Buffer.from(hashHex, 'hex');
  let obtenido;

  try {
    obtenido = scryptSync(clave ?? '', Buffer.from(saltHex, 'hex'), esperado.length);
  } catch {
    return false;
  }

  return obtenido.length === esperado.length && timingSafeEqual(obtenido, esperado);
};

const firmar = (datos, secreto) =>
  createHmac('sha256', secreto).update(datos).digest('base64url');

/** Crea la cookie de sesión firmada (caduca sola). */
export const cookieDeSesion = (secreto) => {
  const caduca = Date.now() + HORAS_SESION * 60 * 60 * 1000;
  const datos = `${caduca}.${randomBytes(9).toString('base64url')}`;
  const valor = `${datos}.${firmar(datos, secreto)}`;

  return (
    `${COOKIE}=${valor}; HttpOnly; Secure; SameSite=Strict; Path=/; ` +
    `Max-Age=${HORAS_SESION * 60 * 60}`
  );
};

export const cookieBorrada = () =>
  `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;

const leerCookie = (req, nombre) => {
  const m = (req.headers.cookie ?? '').match(new RegExp(`\\b${nombre}=([^;]+)`));
  return m ? m[1] : null;
};

/** ¿La petición trae una sesión válida y sin caducar? */
export const sesionValida = (req, secreto) => {
  const valor = leerCookie(req, COOKIE);
  if (!valor || !secreto) return false;

  const partes = valor.split('.');
  if (partes.length !== 3) return false;

  const [caduca, aleatorio, firma] = partes;
  const datos = `${caduca}.${aleatorio}`;
  const esperada = Buffer.from(firmar(datos, secreto));
  const recibida = Buffer.from(firma);

  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return false;

  return Number(caduca) > Date.now();
};

/**
 * Puerta de entrada de los endpoints que tocan contenido: exige sesión y una
 * cabecera propia (que un formulario de otro sitio no puede poner, así que
 * corta los intentos de petición cruzada).
 */
export const exigeSesion = (req, res) => {
  const { PANEL_SESION_SECRETO } = process.env;

  if (!sesionValida(req, PANEL_SESION_SECRETO)) {
    res.status(401).json({ error: 'Sesión caducada. Vuelve a entrar.' });
    return false;
  }

  if (req.headers['x-panel'] !== '1') {
    res.status(403).json({ error: 'Petición no permitida.' });
    return false;
  }

  return true;
};

/** Llamada a la API de GitHub con el token del panel. */
export const github = async (ruta, opciones = {}) => {
  const { PANEL_TOKEN_GITHUB } = process.env;

  const res = await fetch(`https://api.github.com${ruta}`, {
    ...opciones,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${PANEL_TOKEN_GITHUB}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'werlyb-otp-panel',
      ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
      ...opciones.headers,
    },
  });

  return res;
};
