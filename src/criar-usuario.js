// Cria (ou reativa/atualiza a senha de) um usuário da área de gerenciamento.
//
//   node src/criar-usuario.js --nome "Sergio" --email sergio@x.com --senha "..."
//   SEED_NOME=... SEED_EMAIL=... SEED_SENHA=... node src/criar-usuario.js
//   node src/criar-usuario.js            (pergunta os dados no terminal)

const { createInterface } = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

const { pool, q } = require('./db.js');
const { hashSenha } = require('./lib/senha.js');

function arg(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  const perguntar = (texto, valor) => (valor ? Promise.resolve(valor) : rl.question(texto));

  try {
    const nome = (await perguntar('Nome: ', arg('nome') ?? process.env.SEED_NOME)).trim();
    const email = (await perguntar('E-mail: ', arg('email') ?? process.env.SEED_EMAIL)).trim().toLowerCase();
    const senha = await perguntar('Senha (mín. 8): ', arg('senha') ?? process.env.SEED_SENHA);

    if (nome.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || String(senha).length < 8) {
      console.error('Dados inválidos (nome, e-mail e senha de 8+ caracteres).');
      process.exitCode = 1;
      return;
    }

    const senha_hash = await hashSenha(String(senha));
    await q(
      `INSERT INTO usuarios (nome, email, senha_hash, ativo)
       VALUES (:nome, :email, :senha_hash, 1)
       ON DUPLICATE KEY UPDATE nome = VALUES(nome), senha_hash = VALUES(senha_hash), ativo = 1`,
      { nome, email, senha_hash }
    );

    console.log(`OK — usuário "${email}" pronto para acessar a área de gerenciamento.`);
  } catch (err) {
    console.error('Falha:', err.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await pool.end();
  }
}

main();
