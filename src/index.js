const { Client, Events, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const { lerAniversarios, fazAnosHoje, mensagemResumoMensal } = require('./birthdays');
const { agoraNoFuso, iniciarAgendador } = require('./scheduler');

// --testar: mostra a lista lida do canal e quem faz anos hoje, sem enviar nada
const MODO_TESTE = process.argv.includes('--testar');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

async function testar() {
    const hoje = agoraNoFuso(config.TIMEZONE);
    const lista = await lerAniversarios(client);
    lista.sort((a, b) => a.mes - b.mes || a.dia - b.dia);

    console.log(`\n📋 ${lista.length} birthdays found:`);
    for (const a of lista) {
        const data = `${String(a.dia).padStart(2, '0')}/${String(a.mes).padStart(2, '0')}`;
        const user = await client.users.fetch(a.userId).catch(() => null);
        const marca = fazAnosHoje(a, hoje) ? '  ← TODAY' : '';
        console.log(`  ${data}  ${user?.tag ?? '(unknown)'} (${a.userId})${marca}`);
    }
    console.log(`\nNow: ${hoje.data} ${hoje.horaMinuto} in ${config.TIMEZONE}`);

    const resumo = mensagemResumoMensal(lista, hoje);
    console.log(`\n📅 Monthly summary preview (sent on day 1${config.MONTHLY_SUMMARY ? '' : ', disabled'}):`);
    console.log(resumo ?? '(no birthdays this month, nothing would be sent)');
}

client.once(Events.ClientReady, async () => {
    console.log(`✅ Bot online as ${client.user.tag}`);

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

    iniciarAgendador(client);
});

client.on(Events.Error, (error) => console.error('❌ Discord client error:', error));
process.on('unhandledRejection', (error) => console.error('❌ Unhandled promise rejection:', error));

async function encerrar(sinal) {
    console.log(`👋 ${sinal} received, shutting down...`);
    await client.destroy();
    process.exit(0);
}
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));

client.login(config.BOT_TOKEN).catch((error) => {
    console.error('❌ Login failed (invalid BOT_TOKEN?):', error.message);
    process.exit(1);
});
