const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Bot credentials and the panel's public address. Each value comes from .env when it is set there,
// otherwise from data/settings.json, which the setup page and the Bot settings page write.
const FICHEIRO = path.join(config.DATA_DIR, 'settings.json');
const FICHEIRO_CODIGO = path.join(config.DATA_DIR, 'setup-code');
const VARIAVEIS = { botToken: 'BOT_TOKEN', clientSecret: 'DISCORD_CLIENT_SECRET', publicUrl: 'PUBLIC_URL' };

fs.mkdirSync(config.DATA_DIR, { recursive: true });

function escreverPrivado(ficheiro, conteudo) {
    // Write to a temporary file and rename it; only the bot's user can read it
    const temporario = `${ficheiro}.tmp`;
    fs.writeFileSync(temporario, conteudo, { mode: 0o600 });
    fs.renameSync(temporario, ficheiro);
}

function carregar() {
    try {
        return JSON.parse(fs.readFileSync(FICHEIRO, 'utf8'));
    } catch (error) {
        if (error.code !== 'ENOENT') console.error(`❌ Unreadable ${FICHEIRO}:`, error.message);
        return {};
    }
}

let guardadas = carregar();

function doEnv(campo) {
    return process.env[VARIAVEIS[campo]]?.trim() || null;
}

/** @returns {{ botToken: string | null, clientSecret: string | null, publicUrl: string | null }} */
function obter() {
    const valor = (campo) => doEnv(campo) ?? guardadas[campo] ?? null;
    return {
        botToken: valor('botToken'),
        clientSecret: valor('clientSecret'),
        publicUrl: valor('publicUrl')?.replace(/\/+$/, '') ?? null,
    };
}

/** Where a value comes from: 'env', 'panel', or null when it isn't set. */
function origem(campo) {
    if (doEnv(campo)) return 'env';
    if (guardadas[campo]) return 'panel';
    return null;
}

/** Saves values set in the panel (values coming from .env are never written here). */
function guardar(novas) {
    guardadas = { ...guardadas, ...novas };
    escreverPrivado(FICHEIRO, JSON.stringify(guardadas, null, 2));
}

/** The panel needs the token, the OAuth2 client secret and the public address. */
function painelConfigurado() {
    const s = obter();
    return Boolean(s.botToken && s.clientSecret && s.publicUrl);
}

function urlValido(url) {
    return /^https?:\/\/[^/\s]+$/.test(url ?? '');
}

/**
 * One-time code that protects the setup page, so nobody else can set up the bot first.
 * It survives restarts until the setup is done.
 */
function codigoSetup() {
    try {
        return fs.readFileSync(FICHEIRO_CODIGO, 'utf8').trim();
    } catch {
        const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const letras = Array.from(crypto.randomBytes(8), (b) => alfabeto[b % alfabeto.length]).join('');
        const codigo = `${letras.slice(0, 4)}-${letras.slice(4)}`;
        escreverPrivado(FICHEIRO_CODIGO, codigo);
        return codigo;
    }
}

function apagarCodigoSetup() {
    fs.rmSync(FICHEIRO_CODIGO, { force: true });
}

module.exports = { obter, origem, guardar, painelConfigurado, urlValido, codigoSetup, apagarCodigoSetup };
