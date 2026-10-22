const { Client, Events, GatewayIntentBits } = require('discord.js');
const store = require('./store');
const settings = require('./settings');
const { lerAniversarios, fazAnosHoje, formatarData, mensagemResumoMensal } = require('./birthdays');
const { agoraNoFuso, iniciarAgendador } = require('./scheduler');
const { configAntiga } = require('./migrate');

process.on('unhandledRejection', (error) => console.error('❌ Unhandled promise rejection:', error));

// --dry-run: prints each server's list and today's birthdays without sending anything
async function dryRun() {
    const { botToken } = settings.obter();
    if (!botToken) {
        console.log('The bot is not set up yet: open the setup page first.');
        return;
    }
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
    await client.login(botToken);
    if (!client.isReady()) await new Promise((r) => client.once(Events.ClientReady, r));
    console.log(`✅ Connected as ${client.user.tag} in ${client.guilds.cache.size} servers`);

    try {
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
    } finally {
        await client.destroy();
    }
}

function arrancar() {
    const bot = require('./bot');
    const painel = require('./web/server').iniciarPainel(bot);
    iniciarAgendador(() => bot.estado.cliente);

    if (bot.emSetup()) bot.anunciarSetup();
    bot.ligar();

    async function encerrar(sinal) {
        console.log(`👋 ${sinal} received, shutting down...`);
        painel.close();
        await bot.estado.cliente?.destroy();
        process.exit(0);
    }
    process.on('SIGTERM', () => encerrar('SIGTERM'));
    process.on('SIGINT', () => encerrar('SIGINT'));
}

if (process.argv.includes('--dry-run')) {
    dryRun().catch((error) => {
        console.error('❌ Dry run failed:', error.message);
        process.exitCode = 1;
    });
} else {
    arrancar();
}
