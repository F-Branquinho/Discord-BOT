const path = require('path');
require('dotenv').config();
const { IDIOMAS, IDIOMA_POR_OMISSAO } = require('./i18n');

function obrigatoria(nome) {
    const valor = process.env[nome]?.trim();
    if (!valor) {
        console.error(`❌ Missing environment variable: ${nome}`);
        process.exit(1);
    }
    return valor;
}

function opcional(nome) {
    return process.env[nome]?.trim() || null;
}

function horaValida(hora) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(hora);
}

function fusoValido(fuso) {
    try {
        new Intl.DateTimeFormat('en-GB', { timeZone: fuso });
        return true;
    } catch {
        return false;
    }
}

const config = {
    BOT_TOKEN: obrigatoria('BOT_TOKEN'),
    DATA_DIR: path.resolve(opcional('DATA_DIR') || path.join(__dirname, '..', 'data')),

    // Defaults for new servers (each server can change them in the panel)
    DEFAULT_TIMEZONE: opcional('TIMEZONE') || 'Europe/Lisbon',
    DEFAULT_CHECK_TIME: opcional('CHECK_TIME') || '00:01',
    DEFAULT_LANGUAGE: opcional('BOT_LANGUAGE') || IDIOMA_POR_OMISSAO,
    LANGUAGE_SET: Boolean(opcional('BOT_LANGUAGE')),
    // Custom birthday message; when empty, each server uses the default for its language
    DEFAULT_MESSAGE: opcional('BIRTHDAY_MESSAGE'),
    DEFAULT_MONTHLY_SUMMARY: opcional('MONTHLY_SUMMARY')?.toLowerCase() !== 'false',

    // Old single-server configuration; migrated automatically on first start
    LEGACY_BIRTHDAY_CHANNEL_ID: opcional('BIRTHDAY_CHANNEL_ID'),
    LEGACY_GENERAL_CHANNEL_ID: opcional('GENERAL_CHANNEL_ID'),

    // Web panel (only starts when both PUBLIC_URL and DISCORD_CLIENT_SECRET are set)
    PUBLIC_URL: opcional('PUBLIC_URL')?.replace(/\/+$/, '') ?? null,
    DISCORD_CLIENT_SECRET: opcional('DISCORD_CLIENT_SECRET'),
    WEB_HOST: opcional('WEB_HOST') || '0.0.0.0',
    WEB_PORT: Number(opcional('WEB_PORT') || 3000),
};
config.WEB_ENABLED = Boolean(config.PUBLIC_URL && config.DISCORD_CLIENT_SECRET);

if (!horaValida(config.DEFAULT_CHECK_TIME)) {
    console.error(`❌ Invalid CHECK_TIME: "${config.DEFAULT_CHECK_TIME}" (format HH:MM, e.g. 00:01)`);
    process.exit(1);
}
if (!fusoValido(config.DEFAULT_TIMEZONE)) {
    console.error(`❌ Invalid TIMEZONE: "${config.DEFAULT_TIMEZONE}" (e.g. Europe/Lisbon)`);
    process.exit(1);
}
if (!IDIOMAS[config.DEFAULT_LANGUAGE]) {
    console.error(`❌ Invalid BOT_LANGUAGE: "${config.DEFAULT_LANGUAGE}" (one of: ${Object.keys(IDIOMAS).join(', ')})`);
    process.exit(1);
}
if (config.PUBLIC_URL && !/^https?:\/\/[^/]+$/.test(config.PUBLIC_URL)) {
    console.error(`❌ Invalid PUBLIC_URL: "${config.PUBLIC_URL}" (e.g. https://bot.example.com)`);
    process.exit(1);
}
if (!Number.isInteger(config.WEB_PORT) || config.WEB_PORT < 1 || config.WEB_PORT > 65535) {
    console.error(`❌ Invalid WEB_PORT: "${process.env.WEB_PORT}"`);
    process.exit(1);
}

module.exports = { ...config, horaValida, fusoValido };
