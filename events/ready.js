const { lerAniversarios } = require('../utils/birthdays');
const { agendarVerificacao } = require('../utils/scheduler');

async function onReady(client) {
    console.log(`✅ Bot está online como ${client.user.tag}`);

    await lerAniversarios(client);
    agendarVerificacao(client);
}

module.exports = { onReady };
