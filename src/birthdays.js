const { RESTJSONErrorCodes } = require('discord.js');
const { idioma } = require('./i18n');

// Accepts "25/12 - @user", "5/3 – @user", "25/12: @user"
const REGEX_ANIVERSARIO = /(\d{1,2})\/(\d{1,2})\s*[-–—:]\s*<@!?(\d+)>/g;
const MAX_MENSAGENS = 500;

/**
 * Reads every message in the birthday list channel and extracts the list.
 * If someone appears more than once, the most recent message wins.
 * @param {import('discord.js').Client} client
 * @param {string} canalId - the server's birthday list channel
 * @returns {Promise<{ userId: string, dia: number, mes: number }[]>}
 */
async function lerAniversarios(client, canalId) {
    const canal = await obterCanal(client, canalId, 'Birthday');

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
    // Oldest first, so the most recent entries win
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
 * People born on 29/02 are celebrated on 28/02 in non-leap years.
 */
function fazAnosHoje(aniversario, hoje) {
    if (aniversario.dia === hoje.dia && aniversario.mes === hoje.mes) return true;
    return aniversario.dia === 29 && aniversario.mes === 2
        && hoje.dia === 28 && hoje.mes === 2 && !eBissexto(hoje.ano);
}

async function obterCanal(client, canalId, nome) {
    const canal = await client.channels.fetch(canalId).catch(() => null);
    if (!canal?.isTextBased()) {
        throw new Error(`${nome} channel ${canalId} not found or not a text channel`);
    }
    return canal;
}

function formatarData(dia, mes) {
    return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
}

/** Capitalised month name in the given language: "November", "Março", ... */
function nomeDoMes(mes, codigoIdioma = 'en') {
    const nome = new Intl.DateTimeFormat(idioma(codigoIdioma).locale, { month: 'long', timeZone: 'UTC' })
        .format(new Date(Date.UTC(2000, mes - 1, 1)));
    return nome[0].toUpperCase() + nome.slice(1);
}

function aniversariosDoMes(lista, mes) {
    return lista.filter((a) => a.mes === mes).sort((a, b) => a.dia - b.dia);
}

/**
 * The birthday message for a user: the server's custom message, or the default for its language.
 * @param {import('./store').ConfigServidor} cfg
 */
function mensagemAniversario(cfg, userId) {
    return (cfg.message || idioma(cfg.language).mensagemAniversario).replaceAll('{user}', `<@${userId}>`);
}

/**
 * Monthly summary text in the server's language, or null if nobody has a birthday that month.
 * @param {{ userId: string, dia: number, mes: number }[]} lista
 * @param {{ mes: number }} hoje
 * @param {string} codigoIdioma
 */
function mensagemResumoMensal(lista, hoje, codigoIdioma) {
    const doMes = aniversariosDoMes(lista, hoje.mes);
    if (doMes.length === 0) return null;

    const linhas = doMes.map((a) => `• ${formatarData(a.dia, a.mes)} - <@${a.userId}>`);
    return `${idioma(codigoIdioma).tituloResumo(nomeDoMes(hoje.mes, codigoIdioma))}\n${linhas.join('\n')}`;
}

/**
 * Posts this month's birthdays. Mentions don't ping anyone,
 * since everyone is already mentioned on their birthday.
 */
async function enviarResumoMensal(client, cfg, lista, hoje) {
    const conteudo = mensagemResumoMensal(lista, hoje, cfg.language);
    if (!conteudo) {
        console.log('📅 No birthdays this month, skipping monthly summary');
        return;
    }
    const canalGeral = await obterCanal(client, cfg.generalChannelId, 'General');
    await canalGeral.send({ content: conteudo, allowedMentions: { parse: [] } });
    console.log('📅 Monthly summary sent');
}

/**
 * Sends the birthday message to everyone whose birthday is today and who hasn't got it yet.
 * @param {import('discord.js').Client} client
 * @param {import('./store').ConfigServidor} cfg
 * @param {{ userId: string, dia: number, mes: number }[]} lista
 * @param {{ dia: number, mes: number, ano: number }} hoje
 * @param {Set<string>} jaEnviados - IDs that already got a message today
 * @param {(userId: string) => void} aoEnviar - called after each user is handled
 */
async function verificarAniversarios(client, cfg, lista, hoje, jaEnviados, aoEnviar) {
    const aniversariantes = lista.filter((a) => fazAnosHoje(a, hoje) && !jaEnviados.has(a.userId));
    console.log(`🔍 ${lista.length} birthdays in the list, ${aniversariantes.length} to celebrate today`);
    if (aniversariantes.length === 0) return;

    const canalGeral = await obterCanal(client, cfg.generalChannelId, 'General');

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

        await canalGeral.send({ content: mensagemAniversario(cfg, userId), allowedMentions: { users: [userId] } });
        console.log(`📢 Birthday message sent to ${userId}`);
        aoEnviar(userId);
    }
}

module.exports = {
    lerAniversarios,
    obterCanal,
    fazAnosHoje,
    formatarData,
    nomeDoMes,
    aniversariosDoMes,
    mensagemAniversario,
    mensagemResumoMensal,
    enviarResumoMensal,
    verificarAniversarios,
};
