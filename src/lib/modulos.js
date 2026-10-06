/* ---------------------------------------------------------------------------
   Catálogo de módulos e funcionalidades do GassFlow! (produto gassflow_bpm).
   Cada funcionalidade é vendida separadamente; a licença guarda quais foram
   contratadas (tabela licenca_funcionalidades) pelo código `modulo.funcionalidade`.

   Espelha o menu do app (BPM/frontend/src/app/app.ts). Para incluir uma
   funcionalidade nova basta acrescentá-la aqui — não precisa de migração.
   Não renomeie códigos já usados: licenças existentes os referenciam.
--------------------------------------------------------------------------- */
const MODULOS = [
  {
    codigo: 'bpm',
    nome: 'BPM',
    funcionalidades: [
      { codigo: 'produtos', nome: 'Produtos' },
      { codigo: 'clientes', nome: 'Clientes' },
      { codigo: 'fornecedores', nome: 'Fornecedores' },
      { codigo: 'naturezas', nome: 'Naturezas Financeiras' }
    ]
  },
  {
    codigo: 'fiscal',
    nome: 'Fiscal',
    funcionalidades: [
      { codigo: 'multa_juros', nome: 'Multa e Juros' },
      { codigo: 'documentos', nome: 'Transmissão de Documentos' }
    ]
  },
  {
    codigo: 'financeiro',
    nome: 'Financeiro',
    funcionalidades: [
      { codigo: 'adiantamento', nome: 'Solicitação de Adiantamento' },
      { codigo: 'prestacao_contas', nome: 'Prestação de Contas' },
      { codigo: 'cartao_corporativo', nome: 'Controle de Cartão Corporativo' },
      { codigo: 'integracao_serasa', nome: 'Integração Serasa' },
      { codigo: 'cockpit', nome: 'Cockpit Financeiro' }
    ]
  },
  {
    codigo: 'envios',
    nome: 'Envios',
    funcionalidades: [{ codigo: 'documentos', nome: 'Envio de Documentos' }]
  }
];

/** Produto cuja licença é vendida por funcionalidade. */
const PRODUTO_COM_MODULOS = 'gassflow_bpm';

const FUNCIONALIDADES = MODULOS.flatMap((m) => m.funcionalidades.map((f) => `${m.codigo}.${f.codigo}`));

/**
 * Valida a lista enviada pelo admin.
 * @returns {{ erro: string|null, codigos: string[] }} códigos únicos, na ordem do catálogo
 */
function validarFuncionalidades(valor) {
  if (!Array.isArray(valor)) return { erro: 'funcionalidades deve ser uma lista', codigos: [] };
  const recebidos = new Set(valor.map((v) => String(v)));
  const invalidos = [...recebidos].filter((c) => !FUNCIONALIDADES.includes(c));
  if (invalidos.length) return { erro: `funcionalidade(s) desconhecida(s): ${invalidos.join(', ')}`, codigos: [] };
  return { erro: null, codigos: FUNCIONALIDADES.filter((c) => recebidos.has(c)) };
}

/** ['bpm.produtos', 'fiscal.documentos'] → { bpm: ['produtos'], fiscal: ['documentos'] } */
function agruparPorModulo(codigos) {
  const out = {};
  for (const c of codigos) {
    const [modulo, func] = c.split('.');
    (out[modulo] ??= []).push(func);
  }
  return out;
}

module.exports = { MODULOS, PRODUTO_COM_MODULOS, FUNCIONALIDADES, validarFuncionalidades, agruparPorModulo };
