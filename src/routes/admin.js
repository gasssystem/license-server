const { Router } = require('express');

const { config } = require('../config.js');
const { q } = require('../db.js');
const { exigirLogin } = require('../auth.js');
const {
  avaliarLicenca,
  calcularFim,
  cnpjValido,
  formatarCnpj,
  gerarChave,
  normalizarChave,
  PLANOS,
  PRODUTOS,
  renovarFim,
  soDigitos
} = require('../lib/licenca.js');

const adminRouter = Router();
adminRouter.use(exigirLogin);

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function validarPayload(body, { parcial = false } = {}) {
  const erros = [];
  const out = {};

  const exige = (campo) => parcial === false || body[campo] !== undefined;

  if (exige('cliente_nome')) {
    const v = String(body.cliente_nome ?? '').trim();
    if (v.length < 2) erros.push('cliente_nome obrigatório');
    else out.cliente_nome = v.slice(0, 180);
  }
  if (exige('cliente_cnpj')) {
    if (!cnpjValido(body.cliente_cnpj)) erros.push('cliente_cnpj inválido');
    else out.cliente_cnpj = formatarCnpj(body.cliente_cnpj);
  }
  if (exige('plano')) {
    if (!PLANOS.includes(body.plano)) erros.push(`plano deve ser ${PLANOS.join(' / ')}`);
    else out.plano = body.plano;
  }
  if (exige('produto')) {
    if (!PRODUTOS.includes(body.produto)) erros.push(`produto deve ser ${PRODUTOS.join(' / ')}`);
    else out.produto = body.produto;
  }
  if (exige('inicio')) {
    if (!DATA_RE.test(String(body.inicio))) erros.push('inicio deve ser YYYY-MM-DD');
    else out.inicio = body.inicio;
  }
  // fim: obrigatório para anual/mensal; opcional (pode ser null = perpétua) para full.
  if (body.fim === null || body.fim === '') {
    out.fim = null;
  } else if (body.fim !== undefined) {
    if (!DATA_RE.test(String(body.fim))) erros.push('fim deve ser YYYY-MM-DD');
    else out.fim = body.fim;
  }
  if (out.inicio && out.fim && out.fim < out.inicio) erros.push('fim não pode ser antes de inicio');

  if (body.tolerancia_dias !== undefined) {
    const n = Number(body.tolerancia_dias);
    if (!Number.isInteger(n) || n < 0 || n > 365) erros.push('tolerancia_dias deve ser 0..365');
    else out.tolerancia_dias = n;
  }
  if (body.status !== undefined) {
    if (!['ativa', 'suspensa', 'cancelada'].includes(body.status)) erros.push('status inválido');
    else out.status = body.status;
  }
  if (body.observacao !== undefined) {
    out.observacao = String(body.observacao ?? '').trim().slice(0, 500) || null;
  }

  return { erros, out };
}

async function carregar(id) {
  const [lic] = await q(`SELECT * FROM licencas WHERE id = :id`, { id });
  if (!lic) return null;
  const [{ total }] = await q(
    `SELECT COUNT(*) AS total FROM licenca_ativacoes WHERE licenca_id = :id`,
    { id }
  );
  const [ultima] = await q(
    `SELECT instancia, versao_app, ultimo_check FROM licenca_ativacoes
     WHERE licenca_id = :id ORDER BY ultimo_check DESC LIMIT 1`,
    { id }
  );
  const grupo = await q(
    `SELECT id, cnpj, razao_social FROM licenca_cnpjs
     WHERE licenca_id = :id ORDER BY razao_social IS NULL, razao_social, cnpj`,
    { id }
  );
  return {
    ...lic,
    veredito: avaliarLicenca(lic, { avisoAntecedenciaDias: config.avisoAntecedenciaDias }),
    ativacoes: total,
    ultima_ativacao: ultima ?? null,
    grupo
  };
}

