require('dotenv/config');

function obrigatorio(nome) {
  const v = process.env[nome];
  if (!v || !v.trim()) {
    console.error(`[config] variável de ambiente obrigatória ausente: ${nome} (ver .env.example)`);
    process.exit(1);
  }
  return v.trim();
}

function opcional(nome, padrao) {
  const v = process.env[nome];
  return v && v.trim() ? v.trim() : padrao;
}

const config = {
  port: Number(opcional('PORT', '8090')),

  db: {
    host: obrigatorio('DB_HOST'),
    port: Number(opcional('DB_PORT', '3306')),
    user: obrigatorio('DB_USER'),
    password: process.env.DB_PASSWORD ?? '',
    database: obrigatorio('DB_NAME'),
    ssl: opcional('DB_SSL', 'false').toLowerCase() === 'true' ? { rejectUnauthorized: false } : undefined
  },

  // Segredo para assinar os tokens de sessão da área de gerenciamento.
  jwtSecret: obrigatorio('JWT_SECRET'),

  corsOrigins: opcional('CORS_ORIGINS', '*'),

  avisoAntecedenciaDias: Number(opcional('AVISO_ANTECEDENCIA_DIAS', '15'))
};

module.exports = { config };
