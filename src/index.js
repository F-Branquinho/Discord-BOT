const { Client, Events, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const { lerAniversarios, fazAnosHoje } = require('./birthdays');
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

    console.log(`\n📋 ${lista.length} aniversários encontrados:`);
    for (const a of lista) {
        const data = `${String(a.dia).padStart(2, '0')}/${String(a.mes).padStart(2, '0')}`;
        const user = await client.users.fetch(a.userId).catch(() => null);
        const marca = fazAnosHoje(a, hoje) ? '  ← HOJE' : '';
        console.log(`  ${data}  ${user?.tag ?? '(desconhecido)'} (${a.userId})${marca}`);
    }
    console.log(`\nHoje é ${hoje.data} ${hoje.horaMinuto} em ${config.TIMEZONE}`);
}

client.once(Events.ClientReady, async () => {
    console.log(`✅ Bot online como ${client.user.tag}`);

    if (MODO_TESTE) {
        try {
            await testar();
        } catch (error) {
            console.error('❌ Erro no teste:', error);
            process.exitCode = 1;
        }
        await client.destroy();
        return;
    }

    iniciarAgendador(client);
});

client.on(Events.Error, (error) => console.error('❌ Erro do cliente Discord:', error));
process.on('unhandledRejection', (error) => console.error('❌ Promise rejeitada sem tratamento:', error));

async function encerrar(sinal) {
    console.log(`👋 ${sinal} recebido, a desligar...`);
    await client.destroy();
    process.exit(0);
}
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));

client.login(config.BOT_TOKEN).catch((error) => {
    console.error('❌ Falha no login (BOT_TOKEN inválido?):', error.message);
    process.exit(1);
});
