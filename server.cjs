/*
 * Ponto de entrada para o loader do LiteSpeed/Passenger (lsnode.js), que faz
 * `require()` síncrono do arquivo de inicialização e espera receber o app.
 * Repassa o app do src/index.js (que também chama app.listen() — interceptado
 * pelo lsnode em produção, TCP real no `npm start`).
 */
module.exports = require('./src/index.js');
