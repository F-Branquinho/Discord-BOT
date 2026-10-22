const path = require('path');
require('dotenv').config();
const { IDIOMAS, IDIOMA_POR_OMISSAO } = require('./i18n');

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

// The bot token, OAuth2 client secret and public address are in settings.js,
// because they can also be set on the setup page.
const config = {
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

    // Where the web panel listens
    WEB_HOST: opcional('WEB_HOST') || '0.0.0.0',
    WEB_PORT: Number(opcional('WEB_PORT') || 3000),
};

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
if (!Number.isInteger(config.WEB_PORT) || config.WEB_PORT < 1 || config.WEB_PORT > 65535) {
    console.error(`❌ Invalid WEB_PORT: "${process.env.WEB_PORT}"`);
    process.exit(1);
}

module.exports = { ...config, horaValida, fusoValido };
