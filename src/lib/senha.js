const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

/** Gera "scrypt$<salt-b64>$<hash-b64>". Sem dependências nativas. */
async function hashSenha(senha) {
  if (typeof senha !== 'string' || senha.length < 8) {
    throw new Error('senha precisa ter ao menos 8 caracteres');
  }
  const salt = randomBytes(16);
  const derived = await scryptAsync(senha, salt, KEYLEN);
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

async function conferirSenha(senha, hashArmazenado) {
  const partes = String(hashArmazenado ?? '').split('$');
  if (partes.length !== 3 || partes[0] !== 'scrypt') return false;
  const salt = Buffer.from(partes[1], 'base64');
  const esperado = Buffer.from(partes[2], 'base64');
  const derived = await scryptAsync(senha, salt, esperado.length);
  return esperado.length === derived.length && timingSafeEqual(esperado, derived);
}

module.exports = { hashSenha, conferirSenha };
