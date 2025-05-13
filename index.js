// Importar dependências
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { onReady } = require('./events/ready');
const { onMessage } = require('./events/messageHandler');

// Inicializar o cliente do bot com as intenções necessárias
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Evento 'ready' - quando o bot estiver online
client.once('ready', async () => {
    await onReady(client);
});

// Evento para capturar mensagens
client.on('messageCreate', async (message) => {
    await onMessage(message);
});

// Iniciar o bot
client.login(process.env.BOT_TOKEN);

// Encerrar o processo após 5 minutos em ambiente CI
if (process.env.CI) {
    setTimeout(() => {
        console.log('CI timeout atingido. A terminar o bot...');
        process.exit(0);
    }, 300000); // 5 minutos
}
