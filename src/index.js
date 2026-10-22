const { Client, Events, GatewayIntentBits } = require('discord.js');
const { version } = require('../package.json');
const config = require('./config');
const store = require('./store');
const { lerAniversarios, fazAnosHoje, formatarData, mensagemResumoMensal } = require('./birthdays');
const { agoraNoFuso, iniciarAgendador } = require('./scheduler');
const { registarComandos, tratarInteracao } = require('./commands');
const { configAntiga, migrarConfigAntiga } = require('./migrate');

// --dry-run: prints each server's list and today's birthdays without sending anything
const MODO_TESTE = process.argv.includes('--dry-run');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});
let painel = null;

async function testar() {
    const servidores = store.servidoresConfigurados();
    if (servidores.length === 0) {
        const antiga = await configAntiga(client);
        if (antiga) servidores.push([antiga.guild.id, antiga.cfg]);
    }
    if (servidores.length === 0) console.log('\nNo configured servers.');

    for (const [guildId, cfg] of servidores) {
        const nome = client.guilds.cache.get(guildId)?.name ?? guildId;
        const hoje = agoraNoFuso(cfg.timezone);
        const lista = await lerAniversarios(client, cfg.birthdayChannelId);
        lista.sort((a, b) => a.mes - b.mes || a.dia - b.dia);

        console.log(`\n=== ${nome}: ${lista.length} birthdays, check at ${cfg.checkTime} ${cfg.timezone}${cfg.enabled ? '' : ' (disabled)'}`);
        for (const a of lista) {
            const user = await client.users.fetch(a.userId).catch(() => null);
            const marca = fazAnosHoje(a, hoje) ? '  ← TODAY' : '';
            console.log(`  ${formatarData(a.dia, a.mes)}  ${user?.tag ?? '(unknown)'} (${a.userId})${marca}`);
        }
        console.log(`Now: ${hoje.data} ${hoje.horaMinuto} in ${cfg.timezone}`);
        console.log(`📅 Monthly summary preview (sent on day 1${cfg.monthlySummary ? '' : ', disabled'}):`);
        console.log(mensagemResumoMensal(lista, hoje, cfg.language) ?? '(no birthdays this month, nothing would be sent)');
    }
}

client.once(Events.ClientReady, async () => {
    console.log(`✅ Bot v${version} online as ${client.user.tag} in ${client.guilds.cache.size} servers`);

    if (MODO_TESTE) {
        try {
            await testar();
        } catch (error) {
            console.error('❌ Test failed:', error);
            process.exitCode = 1;
        }
        await client.destroy();
        return;
    }

    await migrarConfigAntiga(client).catch((error) => console.error('❌ Migration failed:', error));
    iniciarAgendador(client);

    if (config.WEB_ENABLED) {
        painel = require('./web/server').iniciarPainel(client);
    } else {
        console.log('ℹ Web panel disabled (set PUBLIC_URL and DISCORD_CLIENT_SECRET to enable it)');
    }

    for (const guild of client.guilds.cache.values()) {
        await registarComandos(guild).catch((error) => console.error(`❌ Failed to register slash commands in ${guild.name}:`, error));
    }
});

client.on(Events.GuildCreate, (guild) => {
    console.log(`➕ Added to server ${guild.name} (${guild.id})`);
    registarComandos(guild).catch((error) => console.error(`❌ Failed to register slash commands in ${guild.name}:`, error));
});
client.on(Events.GuildDelete, (guild) => console.log(`➖ Removed from server ${guild.name ?? guild.id}`));
client.on(Events.InteractionCreate, tratarInteracao);
client.on(Events.Error, (error) => console.error('❌ Discord client error:', error));
process.on('unhandledRejection', (error) => console.error('❌ Unhandled promise rejection:', error));

async function encerrar(sinal) {
    console.log(`👋 ${sinal} received, shutting down...`);
    painel?.close();
    await client.destroy();
    process.exit(0);
}
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));

client.login(config.BOT_TOKEN).catch((error) => {
    console.error('❌ Login failed (invalid BOT_TOKEN?):', error.message);
    process.exit(1);
});
