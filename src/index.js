const path = require('node:path');

const express = require('express');
const cors = require('cors');

const { config } = require('./config.js');
const { pingDb } = require('./db.js');
const { validarRouter } = require('./routes/validar.js');
const { adminRouter } = require('./routes/admin.js');
const { authRouter } = require('./routes/auth.js');
const { usuariosRouter } = require('./routes/usuarios.js');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '32kb' }));
app.use(
  cors({
    origin: config.corsOrigins === '*' ? true : config.corsOrigins.split(',').map((o) => o.trim())
  })
);

// Tela de gerenciamento (protegida por login via JS na própria página).
app.use('/admin', express.static(path.join(__dirname, '..', 'public')));

app.get('/health', async (_req, res) => {
  try {
    await pingDb();
    res.json({ ok: true, db: 'up' });
  } catch (err) {
    res.status(503).json({ ok: false, db: 'down', erro: err.message });
  }
});

app.use('/api/v1/licencas', validarRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/usuarios', usuariosRouter);
app.use('/api/v1/admin', adminRouter);

app.use((_req, res) => res.status(404).json({ erro: 'rota_nao_encontrada' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[erro]', err);
  res.status(500).json({ erro: 'interno' });
});

// Sobe o servidor. Em produção com LiteSpeed/Passenger, o loader intercepta o
// listen(); no `npm start` é um listen TCP real. process.env.PORT pode vir como
// caminho de socket (string) — repassa como veio.
const ouvir = /^\d+$/.test(process.env.PORT ?? '') ? Number(process.env.PORT) : (process.env.PORT || config.port);
app.listen(ouvir, () => {
  console.log(`GassFlow! license-server ouvindo em ${ouvir}`);
  pingDb()
    .then(() => console.log('  MySQL: conectado'))
    .catch((e) => console.error('  MySQL: FALHA —', e.message));
});

module.exports = app;
