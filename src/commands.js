const { MessageFlags, PermissionFlagsBits, RESTJSONErrorCodes, SlashCommandBuilder } = require('discord.js');
const config = require('./config');
const { lerAniversarios, fazAnosHoje, formatarData, nomeDoMes, aniversariosDoMes } = require('./birthdays');
const { agoraNoFuso } = require('./scheduler');
const { lerEstado } = require('./state');

const DIAS_POR_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const ARRANQUE_MS = Date.now();
// Ver canais, enviar mensagens, ler histórico
const PERMISSOES_CONVITE = 68608;
// Menções aparecem com o nome mas não notificam ninguém
const SEM_PINGS = { parse: [] };

const definicoes = [
    new SlashCommandBuilder()
        .setName('aniversario-adicionar')
        .setDescription('Adiciona ou altera um aniversário na lista')
        .addStringOption((o) => o.setName('data').setDescription('Dia e mês, ex: 25/12').setRequired(true).setMaxLength(5))
        .addUserOption((o) => o.setName('utilizador').setDescription('De quem é o aniversário (por omissão, o teu)')),
    new SlashCommandBuilder()
        .setName('aniversario-status')
        .setDescription('Mostra se o bot está a correr e há quanto tempo'),
    new SlashCommandBuilder()
        .setName('aniversarios-proximos')
        .setDescription('Mostra os aniversários deste mês'),
].map((c) => c.toJSON());

/**
 * Regista os comandos no servidor do canal geral. Comandos de servidor ficam disponíveis logo,
 * ao contrário dos globais.
 * @param {import('discord.js').Client} client
 */
async function registarComandos(client) {
    const canal = await client.channels.fetch(config.GENERAL_CHANNEL_ID);
    try {
        await canal.guild.commands.set(definicoes);
        console.log(`⌨ Slash commands registered in ${canal.guild.name}`);
    } catch (error) {
        if (error.code !== RESTJSONErrorCodes.MissingAccess) throw error;
        console.error(
            '❌ Missing permission to register slash commands. Re-invite the bot with this link:\n'
            + `   https://discord.com/oauth2/authorize?client_id=${client.user.id}`
            + `&scope=bot+applications.commands&permissions=${PERMISSOES_CONVITE}`,
        );
    }
}

