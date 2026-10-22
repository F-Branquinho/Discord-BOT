const { EmbedBuilder, MessageFlags, PermissionFlagsBits, RESTJSONErrorCodes, SlashCommandBuilder } = require('discord.js');
const { version } = require('../package.json');
const config = require('./config');
const store = require('./store');
const { lerAniversarios, fazAnosHoje, formatarData, nomeDoMes, aniversariosDoMes } = require('./birthdays');
const { agoraNoFuso, proximaVerificacao } = require('./scheduler');

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
    new SlashCommandBuilder()
        .setName('aniversario-help')
        .setDescription('Explica o que o bot faz e os comandos disponíveis'),
].map((c) => c.toJSON());

// Texto do /aniversario-help para cada comando
const AJUDA = {
    'aniversario-adicionar': 'Adiciona ou altera o teu aniversário, ex: `/aniversario-adicionar data:25/12`.\n'
        + 'Com `utilizador:` adicionas o de outra pessoa (precisa da permissão **Gerir servidor**).',
    'aniversario-status': 'Mostra se o bot está a correr, há quanto tempo, e a última e a próxima verificação.',
    'aniversarios-proximos': 'Lista os aniversários deste mês. Os que já passaram aparecem riscados.',
    'aniversario-help': 'Mostra esta ajuda.',
};

/** Link para adicionar o bot a um servidor (já escolhido, se guildId for dado). */
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
 * Regista os comandos num servidor. Comandos de servidor ficam disponíveis logo,
 * ao contrário dos globais.
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

function linkPainel(guildId) {
    return config.WEB_ENABLED ? `${config.PUBLIC_URL}/servidor/${guildId}` : null;
}

/** Responde que o servidor ainda não foi configurado e devolve null; senão devolve a configuração. */
async function exigirConfig(interaction) {
    const cfg = store.obterConfig(interaction.guildId);
    if (cfg) return cfg;
    const painel = linkPainel(interaction.guildId);
    await interaction.reply({
        content: '⚙ Este servidor ainda não está configurado.'
            + (painel ? ` Um administrador pode configurá-lo aqui: ${painel}` : ' Pede ao dono do bot para o configurar.'),
        flags: MessageFlags.Ephemeral,
    });
    return null;
}

/** @param {import('discord.js').ChatInputCommandInteraction} interaction */
async function adicionar(interaction) {
    const cfg = await exigirConfig(interaction);
    if (!cfg) return;

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
    const atual = (await lerAniversarios(interaction.client, cfg.birthdayChannelId)).find((a) => a.userId === alvo.id);
    if (atual?.dia === dia && atual?.mes === mes) {
        return interaction.editReply({ content: `ℹ O aniversário de <@${alvo.id}> já está na lista: **${data}**.`, allowedMentions: SEM_PINGS });
    }

    // A lista vive no canal de aniversários; a mensagem mais recente de cada pessoa prevalece
    const canal = await interaction.client.channels.fetch(cfg.birthdayChannelId);
    try {
        await canal.send({ content: `${data} - <@${alvo.id}>`, allowedMentions: SEM_PINGS });
    } catch (error) {
        if (error.code === RESTJSONErrorCodes.MissingPermissions || error.code === RESTJSONErrorCodes.MissingAccess) {
            return interaction.editReply('❌ Não tenho permissão para escrever no canal de aniversários.');
        }
        throw error;
    }
    console.log(`📝 [${interaction.guild?.name}] Birthday ${atual ? 'updated' : 'added'} by ${interaction.user.tag}: ${data} - ${alvo.tag} (${alvo.id})`);

    const resposta = atual
        ? `✏ Aniversário de <@${alvo.id}> alterado de ${formatarData(atual.dia, atual.mes)} para **${data}**.`
        : `🎂 Aniversário de <@${alvo.id}> adicionado: **${data}**.`;
    return interaction.editReply({ content: resposta, allowedMentions: SEM_PINGS });
}

/** @param {import('discord.js').ChatInputCommandInteraction} interaction */
async function status(interaction) {
    const cfg = await exigirConfig(interaction);
    if (!cfg) return;

    await interaction.deferReply();
    const lista = await lerAniversarios(interaction.client, cfg.birthdayChannelId);
    const estado = store.lerEstado(interaction.guildId);

    let ultima = 'ainda nenhuma';
    if (estado.data) ultima = `${estado.data.split('-').reverse().join('/')} ${estado.concluido ? '✅' : '⚠ incompleta'}`;

    const ping = interaction.client.ws.ping;
    const linhas = [
        cfg.enabled ? '🟢 **Bot de aniversários a correr**' : '⏸ **Bot a correr, mas os parabéns estão desligados neste servidor**',
        `⏱ Online há **${formatarDuracao(Date.now() - ARRANQUE_MS)}** (desde <t:${Math.floor(ARRANQUE_MS / 1000)}:f>)`,
        `📋 ${lista.length} aniversários na lista`,
        `🔍 Última verificação: ${ultima}`,
        `⏰ Próxima verificação: ${proximaVerificacao(interaction.guildId, cfg)}`,
        `📅 Resumo mensal: ${cfg.monthlySummary ? 'ligado (dia 1)' : 'desligado'}`,
        `🏷 Versão ${version}`,
    ];
    if (ping >= 0) linhas.push(`📶 Ping: ${ping} ms`);
    const painel = linkPainel(interaction.guildId);
    if (painel) linhas.push(`⚙ Painel: ${painel}`);
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

/** @param {import('discord.js').ChatInputCommandInteraction} interaction */
async function ajuda(interaction) {
    const cfg = store.obterConfig(interaction.guildId);
    const painel = linkPainel(interaction.guildId);

    const funcionamento = [];
    if (cfg) {
        funcionamento.push(
            `🎉 Todos os dias às **${cfg.checkTime}** (${cfg.timezone}) dou os parabéns em <#${cfg.generalChannelId}> a quem faz anos.`,
            `📋 A lista está em <#${cfg.birthdayChannelId}>, uma linha por pessoa: \`25/12 - @pessoa\`.`,
        );
        if (cfg.monthlySummary) funcionamento.push('📅 No dia 1 de cada mês publico a lista dos aniversários desse mês.');
        if (!cfg.enabled) funcionamento.push('⏸ Os parabéns estão desligados neste servidor.');
    } else {
        funcionamento.push('⚙ Este servidor ainda não está configurado.');
    }
    if (painel) funcionamento.push(`🔧 Os administradores configuram o bot em ${painel}`);

    const embed = new EmbedBuilder()
        .setColor(0xf47fff)
        .setTitle('🎂 Bot de aniversários')
        .setDescription(funcionamento.join('\n'))
        .addFields(definicoes.map((c) => ({ name: `/${c.name}`, value: AJUDA[c.name] ?? c.description })))
        .setFooter({ text: 'Nenhum comando notifica as pessoas da lista.' });
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

const handlers = {
    'aniversario-adicionar': adicionar,
    'aniversario-status': status,
    'aniversarios-proximos': proximos,
    'aniversario-help': ajuda,
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
        const mensagem = '❌ Ocorreu um erro. Tenta outra vez daqui a pouco.';
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(mensagem).catch(() => {});
        } else {
            await interaction.reply({ content: mensagem, flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    }
}

module.exports = { AJUDA, definicoes, formatarDuracao, registarComandos, tratarInteracao, urlConvite };
