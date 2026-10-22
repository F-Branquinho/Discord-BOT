const { EmbedBuilder, MessageFlags, PermissionFlagsBits, RESTJSONErrorCodes, SlashCommandBuilder } = require('discord.js');
const { version } = require('../package.json');
const config = require('./config');
const store = require('./store');
const settings = require('./settings');
const { idioma } = require('./i18n');
const { lerAniversarios, fazAnosHoje, formatarData, nomeDoMes, aniversariosDoMes } = require('./birthdays');
const { agoraNoFuso, proximaVerificacao, ultimaVerificacao } = require('./scheduler');

const DIAS_POR_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const ARRANQUE_MS = Date.now();
// View channels, send messages, read message history
const PERMISSOES_CONVITE = 68608;
// Mentions show the name but don't notify anyone
const SEM_PINGS = { parse: [] };

const definicoes = [
    new SlashCommandBuilder()
        .setName('birthday-add')
        .setDescription('Add or change a birthday on the list')
        .addStringOption((o) => o.setName('date').setDescription('Day and month, e.g. 25/12').setRequired(true).setMaxLength(5))
        .addUserOption((o) => o.setName('user').setDescription('Whose birthday it is (defaults to you)')),
    new SlashCommandBuilder()
        .setName('birthday-status')
        .setDescription('Show whether the bot is running and for how long'),
    new SlashCommandBuilder()
        .setName('birthdays-upcoming')
        .setDescription("Show this month's birthdays"),
    new SlashCommandBuilder()
        .setName('birthday-help')
        .setDescription('Explain what the bot does and list its commands'),
].map((c) => c.toJSON());

// /birthday-help text for each command
const AJUDA = {
    'birthday-add': 'Add or change your birthday, e.g. `/birthday-add date:25/12`.\n'
        + "With `user:` you add someone else's (requires the **Manage Server** permission).",
    'birthday-status': 'Show whether the bot is running, for how long, and the last and next check.',
    'birthdays-upcoming': "List this month's birthdays. The ones that already passed are crossed out.",
    'birthday-help': 'Show this help.',
};

/** Link to add the bot to a server (preselected when guildId is given). */
function urlConvite(clientId, guildId) {
    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('scope', 'bot applications.commands');
    url.searchParams.set('permissions', String(PERMISSOES_CONVITE));
    if (guildId) {
        url.searchParams.set('guild_id', guildId);
        url.searchParams.set('disable_guild_select', 'true');
    }
    return url.toString();
}

/**
 * Registers the commands in a server. Server commands are available right away,
 * unlike global ones. This also replaces commands from older versions.
 * @param {import('discord.js').Guild} guild
 */
async function registarComandos(guild) {
    try {
        await guild.commands.set(definicoes);
        console.log(`⌨ Slash commands registered in ${guild.name}`);
    } catch (error) {
        if (error.code !== RESTJSONErrorCodes.MissingAccess) throw error;
        console.error(
            `❌ Missing permission to register slash commands in ${guild.name}. Re-invite the bot with this link:\n`
            + `   ${urlConvite(guild.client.user.id, guild.id)}`,
        );
    }
}

