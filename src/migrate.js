const { readdir, readFile } = require('node:fs/promises');
const path = require('node:path');

const mysql = require('mysql2/promise');

const { config } = require('./config.js');

const sqlDir = path.join(__dirname, '..', 'sql');

async function main() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    ssl: config.db.ssl,
    multipleStatements: true
  });

  await conn.query(`
    CREATE TABLE IF NOT EXISTS _migracoes (
      arquivo     VARCHAR(190) NOT NULL,
      aplicada_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (arquivo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [aplicadas] = await conn.query(`SELECT arquivo FROM _migracoes`);
  const jaAplicadas = new Set(aplicadas.map((r) => r.arquivo));

  const arquivos = (await readdir(sqlDir)).filter((f) => f.endsWith('.sql')).sort();
  let novas = 0;
  for (const arquivo of arquivos) {
    if (jaAplicadas.has(arquivo)) {
      console.log(`- ${arquivo} (já aplicada)`);
      continue;
    }
    const sql = await readFile(path.join(sqlDir, arquivo), 'utf8');
    process.stdout.write(`> ${arquivo} ... `);
    await conn.query(sql);
    await conn.query(`INSERT INTO _migracoes (arquivo) VALUES (?)`, [arquivo]);
    console.log('ok');
    novas++;
  }

  await conn.end();
  console.log(novas ? `migração concluída (${novas} nova(s)).` : 'nada a aplicar.');
}

main().catch((err) => {
  console.error('Falha na migração:', err);
  process.exit(1);
});
