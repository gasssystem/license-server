const { Router } = require('express');

const { q } = require('../db.js');
const { exigirLogin } = require('../auth.js');
const { hashSenha } = require('../lib/senha.js');

const usuariosRouter = Router();
usuariosRouter.use(exigirLogin);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const semSenha = (u) => ({
  id: u.id,
  nome: u.nome,
  email: u.email,
  ativo: !!u.ativo,
  criado_em: u.criado_em,
  ultimo_login: u.ultimo_login
});

/* GET /api/v1/usuarios */
usuariosRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await q(
      `SELECT id, nome, email, ativo, criado_em, ultimo_login FROM usuarios ORDER BY nome`
    );
    res.json(rows.map(semSenha));
  } catch (err) {
    next(err);
  }
});

/* POST /api/v1/usuarios  { nome, email, senha } */
usuariosRouter.post('/', async (req, res, next) => {
  try {
    const nome = String(req.body?.nome ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const senha = String(req.body?.senha ?? '');

    const erros = [];
    if (nome.length < 2) erros.push('nome obrigatório');
    if (!EMAIL_RE.test(email)) erros.push('email inválido');
    if (senha.length < 8) erros.push('senha precisa ter ao menos 8 caracteres');
    if (erros.length) return res.status(422).json({ erro: 'validacao', detalhes: erros });

    const [existe] = await q(`SELECT id FROM usuarios WHERE email = :email`, { email });
    if (existe) return res.status(409).json({ erro: 'email_ja_cadastrado' });

    const senha_hash = await hashSenha(senha);
    const r = await q(
      `INSERT INTO usuarios (nome, email, senha_hash) VALUES (:nome, :email, :senha_hash)`,
      { nome, email, senha_hash }
    );
    const [novo] = await q(
      `SELECT id, nome, email, ativo, criado_em, ultimo_login FROM usuarios WHERE id = :id`,
      { id: r.insertId }
    );
    res.status(201).json(semSenha(novo));
  } catch (err) {
    next(err);
  }
});

/* PATCH /api/v1/usuarios/:id  { nome?, email?, ativo?, senha? } */
usuariosRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [atual] = await q(`SELECT * FROM usuarios WHERE id = :id`, { id });
    if (!atual) return res.status(404).json({ erro: 'nao_encontrado' });

    const set = {};
    const erros = [];

    if (req.body?.nome !== undefined) {
      const v = String(req.body.nome).trim();
      if (v.length < 2) erros.push('nome inválido');
      else set.nome = v;
    }
    if (req.body?.email !== undefined) {
      const v = String(req.body.email).trim().toLowerCase();
      if (!EMAIL_RE.test(v)) erros.push('email inválido');
      else {
        const [dono] = await q(`SELECT id FROM usuarios WHERE email = :v AND id <> :id`, { v, id });
        if (dono) erros.push('email já cadastrado');
        else set.email = v;
      }
    }
    if (req.body?.ativo !== undefined) {
      set.ativo = req.body.ativo ? 1 : 0;
      // não deixa desativar o último usuário ativo (nem a si mesmo indiretamente)
      if (set.ativo === 0) {
        const [{ ativos }] = await q(`SELECT COUNT(*) AS ativos FROM usuarios WHERE ativo = 1`);
        if (ativos <= 1) erros.push('não é possível desativar o último usuário ativo');
      }
    }
    if (req.body?.senha !== undefined) {
      const s = String(req.body.senha);
      if (s.length < 8) erros.push('senha precisa ter ao menos 8 caracteres');
      else set.senha_hash = await hashSenha(s);
    }

    if (erros.length) return res.status(422).json({ erro: 'validacao', detalhes: erros });
    if (Object.keys(set).length === 0) return res.json(semSenha(atual));

    const sql = Object.keys(set).map((c) => `${c} = :${c}`).join(', ');
    await q(`UPDATE usuarios SET ${sql} WHERE id = :id`, { ...set, id });
    const [novo] = await q(
      `SELECT id, nome, email, ativo, criado_em, ultimo_login FROM usuarios WHERE id = :id`,
      { id }
    );
    res.json(semSenha(novo));
  } catch (err) {
    next(err);
  }
});

/* DELETE /api/v1/usuarios/:id */
usuariosRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.usuario.id) return res.status(422).json({ erro: 'nao_pode_excluir_a_si_mesmo' });

    const [{ ativos }] = await q(`SELECT COUNT(*) AS ativos FROM usuarios WHERE ativo = 1`);
    const [alvo] = await q(`SELECT ativo FROM usuarios WHERE id = :id`, { id });
    if (!alvo) return res.status(404).json({ erro: 'nao_encontrado' });
    if (alvo.ativo && ativos <= 1) return res.status(422).json({ erro: 'nao_pode_excluir_o_ultimo_usuario_ativo' });

    await q(`DELETE FROM usuarios WHERE id = :id`, { id });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = { usuariosRouter };
