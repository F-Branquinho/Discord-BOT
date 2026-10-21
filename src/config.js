const path = require('path');
require('dotenv').config();

function obrigatoria(nome) {
    const valor = process.env[nome]?.trim();
    if (!valor) {
        console.error(`❌ Variável de ambiente em falta: ${nome}`);
        process.exit(1);
    }
    return valor;
}

const config = {
    BOT_TOKEN: obrigatoria('BOT_TOKEN'),
    BIRTHDAY_CHANNEL_ID: obrigatoria('BIRTHDAY_CHANNEL_ID'),
    GENERAL_CHANNEL_ID: obrigatoria('GENERAL_CHANNEL_ID'),
    TIMEZONE: process.env.TIMEZONE?.trim() || 'Europe/Lisbon',
    CHECK_TIME: process.env.CHECK_TIME?.trim() || '00:01',
    BIRTHDAY_MESSAGE: process.env.BIRTHDAY_MESSAGE?.trim() || '🎉 Hoje é o teu dia, {user}! 🎂 Feliz aniversário!',
    DATA_DIR: path.resolve(process.env.DATA_DIR?.trim() || path.join(__dirname, '..', 'data')),
};

if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(config.CHECK_TIME)) {
    console.error(`❌ CHECK_TIME inválido: "${config.CHECK_TIME}" (formato HH:MM, ex: 00:01)`);
    process.exit(1);
}

try {
    new Intl.DateTimeFormat('en-GB', { timeZone: config.TIMEZONE });
} catch {
    console.error(`❌ TIMEZONE inválido: "${config.TIMEZONE}" (ex: Europe/Lisbon)`);
    process.exit(1);
}

module.exports = config;
