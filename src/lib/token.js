const { createHmac, timingSafeEqual } = require('node:crypto');

const { config } = require('../config.js');

/* Token de sessão assinado (HMAC-SHA256), estilo JWT enxuto: <payload>.<assinatura>.
   Sem dependência externa. */

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function assinatura(payloadB64) {
  return b64u(createHmac('sha256', config.jwtSecret).update(payloadB64).digest());
}

function assinarToken(dados, ttlSegundos = 8 * 60 * 60) {
  const payload = { ...dados, exp: Math.floor(Date.now() / 1000) + ttlSegundos };
  const payloadB64 = b64u(JSON.stringify(payload));
  return `${payloadB64}.${assinatura(payloadB64)}`;
}

function verificarToken(token) {
  const [payloadB64, sig] = String(token ?? '').split('.');
  if (!payloadB64 || !sig) return null;

  const esperada = assinatura(payloadB64);
  if (sig.length !== esperada.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(esperada))) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

module.exports = { assinarToken, verificarToken };
