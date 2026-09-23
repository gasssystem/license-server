const { randomBytes } = require('node:crypto');

/* ---------------------------------------------------------------------------
   Chave de licença — formato DCF-XXXXX-XXXXX-XXXXX-XXXXX
   Alfabeto sem caracteres ambíguos (0/O, 1/I, etc.).
--------------------------------------------------------------------------- */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function gerarChave() {
  const bytes = randomBytes(20);
  let out = 'DCF';
  for (let i = 0; i < 20; i++) {
    if (i % 5 === 0) out += '-';
    out += ALFABETO[bytes[i] % ALFABETO.length];
  }
  return out;
}

/** Normaliza o que o cliente digitou/enviou para o formato canônico. */
function normalizarChave(valor) {
  const limpo = String(valor ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (limpo.length !== 23 || !limpo.startsWith('DCF')) return null;
  const corpo = limpo.slice(3);
  return `DCF-${corpo.slice(0, 5)}-${corpo.slice(5, 10)}-${corpo.slice(10, 15)}-${corpo.slice(15, 20)}`;
}

/* ---------------------------------------------------------------------------
   CNPJ — guarda formatado; valida dígitos verificadores.
--------------------------------------------------------------------------- */
function soDigitos(v) {
  return String(v ?? '').replace(/\D/g, '');
}

function formatarCnpj(v) {
  const d = soDigitos(v).padStart(14, '0').slice(-14);
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

function cnpjValido(v) {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (base) => {
    let soma = 0;
    let peso = base.length - 7;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const dv1 = calc(d.slice(0, 12));
  const dv2 = calc(d.slice(0, 12) + dv1);
  return d.endsWith(`${dv1}${dv2}`);
}

/* ---------------------------------------------------------------------------
   Avaliação da licença — função PURA (recebe a licença + "hoje").
   Devolve o veredito consumido pelo GassFlow!.
--------------------------------------------------------------------------- */
function dia(d) {
  const x = new Date(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}
function addDias(d, n) {
  const x = dia(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function diffDias(a, b) {
  return Math.round((dia(b) - dia(a)) / 86400000);
}
function fmt(d) {
  const x = dia(d);
  return `${String(x.getUTCDate()).padStart(2, '0')}/${String(x.getUTCMonth() + 1).padStart(2, '0')}/${x.getUTCFullYear()}`;
}

const PLANOS = ['full', 'anual', 'mensal'];

const PLANO_LABEL = { full: 'Full (perpétua)', anual: 'Anual', mensal: 'Mensal' };

/**
 * Data de fim sugerida a partir do início e do plano.
 * anual: +1 ano | mensal: +1 mês | full: null (perpétua, sem fim)
 */
function calcularFim(inicio, plano) {
  if (plano === 'full') return null;
  const d = dia(inicio);
  if (plano === 'anual') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else if (plano === 'mensal') d.setUTCMonth(d.getUTCMonth() + 1);
  else return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Estende `fimAtual` em `periodos` ciclos do plano (mantém a data de aniversário).
 * anual: +N anos | mensal: +N meses | full: null (não expira).
 */
function renovarFim(fimAtual, plano, periodos = 1) {
  if (plano === 'full' || !fimAtual) return null;
  const n = Math.max(1, Math.trunc(periodos) || 1);
  const d = dia(fimAtual);
  for (let i = 0; i < n; i++) {
    if (plano === 'anual') d.setUTCFullYear(d.getUTCFullYear() + 1);
    else d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * @param {{status:string, inicio:string, fim:string, tolerancia_dias:number, cliente_nome?:string}} lic
 * @param {{hoje?:Date, avisoAntecedenciaDias?:number}} [opts]
 */
function avaliarLicenca(lic, opts = {}) {
  const hoje = dia(opts.hoje ?? new Date());
  const antecedencia = opts.avisoAntecedenciaDias ?? 15;
  const inicio = dia(lic.inicio);
  const plano = lic.plano ?? 'anual';

  const base = {
    cliente: lic.cliente_nome ?? null,
    plano,
    expira_em: lic.fim ? dia(lic.fim).toISOString().slice(0, 10) : null
  };

  if (lic.status === 'cancelada') {
    return { ...base, valida: false, status: 'cancelada', bloquear: true, dias_restantes: 0, aviso: 'Licença cancelada. Fale com a Gass System.' };
  }
  if (lic.status === 'suspensa') {
    return { ...base, valida: false, status: 'suspensa', bloquear: true, dias_restantes: 0, aviso: 'Licença suspensa. Fale com a Gass System.' };
  }
  if (hoje < inicio) {
    return { ...base, valida: false, status: 'nao_iniciada', bloquear: true, dias_restantes: 0, aviso: `Licença válida a partir de ${fmt(inicio)}.` };
  }

  // Plano Full sem data de fim: nunca expira.
  if (!lic.fim) {
    return { ...base, valida: true, status: 'ativa', bloquear: false, dias_restantes: null, aviso: null };
  }

  const fim = dia(lic.fim);
  const toleranciaAte = addDias(fim, Number(lic.tolerancia_dias ?? 0));

  if (hoje <= fim) {
    const diasRestantes = diffDias(hoje, fim);
    const aviso =
      diasRestantes <= antecedencia
        ? `Sua licença do GassFlow! BPM expira em ${diasRestantes} dia(s) (${fmt(fim)}). Renove com a Gass System.`
        : null;
    return { ...base, valida: true, status: 'ativa', bloquear: false, dias_restantes: diasRestantes, aviso };
  }

  if (hoje <= toleranciaAte) {
    const restanteTolerancia = diffDias(hoje, toleranciaAte);
    return {
      ...base,
      valida: true,
      status: 'tolerancia',
      bloquear: false,
      dias_restantes: restanteTolerancia,
      aviso: `Sua licença expirou em ${fmt(fim)}. Período de tolerância: o acesso será bloqueado em ${restanteTolerancia} dia(s). Renove com a Gass System.`
    };
  }

  return {
    ...base,
    valida: false,
    status: 'expirada',
    bloquear: true,
    dias_restantes: 0,
    aviso: `Sua licença do GassFlow! BPM expirou em ${fmt(fim)}. Renove com a Gass System para voltar a usar.`
  };
}

module.exports = {
  gerarChave,
  normalizarChave,
  soDigitos,
  formatarCnpj,
  cnpjValido,
  PLANOS,
  PLANO_LABEL,
  calcularFim,
  renovarFim,
  avaliarLicenca
};