/** "3 dias, 4 h e 12 min" */
function formatarDuracao(ms) {
    const minutos = Math.floor(ms / 60000);
    const dias = Math.floor(minutos / 1440);
    const horas = Math.floor((minutos % 1440) / 60);
    const partes = [];
    if (dias) partes.push(`${dias} ${dias === 1 ? 'dia' : 'dias'}`);
    if (horas) partes.push(`${horas} h`);
    partes.push(`${minutos % 60} min`);
    return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}` : partes[0];
}

/** @param {import('discord.js').ChatInputCommandInteraction} interaction */
async function adicionar(interaction) {
    const texto = interaction.options.getString('data', true).trim();
    const match = /^(\d{1,2})\/(\d{1,2})$/.exec(texto);
    const dia = Number(match?.[1]);
    const mes = Number(match?.[2]);
    if (!match || mes < 1 || mes > 12 || dia < 1 || dia > DIAS_POR_MES[mes - 1]) {
        return interaction.reply({ content: `❌ "${texto}" não é uma data válida. Usa DD/MM, ex: 25/12.`, flags: MessageFlags.Ephemeral });
    }

    const alvo = interaction.options.getUser('utilizador') ?? interaction.user;
    if (alvo.bot) {
        return interaction.reply({ content: '🤖 Bots não fazem anos.', flags: MessageFlags.Ephemeral });
    }
    if (alvo.id !== interaction.user.id && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
            content: '❌ Só podes adicionar o teu próprio aniversário. Para adicionar o de outra pessoa precisas da permissão **Gerir servidor**.',
            flags: MessageFlags.Ephemeral,
        });
    }

    await interaction.deferReply();
    const data = formatarData(dia, mes);
    const atual = (await lerAniversarios(interaction.client)).find((a) => a.userId === alvo.id);
    if (atual?.dia === dia && atual?.mes === mes) {
        return interaction.editReply({ content: `ℹ O aniversário de <@${alvo.id}> já está na lista: **${data}**.`, allowedMentions: SEM_PINGS });
    }

    // A lista vive no canal de aniversários; a mensagem mais recente de cada pessoa prevalece
    const canal = await interaction.client.channels.fetch(config.BIRTHDAY_CHANNEL_ID);
    try {
        await canal.send({ content: `${data} - <@${alvo.id}>`, allowedMentions: SEM_PINGS });
    } catch (error) {
        if (error.code === RESTJSONErrorCodes.MissingPermissions || error.code === RESTJSONErrorCodes.MissingAccess) {
            return interaction.editReply('❌ Não tenho permissão para escrever no canal de aniversários.');
        }
        throw error;
    }
    console.log(`📝 Birthday ${atual ? 'updated' : 'added'} by ${interaction.user.tag}: ${data} - ${alvo.tag} (${alvo.id})`);

    const resposta = atual
        ? `✏ Aniversário de <@${alvo.id}> alterado de ${formatarData(atual.dia, atual.mes)} para **${data}**.`
        : `🎂 Aniversário de <@${alvo.id}> adicionado: **${data}**.`;
    return interaction.editReply({ content: resposta, allowedMentions: SEM_PINGS });
}

/** @param {import('discord.js').ChatInputCommandInteraction} interaction */
async function status(interaction) {
    await interaction.deferReply();
    const lista = await lerAniversarios(interaction.client);
    const estado = lerEstado();
    const hoje = agoraNoFuso(config.TIMEZONE);
    const feitaHoje = estado.data === hoje.data && estado.concluido;

    let ultima = 'ainda nenhuma';
    if (estado.data) ultima = `${estado.data.split('-').reverse().join('/')} ${estado.concluido ? '✅' : '⚠ incompleta'}`;

    let proxima;
    if (feitaHoje) proxima = `amanhã às ${config.CHECK_TIME} (${config.TIMEZONE})`;
    else if (hoje.horaMinuto < config.CHECK_TIME) proxima = `hoje às ${config.CHECK_TIME} (${config.TIMEZONE})`;
    else proxima = 'a decorrer, a tentar de novo de 5 em 5 min';

    const ping = interaction.client.ws.ping;
    const linhas = [
        '🟢 **Bot de aniversários a correr**',
        `⏱ Online há **${formatarDuracao(Date.now() - ARRANQUE_MS)}** (desde <t:${Math.floor(ARRANQUE_MS / 1000)}:f>)`,
        `📋 ${lista.length} aniversários na lista`,
        `🔍 Última verificação: ${ultima}`,
        `⏰ Próxima verificação: ${proxima}`,
        `📅 Resumo mensal: ${config.MONTHLY_SUMMARY ? 'ligado (dia 1)' : 'desligado'}`,
    ];
    if (ping >= 0) linhas.push(`📶 Ping: ${ping} ms`);
    return interaction.editReply(linhas.join('\n'));
}

/** @param {import('discord.js').ChatInputCommandInteraction} interaction */
async function proximos(interaction) {
    await interaction.deferReply();
    const hoje = agoraNoFuso(config.TIMEZONE);
    const doMes = aniversariosDoMes(await lerAniversarios(interaction.client), hoje.mes);
    if (doMes.length === 0) {
        return interaction.editReply(`📅 Ninguém faz anos em ${nomeDoMes(hoje.mes)}.`);
    }

    const linhas = doMes.map((a) => {
        const entrada = `${formatarData(a.dia, a.mes)} - <@${a.userId}>`;
        if (fazAnosHoje(a, hoje)) return `• 🎂 **${entrada}** (hoje!)`;
        if (a.dia < hoje.dia) return `• ~~${entrada}~~`;
        return `• ${entrada}`;
    });
    return interaction.editReply({
        content: `📅 **Aniversários de ${nomeDoMes(hoje.mes)}**\n${linhas.join('\n')}`,
        allowedMentions: SEM_PINGS,
    });
}

const handlers = {
    'aniversario-adicionar': adicionar,
    'aniversario-status': status,
    'aniversarios-proximos': proximos,
};

/** @param {import('discord.js').Interaction} interaction */
async function tratarInteracao(interaction) {
    if (!interaction.isChatInputCommand()) return;
    const handler = handlers[interaction.commandName];
    if (!handler) return;

    try {
        await handler(interaction);
    } catch (error) {
        console.error(`❌ Command /${interaction.commandName} failed:`, error);
        const mensagem = '❌ Ocorreu um erro. Tenta outra vez daqui a pouco.';
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(mensagem).catch(() => {});
        } else {
            await interaction.reply({ content: mensagem, flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    }
}

module.exports = { definicoes, formatarDuracao, registarComandos, tratarInteracao };