/** "3 days, 4 h and 12 min" */
function formatarDuracao(ms) {
    const minutos = Math.floor(ms / 60000);
    const dias = Math.floor(minutos / 1440);
    const horas = Math.floor((minutos % 1440) / 60);
    const partes = [];
    if (dias) partes.push(`${dias} ${dias === 1 ? 'day' : 'days'}`);
    if (horas) partes.push(`${horas} h`);
    partes.push(`${minutos % 60} min`);
    return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} and ${partes.at(-1)}` : partes[0];
}

function linkPainel(guildId) {
    return settings.painelConfigurado() ? `${settings.obter().publicUrl}/server/${guildId}` : null;
}

/** Replies that the server isn't set up yet and returns null; otherwise returns its configuration. */
async function exigirConfig(interaction) {
    const cfg = store.obterConfig(interaction.guildId);
    if (cfg) return cfg;
    const painel = linkPainel(interaction.guildId);
    await interaction.reply({
        content: "⚙ This server isn't set up yet."
            + (painel ? ` An admin can set it up here: ${painel}` : ' Ask the bot owner to set it up.'),
        flags: MessageFlags.Ephemeral,
    });
    return null;
}

/** @param {import('discord.js').ChatInputCommandInteraction} interaction */
async function adicionar(interaction) {
    const cfg = await exigirConfig(interaction);
    if (!cfg) return;

    const texto = interaction.options.getString('date', true).trim();
    const match = /^(\d{1,2})\/(\d{1,2})$/.exec(texto);
    const dia = Number(match?.[1]);
    const mes = Number(match?.[2]);
    if (!match || mes < 1 || mes > 12 || dia < 1 || dia > DIAS_POR_MES[mes - 1]) {
        return interaction.reply({ content: `❌ "${texto}" isn't a valid date. Use DD/MM, e.g. 25/12.`, flags: MessageFlags.Ephemeral });
    }

    const alvo = interaction.options.getUser('user') ?? interaction.user;
    if (alvo.bot) {
        return interaction.reply({ content: "🤖 Bots don't have birthdays.", flags: MessageFlags.Ephemeral });
    }
    if (alvo.id !== interaction.user.id && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
            content: "❌ You can only add your own birthday. Adding someone else's requires the **Manage Server** permission.",
            flags: MessageFlags.Ephemeral,
        });
    }

    await interaction.deferReply();
    const data = formatarData(dia, mes);
    const atual = (await lerAniversarios(interaction.client, cfg.birthdayChannelId)).find((a) => a.userId === alvo.id);
    if (atual?.dia === dia && atual?.mes === mes) {
        return interaction.editReply({ content: `ℹ <@${alvo.id}>'s birthday is already on the list: **${data}**.`, allowedMentions: SEM_PINGS });
    }

    // The list lives in the birthday channel; each person's most recent message wins
    const canal = await interaction.client.channels.fetch(cfg.birthdayChannelId);
    try {
        await canal.send({ content: `${data} - <@${alvo.id}>`, allowedMentions: SEM_PINGS });
    } catch (error) {
        if (error.code === RESTJSONErrorCodes.MissingPermissions || error.code === RESTJSONErrorCodes.MissingAccess) {
            return interaction.editReply("❌ I don't have permission to post in the birthday list channel.");
        }
        throw error;
    }
    console.log(`📝 [${interaction.guild?.name}] Birthday ${atual ? 'updated' : 'added'} by ${interaction.user.tag}: ${data} - ${alvo.tag} (${alvo.id})`);

    const resposta = atual
        ? `✏ <@${alvo.id}>'s birthday changed from ${formatarData(atual.dia, atual.mes)} to **${data}**.`
        : `🎂 <@${alvo.id}>'s birthday added: **${data}**.`;
    return interaction.editReply({ content: resposta, allowedMentions: SEM_PINGS });
}

/** @param {import('discord.js').ChatInputCommandInteraction} interaction */
async function status(interaction) {
    const cfg = await exigirConfig(interaction);
    if (!cfg) return;

    await interaction.deferReply();
    const lista = await lerAniversarios(interaction.client, cfg.birthdayChannelId);

    const ping = interaction.client.ws.ping;
    const linhas = [
        cfg.enabled ? '🟢 **Birthday bot is running**' : '⏸ **Bot is running, but birthday messages are turned off in this server**',
        `⏱ Online for **${formatarDuracao(Date.now() - ARRANQUE_MS)}** (since <t:${Math.floor(ARRANQUE_MS / 1000)}:f>)`,
        `📋 ${lista.length} birthdays on the list`,
        `🔍 Last check: ${ultimaVerificacao(interaction.guildId)}`,
        `⏰ Next check: ${proximaVerificacao(interaction.guildId, cfg)}`,
        `📅 Monthly summary: ${cfg.monthlySummary ? 'on (1st of the month)' : 'off'}`,
        `🌐 Message language: ${idioma(cfg.language).nome}`,
        `🏷 Version ${version}`,
    ];
    if (ping >= 0) linhas.push(`📶 Ping: ${ping} ms`);
    const painel = linkPainel(interaction.guildId);
    if (painel) linhas.push(`⚙ Panel: ${painel}`);
    return interaction.editReply(linhas.join('\n'));
}