/* GET /api/v1/admin/licencas?status=&cnpj=&q= */
adminRouter.get('/licencas', async (req, res, next) => {
  try {
    const where = [];
    const params = {};
    if (req.query.status) {
      where.push('status = :status');
      params.status = req.query.status;
    }
    if (req.query.cnpj) {
      const soDig = `REPLACE(REPLACE(REPLACE(%s, ".", ""), "/", ""), "-", "")`;
      // casa o CNPJ contratante OU qualquer CNPJ do grupo da licença
      where.push(`(${soDig.replace('%s', 'cliente_cnpj')} LIKE :cnpj
        OR EXISTS (SELECT 1 FROM licenca_cnpjs g
                   WHERE g.licenca_id = licencas.id
                     AND ${soDig.replace('%s', 'g.cnpj')} LIKE :cnpj))`);
      params.cnpj = `%${soDigitos(req.query.cnpj)}%`;
    }
    if (req.query.q) {
      where.push('(cliente_nome LIKE :q OR chave LIKE :q)');
      params.q = `%${String(req.query.q).trim()}%`;
    }
    const sql = `SELECT licencas.*,
                        (SELECT COUNT(*) FROM licenca_cnpjs g WHERE g.licenca_id = licencas.id) AS grupo_total
                 FROM licencas ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY criado_em DESC LIMIT 500`;
    const rows = await q(sql, params);
    res.json(
      rows.map((lic) => ({
        ...lic,
        veredito: avaliarLicenca(lic, { avisoAntecedenciaDias: config.avisoAntecedenciaDias })
      }))
    );
  } catch (err) {
    next(err);
  }
});

/* GET /api/v1/admin/licencas/:id */
adminRouter.get('/licencas/:id', async (req, res, next) => {
  try {
    const lic = await carregar(req.params.id);
    if (!lic) return res.status(404).json({ erro: 'nao_encontrada' });
    res.json(lic);
  } catch (err) {
    next(err);
  }
});

