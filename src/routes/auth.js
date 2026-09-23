const { Router } = require('express');

const { q } = require('../db.js');
const { exigirLogin } = require('../auth.js');
const { conferirSenha } = require('../lib/senha.js');
const { assinarToken } = require('../lib/token.js');

const authRouter = Router();

/* POST /api/v1/auth/login  { email, senha } -> { token, usuario } */
authRouter.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const senha = String(req.body?.senha ?? '');
    if (!email || !senha) return res.status(422).json({ erro: 'email_e_senha_obrigatorios' });

    const [usuario] = await q(
      `SELECT id, nome, email, senha_hash, ativo FROM usuarios WHERE email = :email`,
      { email }
    );

    const ok = usuario && usuario.ativo && (await conferirSenha(senha, usuario.senha_hash));
    if (!ok) return res.status(401).json({ erro: 'credenciais_invalidas' });

    await q(`UPDATE usuarios SET ultimo_login = NOW() WHERE id = :id`, { id: usuario.id });

    const token = assinarToken({ sub: usuario.id, nome: usuario.nome, email: usuario.email });
    res.json({ token, usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
  } catch (err) {
    next(err);
  }
});

/* GET /api/v1/auth/eu -> dados do usuário logado */
authRouter.get('/eu', exigirLogin, (req, res) => {
  res.json(req.usuario);
});

module.exports = { authRouter };
