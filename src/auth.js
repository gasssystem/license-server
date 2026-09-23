const { q } = require('./db.js');
const { verificarToken } = require('./lib/token.js');

/**
 * Exige um token de sessão válido (Authorization: Bearer <token>) e confirma que
 * o usuário ainda existe e está ativo — desativar um usuário derruba o acesso na
 * próxima requisição, mesmo com o token ainda "válido".
 */
async function exigirLogin(req, res, next) {
  try {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const payload = verificarToken(token);
    if (!payload?.sub) {
      return res.status(401).json({ erro: 'nao_autenticado' });
    }

    const [usuario] = await q(
      `SELECT id, nome, email, ativo FROM usuarios WHERE id = :id`,
      { id: payload.sub }
    );
    if (!usuario || !usuario.ativo) {
      return res.status(401).json({ erro: 'sessao_invalida' });
    }

    req.usuario = { id: usuario.id, nome: usuario.nome, email: usuario.email };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { exigirLogin };