/** @param {import('discord.js').ChatInputCommandInteraction} interaction */
async function proximos(interaction) {
    const cfg = await exigirConfig(interaction);
    if (!cfg) return;

    await interaction.deferReply();
    const hoje = agoraNoFuso(cfg.timezone);
    const doMes = aniversariosDoMes(await lerAniversarios(interaction.client, cfg.birthdayChannelId), hoje.mes);
    if (doMes.length === 0) {
        return interaction.editReply(`📅 Nobody has a birthday in ${nomeDoMes(hoje.mes)}.`);
    }

    const linhas = doMes.map((a) => {
        const entrada = `${formatarData(a.dia, a.mes)} - <@${a.userId}>`;
        if (fazAnosHoje(a, hoje)) return `• 🎂 **${entrada}** (today!)`;
        if (a.dia < hoje.dia) return `• ~~${entrada}~~`;
        return `• ${entrada}`;
    });
    return interaction.editReply({
        content: `📅 **Birthdays in ${nomeDoMes(hoje.mes)}**\n${linhas.join('\n')}`,
        allowedMentions: SEM_PINGS,
    });
}

/** @param {import('discord.js').ChatInputCommandInteraction} interaction */
async function ajuda(interaction) {
    const cfg = store.obterConfig(interaction.guildId);
    const painel = linkPainel(interaction.guildId);

    const funcionamento = [];
    if (cfg) {
        funcionamento.push(
            `🎉 Every day at **${cfg.checkTime}** (${cfg.timezone}) I post a birthday message in <#${cfg.generalChannelId}>.`,
            `📋 The list is in <#${cfg.birthdayChannelId}>, one line per person: \`25/12 - @person\`.`,
        );
        if (cfg.monthlySummary) funcionamento.push("📅 On the 1st of each month I post that month's birthdays.");
        if (!cfg.enabled) funcionamento.push('⏸ Birthday messages are turned off in this server.');
    } else {
        funcionamento.push("⚙ This server isn't set up yet.");
    }
    if (painel) funcionamento.push(`🔧 Admins can set up the bot at ${painel}`);

    const embed = new EmbedBuilder()
        .setColor(0xf47fff)
        .setTitle('🎂 Birthday bot')
        .setDescription(funcionamento.join('\n'))
        .addFields(definicoes.map((c) => ({ name: `/${c.name}`, value: AJUDA[c.name] ?? c.description })))
        .setFooter({ text: 'No command pings the people on the list.' });
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

const handlers = {
    'birthday-add': adicionar,
    'birthday-status': status,
    'birthdays-upcoming': proximos,
    'birthday-help': ajuda,
};

/** @param {import('discord.js').Interaction} interaction */
async function tratarInteracao(interaction) {
    if (!interaction.isChatInputCommand() || !interaction.inGuild()) return;
    const handler = handlers[interaction.commandName];
    if (!handler) return;

    try {
        await handler(interaction);
    } catch (error) {
        console.error(`❌ Command /${interaction.commandName} failed:`, error);
        const mensagem = '❌ Something went wrong. Please try again in a moment.';
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(mensagem).catch(() => {});
        } else {
            await interaction.reply({ content: mensagem, flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    }
}

module.exports = { AJUDA, definicoes, formatarDuracao, registarComandos, tratarInteracao, urlConvite };
