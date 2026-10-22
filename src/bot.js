const os = require('os');
const { once } = require('events');
const { Client, Events, GatewayIntentBits } = require('discord.js');
const { version } = require('../package.json');
const config = require('./config');
const settings = require('./settings');
const store = require('./store');
const { verificarAgora } = require('./scheduler');
const { registarComandos, tratarInteracao } = require('./commands');
const { migrarConfigAntiga } = require('./migrate');

const LIGAR_TIMEOUT_MS = 30 * 1000;
const NOVA_TENTATIVA_MS = 30 * 1000;

// The connected client changes when the token changes, so everyone reads it from here
const estado = {
    /** @type {Client | null} */
    cliente: null,
    erroLogin: null,
    // The saved token stopped working: the setup page opens again to replace it
    recuperacao: false,
};

function criarCliente() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
        ],
    });
    client.on(Events.GuildCreate, (guild) => {
        console.log(`➕ Added to server ${guild.name} (${guild.id})`);
        registarComandos(guild).catch((error) => console.error(`❌ Failed to register slash commands in ${guild.name}:`, error));
    });
    client.on(Events.GuildDelete, (guild) => {
        // Discord also sends this during outages, with the server marked unavailable: keep its settings then
        if (guild.available === false) return;
        console.log(`➖ Removed from server ${guild.name ?? guild.id}, deleting its settings`);
        store.removerServidor(guild.id);
    });
    client.on(Events.InteractionCreate, tratarInteracao);
    client.on(Events.Error, (error) => console.error('❌ Discord client error:', error));
    return client;
}

/** A clear explanation for login errors. Errors marked `definitivo` won't go away by retrying. */
function erroDeLogin(error) {
    const definitivo = (mensagem) => Object.assign(new Error(mensagem), { definitivo: true, causa: error });
    if (error.code === 'TokenInvalid' || /invalid token|401/i.test(error.message)) {
        return definitivo('The bot token is invalid. Get a new one in Developer Portal → Bot → Reset Token.');
    }
    if (error.code === 4014 || /disallowed intents/i.test(error.message)) {
        return definitivo('Turn on Message Content Intent in Developer Portal → Bot, then try again.');
    }
    return Object.assign(new Error(`Could not connect to Discord: ${error.message}`), { definitivo: false, causa: error });
}

async function aposLigar(client) {
    console.log(`✅ Bot v${version} online as ${client.user.tag} in ${client.guilds.cache.size} servers`);
    await migrarConfigAntiga(client).catch((error) => console.error('❌ Migration failed:', error));
    verificarAgora(() => estado.cliente);
    for (const guild of client.guilds.cache.values()) {
        await registarComandos(guild).catch((error) => console.error(`❌ Failed to register slash commands in ${guild.name}:`, error));
    }
}

/**
 * Connects with the given token and only then replaces the current client,
 * so a wrong token never disconnects a bot that is working.
 */
async function iniciarBot(token) {
    const novo = criarCliente();
    let temporizador;
    try {
        await Promise.race([
            (async () => {
                await novo.login(token);
                if (!novo.isReady()) await once(novo, Events.ClientReady);
            })(),
            new Promise((_, rejeitar) => {
                temporizador = setTimeout(() => rejeitar(new Error('timed out')), LIGAR_TIMEOUT_MS);
            }),
        ]);
    } catch (error) {
        await novo.destroy().catch(() => {});
        throw erroDeLogin(error);
    } finally {
        clearTimeout(temporizador);
    }

    const antigo = estado.cliente;
    estado.cliente = novo;
    estado.erroLogin = null;
    estado.recuperacao = false;
    if (antigo) await antigo.destroy().catch(() => {});
    await aposLigar(novo);
}

/** Connects with the configured token, retrying while the problem is temporary (e.g. no network). */
async function ligar() {
    const { botToken } = settings.obter();
    if (!botToken) return;
    try {
        await iniciarBot(botToken);
    } catch (error) {
        estado.erroLogin = error.message;
        console.error(`❌ ${error.message}`);
        if (!error.definitivo) {
            setTimeout(ligar, NOVA_TENTATIVA_MS);
        } else if (settings.origem('botToken') === 'panel') {
            estado.recuperacao = true;
            anunciarSetup();
        } else {
            console.error('   Fix BOT_TOKEN in .env and restart the bot.');
        }
    }
}

/** The setup page is open while the panel isn't fully configured, or when the saved token stopped working. */
function emSetup() {
    return !settings.painelConfigurado() || estado.recuperacao;
}

function enderecosLocais() {
    return Object.values(os.networkInterfaces()).flat()
        .filter((i) => i && i.family === 'IPv4' && !i.internal)
        .map((i) => i.address);
}

function anunciarSetup() {
    const urls = enderecosLocais().map((ip) => `http://${ip}:${config.WEB_PORT}/setup`);
    const { publicUrl } = settings.obter();
    if (publicUrl) urls.push(`${publicUrl}/setup`);
    if (urls.length === 0) urls.push(`http://localhost:${config.WEB_PORT}/setup`);
    console.log(`🔑 Setup needed. Open ${urls.join(' or ')}`);
    console.log(`   Setup code: ${settings.codigoSetup()}`);
}

module.exports = { estado, iniciarBot, ligar, emSetup, anunciarSetup };
