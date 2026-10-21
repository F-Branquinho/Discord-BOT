const { RESTJSONErrorCodes } = require('discord.js');
const config = require('./config');

// Aceita "25/12 - @utilizador", "5/3 – @utilizador", "25/12: @utilizador"
const REGEX_ANIVERSARIO = /(\d{1,2})\/(\d{1,2})\s*[-–—:]\s*<@!?(\d+)>/g;
const MAX_MENSAGENS = 500;

/**
 * Lê todas as mensagens do canal de aniversários e extrai a lista.
 * Se um utilizador aparecer mais de uma vez, prevalece a mensagem mais recente.
 * @param {import('discord.js').Client} client
 * @returns {Promise<{ userId: string, dia: number, mes: number }[]>}
 */
async function lerAniversarios(client) {
    const canal = await client.channels.fetch(config.BIRTHDAY_CHANNEL_ID);
    if (!canal?.isTextBased()) {
        throw new Error(`Birthday channel ${config.BIRTHDAY_CHANNEL_ID} not found or not a text channel`);
    }

    const mensagens = [];
    let antes;
    while (mensagens.length < MAX_MENSAGENS) {
        const lote = await canal.messages.fetch({ limit: 100, before: antes });
        if (lote.size === 0) break;
        mensagens.push(...lote.values());
        antes = lote.last().id;
        if (lote.size < 100) break;
    }

    const porUtilizador = new Map();
    // Das mais antigas para as mais recentes, para as recentes prevalecerem
    for (const mensagem of mensagens.reverse()) {
        for (const [, d, m, userId] of mensagem.content.matchAll(REGEX_ANIVERSARIO)) {
            const dia = Number(d);
            const mes = Number(m);
            if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
                console.warn(`⚠ Ignoring invalid date: ${d}/${m} - <@${userId}>`);
                continue;
            }
            porUtilizador.set(userId, { userId, dia, mes });
        }
    }

    return [...porUtilizador.values()];
}

function eBissexto(ano) {
    return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

/**
 * Quem nasceu a 29/02 recebe os parabéns a 28/02 nos anos não bissextos.
 */
function fazAnosHoje(aniversario, hoje) {
    if (aniversario.dia === hoje.dia && aniversario.mes === hoje.mes) return true;
    return aniversario.dia === 29 && aniversario.mes === 2
        && hoje.dia === 28 && hoje.mes === 2 && !eBissexto(hoje.ano);
}

/**
 * Envia os parabéns a quem faz anos hoje e ainda não os recebeu.
 * @param {import('discord.js').Client} client
 * @param {{ dia: number, mes: number, ano: number }} hoje
 * @param {Set<string>} jaEnviados - IDs que já receberam mensagem hoje
 * @param {(userId: string) => void} aoEnviar - chamado após cada utilizador tratado
 */
async function verificarAniversarios(client, hoje, jaEnviados, aoEnviar) {
    const lista = await lerAniversarios(client);
    const aniversariantes = lista.filter((a) => fazAnosHoje(a, hoje) && !jaEnviados.has(a.userId));
    console.log(`🔍 ${lista.length} birthdays in the list, ${aniversariantes.length} to celebrate today`);
    if (aniversariantes.length === 0) return;

    const canalGeral = await client.channels.fetch(config.GENERAL_CHANNEL_ID);
    if (!canalGeral?.isTextBased()) {
        throw new Error(`General channel ${config.GENERAL_CHANNEL_ID} not found or not a text channel`);
    }

    for (const { userId } of aniversariantes) {
        try {
            await canalGeral.guild.members.fetch(userId);
        } catch (error) {
            if (error.code === RESTJSONErrorCodes.UnknownMember) {
                console.warn(`⚠ User ${userId} is no longer in the server, skipping`);
                aoEnviar(userId);
                continue;
            }
            throw error;
        }

        const conteudo = config.BIRTHDAY_MESSAGE.replaceAll('{user}', `<@${userId}>`);
        await canalGeral.send({ content: conteudo, allowedMentions: { users: [userId] } });
        console.log(`📢 Birthday message sent to ${userId}`);
        aoEnviar(userId);
    }
}

module.exports = { lerAniversarios, fazAnosHoje, verificarAniversarios };
