const path = require('path');
require('dotenv').config();

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

    // Valores por omissão para servidores novos (cada servidor muda-os no painel)
    DEFAULT_TIMEZONE: opcional('TIMEZONE') || 'Europe/Lisbon',
    DEFAULT_CHECK_TIME: opcional('CHECK_TIME') || '00:01',
    DEFAULT_MESSAGE: opcional('BIRTHDAY_MESSAGE') || '🎉 Hoje é o teu dia, {user}! 🎂 Feliz aniversário!',
    DEFAULT_MONTHLY_SUMMARY: opcional('MONTHLY_SUMMARY')?.toLowerCase() !== 'false',

    // Configuração antiga de um só servidor; migrada automaticamente no primeiro arranque
    LEGACY_BIRTHDAY_CHANNEL_ID: opcional('BIRTHDAY_CHANNEL_ID'),
    LEGACY_GENERAL_CHANNEL_ID: opcional('GENERAL_CHANNEL_ID'),

    // Painel web (só arranca se PUBLIC_URL e DISCORD_CLIENT_SECRET estiverem definidos)
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
if (config.PUBLIC_URL && !/^https?:\/\/[^/]+$/.test(config.PUBLIC_URL)) {
    console.error(`❌ Invalid PUBLIC_URL: "${config.PUBLIC_URL}" (e.g. https://bot.example.com)`);
    process.exit(1);
}
if (!Number.isInteger(config.WEB_PORT) || config.WEB_PORT < 1 || config.WEB_PORT > 65535) {
    console.error(`❌ Invalid WEB_PORT: "${process.env.WEB_PORT}"`);
    process.exit(1);
}

module.exports = { ...config, horaValida, fusoValido };
