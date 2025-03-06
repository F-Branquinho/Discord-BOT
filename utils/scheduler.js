const moment = require('moment');
const { verificarAniversarios } = require('./birthdays');

/**
 * Agenda a verificação diária dos aniversários às 00:01.
 * @param {Client} client - Instância do bot Discord.js
 */
function agendarVerificacao(client) {
    const agora = moment();
    const horaDeVerificacao = moment().set({ hour: 0, minute: 1, second: 0 });

    if (agora.isAfter(horaDeVerificacao)) {
        horaDeVerificacao.add(1, 'day');
    }

    const tempoRestante = horaDeVerificacao.diff(agora);
    console.log(`⏳ Tempo restante até a verificação: ${(tempoRestante / 1000).toFixed(2)} segundos`);

    setTimeout(() => {
        console.log("⏰ Executando verificação de aniversários...");
        verificarAniversarios(client);
        setInterval(() => verificarAniversarios(client), 86400000); // Verifica diariamente (24h)
    }, tempoRestante);
}

module.exports = { agendarVerificacao };
