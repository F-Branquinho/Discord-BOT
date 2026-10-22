const fs = require('fs');
const path = require('path');
const config = require('./config');
const store = require('./store');

/**
 * Configuração antiga do .env (um só servidor), ou null se não existir.
 * @param {import('discord.js').Client} client
 */
async function configAntiga(client) {
    if (!config.LEGACY_BIRTHDAY_CHANNEL_ID || !config.LEGACY_GENERAL_CHANNEL_ID) return null;
    const canal = await client.channels.fetch(config.LEGACY_GENERAL_CHANNEL_ID).catch(() => null);
    if (!canal?.guild) {
        console.warn(`⚠ GENERAL_CHANNEL_ID ${config.LEGACY_GENERAL_CHANNEL_ID} from .env not found, ignoring it`);
        return null;
    }
    return {
        guild: canal.guild,
        cfg: {
            ...store.configPorOmissao(),
            birthdayChannelId: config.LEGACY_BIRTHDAY_CHANNEL_ID,
            generalChannelId: config.LEGACY_GENERAL_CHANNEL_ID,
        },
    };
}

/**
 * Passa a configuração antiga do .env e o estado.json para o guilds.json, uma única vez.
 * @param {import('discord.js').Client} client
 */
async function migrarConfigAntiga(client) {
    const antiga = await configAntiga(client);
    if (!antiga || store.existeServidor(antiga.guild.id)) return;

    store.guardarConfig(antiga.guild.id, antiga.cfg);
    const ficheiroEstado = path.join(config.DATA_DIR, 'estado.json');
    if (fs.existsSync(ficheiroEstado)) {
        try {
            const estado = JSON.parse(fs.readFileSync(ficheiroEstado, 'utf8'));
            store.guardarEstado(antiga.guild.id, { ...store.lerEstado(antiga.guild.id), ...estado });
            fs.renameSync(ficheiroEstado, `${ficheiroEstado}.migrated`);
        } catch (error) {
            console.warn('⚠ Could not migrate estado.json:', error.message);
        }
    }
    console.log(`📦 Migrated .env configuration to server ${antiga.guild.name}. BIRTHDAY_CHANNEL_ID and GENERAL_CHANNEL_ID can now be removed from .env.`);
}

module.exports = { configAntiga, migrarConfigAntiga };
