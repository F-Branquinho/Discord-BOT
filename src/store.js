const fs = require('fs');
const path = require('path');
const config = require('./config');

// Configuration and state of every server, in a single JSON file:
// { guilds: { [guildId]: { config: ConfigServidor, estado: EstadoServidor } } }
const FICHEIRO = path.join(config.DATA_DIR, 'guilds.json');

fs.mkdirSync(config.DATA_DIR, { recursive: true });

/**
 * @typedef {{
 *   birthdayChannelId: string, generalChannelId: string, timezone: string, checkTime: string,
 *   language: string, message: string | null, monthlySummary: boolean, enabled: boolean,
 * }} ConfigServidor
 * `message` is a custom birthday message; null means the default for `language`.
 *
 * @typedef {{ data: string | null, enviados: string[], concluido: boolean, resumo: string | null }} EstadoServidor
 * `data` is the last checked day (YYYY-MM-DD), `enviados` who already got a message that day,
 * `resumo` the last month (YYYY-MM) whose summary was posted.
 */

function carregar() {
    try {
        return JSON.parse(fs.readFileSync(FICHEIRO, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return { guilds: {} };
        // Keep a copy of the broken file instead of losing it
        const copia = `${FICHEIRO}.corrupt-${Date.now()}`;
        fs.copyFileSync(FICHEIRO, copia);
        console.error(`❌ Unreadable ${FICHEIRO}, starting fresh (backup at ${copia}):`, error.message);
        return { guilds: {} };
    }
}

const dados = carregar();

function guardar() {
    // Write to a temporary file and rename it, so a crash never leaves a half-written file
    const temporario = `${FICHEIRO}.tmp`;
    fs.writeFileSync(temporario, JSON.stringify(dados, null, 2));
    fs.renameSync(temporario, FICHEIRO);
}

/** @returns {ConfigServidor} */
function configPorOmissao() {
    return {
        birthdayChannelId: '',
        generalChannelId: '',
        timezone: config.DEFAULT_TIMEZONE,
        checkTime: config.DEFAULT_CHECK_TIME,
        language: config.DEFAULT_LANGUAGE,
        message: config.DEFAULT_MESSAGE,
        monthlySummary: config.DEFAULT_MONTHLY_SUMMARY,
        enabled: true,
    };
}

/** @returns {EstadoServidor} */
function estadoVazio() {
    return { data: null, enviados: [], concluido: false, resumo: null };
}

/**
 * Server configuration, or null until both channels have been chosen.
 * Fields added in later versions get their defaults.
 * @returns {ConfigServidor | null}
 */
function obterConfig(guildId) {
    const cfg = dados.guilds[guildId]?.config;
    return cfg?.birthdayChannelId && cfg?.generalChannelId ? { ...configPorOmissao(), ...cfg } : null;
}

/** @returns {[string, ConfigServidor][]} */
function servidoresConfigurados() {
    return Object.keys(dados.guilds)
        .map((id) => [id, obterConfig(id)])
        .filter(([, cfg]) => cfg);
}

/** @param {ConfigServidor} cfg */
function guardarConfig(guildId, cfg) {
    dados.guilds[guildId] = { estado: estadoVazio(), ...dados.guilds[guildId], config: cfg };
    guardar();
}

/** @returns {EstadoServidor} */
function lerEstado(guildId) {
    return { ...estadoVazio(), ...dados.guilds[guildId]?.estado };
}

/** @param {EstadoServidor} estado */
function guardarEstado(guildId, estado) {
    dados.guilds[guildId] = { config: configPorOmissao(), ...dados.guilds[guildId], estado };
    guardar();
}

function existeServidor(guildId) {
    return Boolean(dados.guilds[guildId]);
}

module.exports = {
    configPorOmissao,
    obterConfig,
    servidoresConfigurados,
    guardarConfig,
    lerEstado,
    guardarEstado,
    existeServidor,
};
