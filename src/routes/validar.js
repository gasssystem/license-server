const { Router } = require('express');

const { config } = require('../config.js');
const { q } = require('../db.js');
const { avaliarLicenca, cnpjValido, formatarCnpj, normalizarChave, soDigitos } = require('../lib/licenca.js');
const { agruparPorModulo } = require('../lib/modulos.js');

/**
 * Registra/atualiza o CNPJ como possível cliente (lead). Best-effort:
 * qualquer falha aqui é logada e NUNCA afeta a resposta da validação.
 */
function registrarLead({ cnpj, chave, status, coberto, instancia, versao, ip }) {
  if (!cnpjValido(cnpj)) return;
  q(
    `INSERT INTO leads (cnpj, chave_informada, ultimo_status, ultimo_coberto, instancia, versao_app, ip)
     VALUES (:cnpj, :chave, :status, :coberto, :instancia, :versao, :ip)
     ON DUPLICATE KEY UPDATE
       ultima_consulta = NOW(),
       total_consultas = total_consultas + 1,
       chave_informada = COALESCE(VALUES(chave_informada), chave_informada),
       ultimo_status   = VALUES(ultimo_status),
       ultimo_coberto  = VALUES(ultimo_coberto),
       instancia       = COALESCE(VALUES(instancia), instancia),
       versao_app      = COALESCE(VALUES(versao_app), versao_app),
       ip              = COALESCE(VALUES(ip), ip)`,
    {
      cnpj: formatarCnpj(cnpj),
      chave: chave ?? null,
      status: status ?? null,
      coberto: coberto == null ? null : coberto ? 1 : 0,
      instancia: instancia && instancia !== 'desconhecida' ? instancia : null,
      versao: versao ?? null,
      ip: ip || null
    }
  ).catch((err) => console.error('[validar] falha ao registrar lead:', err.message));
}

const validarRouter = Router();

// Janela de cortesia para um CNPJ que ainda não está cadastrado na licença:
// o acesso fica liberado por N dias a partir do 1º contato (leads.primeira_consulta),
// dando tempo de a Gass System incluir o CNPJ no grupo antes de bloquear.
const GRACE_CNPJ_DIAS = 7;

/**
 * POST /api/v1/licencas/validar
 * Rota PÚBLICA — chamada por cada instalação do GassFlow! BPM ao abrir o app.
 * body: { chave: string, instancia?: string, versao?: string }
 *
 * Resposta (200 sempre — o "erro" é de negócio, no corpo):
 * {
 *   valida: boolean,           // pode usar o app agora?
 *   bloquear: boolean,         // deve mostrar tela de bloqueio?
 *   status: 'ativa'|'tolerancia'|'expirada'|'suspensa'|'cancelada'|'nao_iniciada'
 *          |'nao_encontrada'|'cnpj_em_avaliacao'|'cnpj_nao_coberto',
 *   aviso: string|null,        // faixa de aviso a exibir
 *   cliente: string|null,
 *   expira_em: 'YYYY-MM-DD'|null,
 *   dias_restantes: number,
 *   cnpj_coberto: boolean|null, // null quando a instalação não enviou o CNPJ
 *   funcionalidades: string[],  // liberadas agora: ['bpm.produtos', 'fiscal.documentos', ...]
 *   modulos: { [modulo]: string[] }, // as mesmas, agrupadas: { bpm: ['produtos'], fiscal: ['documentos'] }
 *   light: boolean // true → o app esconde do menu o que não está em funcionalidades (senão mostra com cadeado)
 * }
 *
 * funcionalidades/modulos vêm vazios quando a licença não está válida (valida=false).
 *
 * CNPJ não cadastrado na licença: enquanto a licença estiver válida, o acesso
 * fica liberado por GRACE_CNPJ_DIAS dias a partir do 1º contato (status
 * 'cnpj_em_avaliacao'); depois disso passa a bloquear ('cnpj_nao_coberto').
 */