/* GET /api/v1/admin/licencas/:id/ativacoes */
adminRouter.get('/licencas/:id/ativacoes', async (req, res, next) => {
  try {
    const rows = await q(
      `SELECT instancia, versao_app, ip, primeiro_check, ultimo_check, total_checks
       FROM licenca_ativacoes WHERE licenca_id = :id ORDER BY ultimo_check DESC`,
      { id: req.params.id }
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* POST /api/v1/admin/licencas */
adminRouter.post('/licencas', async (req, res, next) => {
  try {
    const { erros, out } = validarPayload(req.body ?? {});

    // fim: calcula a partir do plano quando não veio; exige para anual/mensal.
    if (out.fim === undefined) {
      out.fim = out.plano === 'full' ? null : calcularFim(out.inicio, out.plano);
    }
    if (out.plano !== 'full' && !out.fim) erros.push('fim obrigatório para plano anual/mensal');
    if (erros.length) return res.status(422).json({ erro: 'validacao', detalhes: erros });

    let chave = normalizarChave(req.body?.chave) ?? gerarChave();
    // garante unicidade (raríssimo colidir, mas...)
    for (let i = 0; i < 5; i++) {
      const [existe] = await q(`SELECT id FROM licencas WHERE chave = :chave`, { chave });
      if (!existe) break;
      chave = gerarChave();
    }

    const dados = {
      chave,
      produto: out.produto ?? 'gassflow_bpm',
      plano: out.plano ?? 'anual',
      status: out.status ?? 'ativa',
      tolerancia_dias: out.tolerancia_dias ?? 7,
      observacao: out.observacao ?? null,
      ...out
    };
    const result = await q(
      `INSERT INTO licencas (chave, cliente_nome, cliente_cnpj, plano, status, inicio, fim, tolerancia_dias, observacao)
       VALUES (:chave, :cliente_nome, :cliente_cnpj, :plano, :status, :inicio, :fim, :tolerancia_dias, :observacao)`,
      dados
    );
    res.status(201).json(await carregar(result.insertId));
  } catch (err) {
    next(err);
  }
});

/* PATCH /api/v1/admin/licencas/:id */
adminRouter.patch('/licencas/:id', async (req, res, next) => {
  try {
    const atual = await carregar(req.params.id);
    if (!atual) return res.status(404).json({ erro: 'nao_encontrada' });

    const { erros, out } = validarPayload(req.body ?? {}, { parcial: true });

    // Se mudou o plano e não veio 'fim' explícito, recalcula a partir do plano novo.
    if (out.plano !== undefined && !('fim' in out)) {
      out.fim = out.plano === 'full' ? null : calcularFim(out.inicio ?? atual.inicio, out.plano);
    }

    // coerência com os valores efetivos
    const planoEf = out.plano ?? atual.plano;
    const inicioEf = out.inicio ?? atual.inicio;
    const fimEf = 'fim' in out ? out.fim : atual.fim;
    if (planoEf !== 'full' && !fimEf) erros.push('fim obrigatório para plano anual/mensal');
    if (fimEf && fimEf < inicioEf) erros.push('fim não pode ser antes de inicio');
    if (erros.length) return res.status(422).json({ erro: 'validacao', detalhes: erros });

    const campos = Object.keys(out);
    if (campos.length === 0) return res.json(atual);

    const setSql = campos.map((c) => `${c} = :${c}`).join(', ');
    await q(`UPDATE licencas SET ${setSql} WHERE id = :id`, { ...out, id: req.params.id });
    res.json(await carregar(req.params.id));
  } catch (err) {
    next(err);
  }
});

/* POST /api/v1/admin/licencas/:id/renovar
   Estende a vigência da licença de um cliente conforme o plano.
   body: { periodos?: number (1..60, padrão 1), ate?: 'YYYY-MM-DD' (define o fim manualmente) }
   - plano full não expira → 422
   - base da renovação: o maior valor entre o fim atual e hoje (renovação no prazo mantém
     o aniversário; renovação atrasada estende a partir de hoje)
   - reativa a licença (status = 'ativa') */
adminRouter.post('/licencas/:id/renovar', async (req, res, next) => {
  try {
    const atual = await carregar(req.params.id);
    if (!atual) return res.status(404).json({ erro: 'nao_encontrada' });
    if (atual.plano === 'full') {
      return res.status(422).json({ erro: 'validacao', detalhes: ['licença Full é perpétua — não precisa renovar'] });
    }

    const hoje = new Date().toISOString().slice(0, 10);
    let novoFim;

    if (req.body?.ate !== undefined && req.body.ate !== null && req.body.ate !== '') {
      if (!DATA_RE.test(String(req.body.ate))) {
        return res.status(422).json({ erro: 'validacao', detalhes: ['ate deve ser YYYY-MM-DD'] });
      }
      novoFim = String(req.body.ate);
      if (novoFim <= atual.inicio) {
        return res.status(422).json({ erro: 'validacao', detalhes: ['ate não pode ser antes do início'] });
      }
    } else {
      const periodos = Number(req.body?.periodos ?? 1);
      if (!Number.isInteger(periodos) || periodos < 1 || periodos > 60) {
        return res.status(422).json({ erro: 'validacao', detalhes: ['periodos deve ser 1..60'] });
      }
      const base = atual.fim && atual.fim > hoje ? atual.fim : hoje;
      novoFim = renovarFim(base, atual.plano, periodos);
    }

    await q(
      `UPDATE licencas SET fim = :fim, status = 'ativa' WHERE id = :id`,
      { fim: novoFim, id: req.params.id }
    );
    res.json(await carregar(req.params.id));
  } catch (err) {
    next(err);
  }
});

/* POST /api/v1/admin/licencas/:id/plano
   Troca o plano de uma licença e reajusta a vigência.
   body: { plano: 'full' | 'anual' | 'mensal' }
   - full  → fim = null (perpétua)
   - anual/mensal → fim = base + 1 ciclo, onde base = maior valor entre o fim atual e hoje
     (preserva o tempo restante quando ainda está vigente; parte de hoje quando já venceu
      ou quando vinha de um plano Full) */
adminRouter.post('/licencas/:id/plano', async (req, res, next) => {
  try {
    const atual = await carregar(req.params.id);
    if (!atual) return res.status(404).json({ erro: 'nao_encontrada' });

    const plano = req.body?.plano;
    if (!PLANOS.includes(plano)) {
      return res.status(422).json({ erro: 'validacao', detalhes: [`plano deve ser ${PLANOS.join(' / ')}`] });
    }
    if (plano === atual.plano) {
      return res.status(422).json({ erro: 'validacao', detalhes: ['a licença já está neste plano'] });
    }

    let novoFim = null;
    if (plano !== 'full') {
      const hoje = new Date().toISOString().slice(0, 10);
      const base = atual.fim && atual.fim > hoje ? atual.fim : hoje;
      novoFim = calcularFim(base, plano);
    }

    await q(
      `UPDATE licencas SET plano = :plano, fim = :fim WHERE id = :id`,
      { plano, fim: novoFim, id: req.params.id }
    );
    res.json(await carregar(req.params.id));
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------------------
   Grupo de CNPJs cobertos pela licença (além do CNPJ contratante).
   -------------------------------------------------------------------------- */

/* GET /api/v1/admin/licencas/:id/cnpjs */
adminRouter.get('/licencas/:id/cnpjs', async (req, res, next) => {
  try {
    const [lic] = await q(`SELECT id FROM licencas WHERE id = :id`, { id: req.params.id });
    if (!lic) return res.status(404).json({ erro: 'nao_encontrada' });
    const rows = await q(
      `SELECT id, cnpj, razao_social, criado_em FROM licenca_cnpjs
       WHERE licenca_id = :id ORDER BY razao_social IS NULL, razao_social, cnpj`,
      { id: req.params.id }
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* POST /api/v1/admin/licencas/:id/cnpjs   body: { cnpj, razao_social? } */
adminRouter.post('/licencas/:id/cnpjs', async (req, res, next) => {
  try {
    const [lic] = await q(`SELECT id, cliente_cnpj FROM licencas WHERE id = :id`, { id: req.params.id });
    if (!lic) return res.status(404).json({ erro: 'nao_encontrada' });

    if (!cnpjValido(req.body?.cnpj)) {
      return res.status(422).json({ erro: 'validacao', detalhes: ['cnpj inválido'] });
    }
    const cnpj = formatarCnpj(req.body.cnpj);
    if (soDigitos(cnpj) === soDigitos(lic.cliente_cnpj)) {
      return res.status(422).json({ erro: 'validacao', detalhes: ['este CNPJ já é o contratante da licença'] });
    }
    const razao_social = String(req.body?.razao_social ?? '').trim().slice(0, 180) || null;

    try {
      await q(
        `INSERT INTO licenca_cnpjs (licenca_id, cnpj, razao_social)
         VALUES (:id, :cnpj, :razao_social)`,
        { id: req.params.id, cnpj, razao_social }
      );
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ erro: 'duplicado', detalhes: ['este CNPJ já está no grupo'] });
      }
      throw e;
    }
    res.status(201).json(await carregar(req.params.id));
  } catch (err) {
    next(err);
  }
});

/* DELETE /api/v1/admin/licencas/:id/cnpjs/:cnpjId */
adminRouter.delete('/licencas/:id/cnpjs/:cnpjId', async (req, res, next) => {
  try {
    const result = await q(
      `DELETE FROM licenca_cnpjs WHERE id = :cnpjId AND licenca_id = :id`,
      { cnpjId: req.params.cnpjId, id: req.params.id }
    );
    if (result.affectedRows === 0) return res.status(404).json({ erro: 'nao_encontrada' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------------------
   Possíveis clientes (leads) — CNPJs que chamaram /validar.
   -------------------------------------------------------------------------- */

const LEAD_SITUACOES = ['novo', 'em_contato', 'cliente', 'descartado'];

/* GET /api/v1/admin/leads?situacao=&q= */
adminRouter.get('/leads', async (req, res, next) => {
  try {
    const where = [];
    const params = {};
    if (req.query.situacao && LEAD_SITUACOES.includes(req.query.situacao)) {
      where.push('situacao = :situacao');
      params.situacao = req.query.situacao;
    }
    if (req.query.q) {
      where.push('(cnpj LIKE :q OR razao_social LIKE :q OR chave_informada LIKE :q)');
      params.q = `%${String(req.query.q).trim()}%`;
    }
    const rows = await q(
      `SELECT * FROM leads ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY ultima_consulta DESC LIMIT 500`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* GET /api/v1/admin/leads/resumo — números p/ o painel de monitoramento */
adminRouter.get('/leads/resumo', async (_req, res, next) => {
  try {
    const [totais] = await q(
      `SELECT
         COUNT(*)                                                        AS total,
         CAST(COALESCE(SUM(situacao = 'novo'), 0)        AS UNSIGNED)     AS novo,
         CAST(COALESCE(SUM(situacao = 'em_contato'), 0)  AS UNSIGNED)     AS em_contato,
         CAST(COALESCE(SUM(situacao = 'cliente'), 0)     AS UNSIGNED)     AS cliente,
         CAST(COALESCE(SUM(situacao = 'descartado'), 0)  AS UNSIGNED)     AS descartado,
         CAST(COALESCE(SUM(ultimo_coberto = 1), 0)       AS UNSIGNED)     AS cobertos,
         CAST(COALESCE(SUM(ultimo_coberto = 0), 0)       AS UNSIGNED)     AS fora,
         CAST(COALESCE(SUM(ultimo_coberto IS NULL), 0)   AS UNSIGNED)     AS sem_cnpj,
         CAST(COALESCE(SUM(primeira_consulta >= NOW() - INTERVAL 7 DAY), 0)  AS UNSIGNED) AS novos_7d,
         CAST(COALESCE(SUM(primeira_consulta >= NOW() - INTERVAL 30 DAY), 0) AS UNSIGNED) AS novos_30d,
         CAST(COALESCE(SUM(ultima_consulta   >= NOW() - INTERVAL 7 DAY), 0)  AS UNSIGNED) AS ativos_7d,
         CAST(COALESCE(SUM(total_consultas), 0) AS UNSIGNED)             AS consultas_total
       FROM leads`,
      {}
    );
    const por_status = await q(
      `SELECT COALESCE(ultimo_status, '—') AS status, COUNT(*) AS n
       FROM leads GROUP BY ultimo_status ORDER BY n DESC`,
      {}
    );
    const serie_novos = await q(
      `SELECT DATE(primeira_consulta) AS dia, COUNT(*) AS n
       FROM leads WHERE primeira_consulta >= CURDATE() - INTERVAL 29 DAY
       GROUP BY DATE(primeira_consulta) ORDER BY dia`,
      {}
    );
    const top_consultas = await q(
      `SELECT cnpj, razao_social, situacao, total_consultas, ultimo_status, ultima_consulta
       FROM leads ORDER BY total_consultas DESC, ultima_consulta DESC LIMIT 10`,
      {}
    );
    res.json({ ...totais, por_status, serie_novos, top_consultas });
  } catch (err) {
    next(err);
  }
});

/* PATCH /api/v1/admin/leads/:id   body: { situacao?, razao_social?, observacao? } */
adminRouter.patch('/leads/:id', async (req, res, next) => {
  try {
    const [lead] = await q(`SELECT id FROM leads WHERE id = :id`, { id: req.params.id });
    if (!lead) return res.status(404).json({ erro: 'nao_encontrada' });

    const out = {};
    const erros = [];
    if (req.body?.situacao !== undefined) {
      if (!LEAD_SITUACOES.includes(req.body.situacao)) erros.push(`situacao deve ser ${LEAD_SITUACOES.join(' / ')}`);
      else out.situacao = req.body.situacao;
    }
    if (req.body?.razao_social !== undefined) {
      out.razao_social = String(req.body.razao_social ?? '').trim().slice(0, 180) || null;
    }
    if (req.body?.observacao !== undefined) {
      out.observacao = String(req.body.observacao ?? '').trim().slice(0, 500) || null;
    }
    if (erros.length) return res.status(422).json({ erro: 'validacao', detalhes: erros });

    const campos = Object.keys(out);
    if (campos.length === 0) {
      const [atual] = await q(`SELECT * FROM leads WHERE id = :id`, { id: req.params.id });
      return res.json(atual);
    }
    await q(
      `UPDATE leads SET ${campos.map((c) => `${c} = :${c}`).join(', ')} WHERE id = :id`,
      { ...out, id: req.params.id }
    );
    const [atual] = await q(`SELECT * FROM leads WHERE id = :id`, { id: req.params.id });
    res.json(atual);
  } catch (err) {
    next(err);
  }
});

/* DELETE /api/v1/admin/leads/:id */
adminRouter.delete('/leads/:id', async (req, res, next) => {
  try {
    const result = await q(`DELETE FROM leads WHERE id = :id`, { id: req.params.id });
    if (result.affectedRows === 0) return res.status(404).json({ erro: 'nao_encontrada' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/* DELETE /api/v1/admin/licencas/:id  (apaga de vez; para desativar sem perder histórico, use PATCH status=cancelada) */
adminRouter.delete('/licencas/:id', async (req, res, next) => {
  try {
    const result = await q(`DELETE FROM licencas WHERE id = :id`, { id: req.params.id });
    if (result.affectedRows === 0) return res.status(404).json({ erro: 'nao_encontrada' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = { adminRouter };
