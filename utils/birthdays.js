const moment = require('moment');

let aniversarios = [];

/**
 * Lê a mensagem de aniversários do canal e armazena os dados.
 * @param {Client} client - Instância do bot Discord.js
 */
async function lerAniversarios(client) {
    console.log('Lendo aniversários...');
    aniversarios = []; // Resetar a lista

    const canalAniversarios = await client.channels.fetch(process.env.BIRTHDAY_CHANNEL_ID);
    if (!canalAniversarios) {
        console.log("⚠ Canal de aniversários não encontrado!");
        return;
    }

    const mensagens = await canalAniversarios.messages.fetch({ limit: 5 });
    if (mensagens.size === 0) {
        console.log("⚠ Nenhuma mensagem encontrada no canal de aniversários!");
        return;
    }

    const mensagem = mensagens.first();
    console.log(`📩 Mensagem encontrada: ${mensagem.content}`);

    const regex = /(\d{2}\/\d{2})\s-\s<@(\d+)>/g;
    let match;

    while ((match = regex.exec(mensagem.content))) {
        const diaMes = match[1];  // Data no formato DD/MM
        const userId = match[2];  // ID do usuário

        aniversarios.push({ data: diaMes, userId });
        console.log(`🎂 Aniversário encontrado: ${diaMes} - <@${userId}>`);
    }
}

/**
 * Verifica se há aniversariantes no dia e envia mensagem no canal geral.
 * @param {Client} client - Instância do bot Discord.js
 */
async function verificarAniversarios(client) {
    const dataAtual = moment().format('DD/MM');
    console.log(`🔍 Verificando aniversários para a data: ${dataAtual}`);

    const canalGeral = client.channels.cache.get(process.env.GENERAL_CHANNEL_ID);
    if (!canalGeral) {
        console.log('⚠ Canal geral não encontrado!');
        return;
    }

    for (const aniversario of aniversarios) {
        console.log(`📅 Comparando: ${aniversario.data} com ${dataAtual}`);
        if (aniversario.data === dataAtual) {
            try {
                const membro = await canalGeral.guild.members.fetch(aniversario.userId);
                if (membro) {
                    const mensagemAniversario = `🎉 Hoje é o teu dia, <@${membro.id}>! 🎂 Feliz aniversário!`;
                    console.log(`📢 Enviando mensagem: ${mensagemAniversario}`);
                    await canalGeral.send(mensagemAniversario);
                } else {
                    console.log(`⚠ Usuário com ID "${aniversario.userId}" não encontrado no servidor!`);
                }
            } catch (error) {
                console.log(`⚠ Erro ao buscar usuário ${aniversario.userId}:`, error.message);
            }
        }
    }
}

module.exports = { lerAniversarios, verificarAniversarios };