validarRouter.post('/validar', async (req, res, next) => {
  const agora = () => new Date().toISOString();

  // Dados da instalação — usados no check-in e no registro de possível cliente.
  const instancia = String(req.body?.instancia ?? '').slice(0, 160).trim() || 'desconhecida';
  const versao = String(req.body?.versao ?? '').slice(0, 40).trim() || null;
  const ip = (req.headers['x-forwarded-for']?.split(',')[0] ?? req.socket.remoteAddress ?? '').slice(0, 45);
  const cnpjInformado = soDigitos(req.body?.cnpj);

  try {
    const chave = normalizarChave(req.body?.chave);
    if (!chave) {
      registrarLead({ cnpj: cnpjInformado, chave: null, status: 'nao_encontrada', coberto: null, instancia, versao, ip });
      return res.json({
        valida: false,
        bloquear: true,
        status: 'nao_encontrada',
        aviso: 'Chave de licença inválida. Verifique em Configurações do GassFlow! BPM.',
        cliente: null,
        expira_em: null,
        dias_restantes: 0,
        funcionalidades: [],
        modulos: {},
        light: false,
        verificado_em: agora()
      });
    }

    const [lic] = await q(
      `SELECT id, cliente_nome, cliente_cnpj, produto, plano, light, status, inicio, fim, tolerancia_dias FROM licencas WHERE chave = :chave`,
      { chave }
    );

    if (!lic) {
      registrarLead({ cnpj: cnpjInformado, chave, status: 'nao_encontrada', coberto: null, instancia, versao, ip });
      return res.json({
        valida: false,
        bloquear: true,
        status: 'nao_encontrada',
        aviso: 'Licença não encontrada. Fale com a Gass System.',
        cliente: null,
        expira_em: null,
        dias_restantes: 0,
        funcionalidades: [],
        modulos: {},
        light: false,
        verificado_em: agora()
      });
    }

    const veredito = avaliarLicenca(lic, { avisoAntecedenciaDias: config.avisoAntecedenciaDias });

    // Cobertura de CNPJ: a licença cobre o CNPJ contratante + o grupo (licenca_cnpjs).
    // Só é avaliada quando a instalação envia o próprio CNPJ.
    if (cnpjInformado) {
      const grupo = await q(`SELECT cnpj FROM licenca_cnpjs WHERE licenca_id = :id`, { id: lic.id });
      const cobertos = new Set([lic.cliente_cnpj, ...grupo.map((g) => g.cnpj)].map(soDigitos));
      veredito.cnpj_coberto = cobertos.has(cnpjInformado);
      if (!veredito.cnpj_coberto) {
        // CNPJ não cadastrado nesta licença. Enquanto a licença em si está válida,
        // damos GRACE_CNPJ_DIAS dias de cortesia contados do 1º contato deste CNPJ.
        const cnpjFmt = formatarCnpj(cnpjInformado);
        const [lead] = await q(
          `SELECT GREATEST(0, TIMESTAMPDIFF(DAY, primeira_consulta, NOW())) AS dias
           FROM leads WHERE cnpj = :cnpj`,
          { cnpj: cnpjFmt }
        );
        const diasUsados = lead ? Number(lead.dias) : 0; // sem lead ainda = 1º contato
        const diasRestantes = GRACE_CNPJ_DIAS - diasUsados;

        if (veredito.valida && diasRestantes > 0) {
          veredito.status = 'cnpj_em_avaliacao';
          veredito.dias_restantes = diasRestantes;
          veredito.aviso =
            `Este CNPJ ainda não está cadastrado nesta licença. Acesso liberado por mais ` +
            `${diasRestantes} dia(s) — regularize com a Gass System.`;
          // valida/bloquear seguem os da licença (liberado)
        } else if (veredito.valida) {
          veredito.valida = false;
          veredito.bloquear = true;
          veredito.status = 'cnpj_nao_coberto';
          veredito.dias_restantes = 0;
          veredito.aviso = 'Este CNPJ não está coberto por esta licença. Fale com a Gass System.';
        }
        // se a licença já estava bloqueada (suspensa/expirada), mantém aquele veredito
      }
    } else {
      veredito.cnpj_coberto = null;
    }

    // Funcionalidades contratadas — só liberadas enquanto a licença vale.
    const funcs = veredito.valida
      ? await q(`SELECT codigo FROM licenca_funcionalidades WHERE licenca_id = :id ORDER BY codigo`, { id: lic.id })
      : [];
    veredito.funcionalidades = funcs.map((f) => f.codigo);
    veredito.modulos = agruparPorModulo(veredito.funcionalidades);
    veredito.light = lic.light === 1 || lic.light === true;

    // Carimbo do servidor — o cliente (Protheus) usa para saber quando revalidar
    // e não depender só do próprio relógio.
    veredito.verificado_em = agora();

    // Registra o "check-in" desta instalação (best-effort — não derruba a resposta).
    q(
      `INSERT INTO licenca_ativacoes (licenca_id, instancia, versao_app, ip)
       VALUES (:licenca_id, :instancia, :versao, :ip)
       ON DUPLICATE KEY UPDATE ultimo_check = NOW(), total_checks = total_checks + 1,
                               versao_app = VALUES(versao_app), ip = VALUES(ip)`,
      { licenca_id: lic.id, instancia, versao, ip }
    ).catch(err => console.error('[validar] falha ao registrar ativação:', err.message));

    // Registra o CNPJ como possível cliente (best-effort).
    if (cnpjInformado) {
      registrarLead({
        cnpj: cnpjInformado,
        chave,
        status: veredito.status,
        coberto: veredito.cnpj_coberto,
        instancia,
        versao,
        ip
      });
    }

    res.json(veredito);
  } catch (err) {
    next(err);
  }
});

module.exports = { validarRouter };
