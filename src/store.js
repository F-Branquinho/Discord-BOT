const fs = require('fs');
const path = require('path');
const config = require('./config');

// Configuração e estado de cada servidor, num único ficheiro JSON:
// { guilds: { [guildId]: { config: ConfigServidor, estado: EstadoServidor } } }
const FICHEIRO = path.join(config.DATA_DIR, 'guilds.json');

fs.mkdirSync(config.DATA_DIR, { recursive: true });

/**
 * @typedef {{
 *   birthdayChannelId: string, generalChannelId: string, timezone: string, checkTime: string,
 *   message: string, monthlySummary: boolean, enabled: boolean,
 * }} ConfigServidor
 * @typedef {{ data: string | null, enviados: string[], concluido: boolean, resumo: string | null }} EstadoServidor
 */

function carregar() {
    try {
        return JSON.parse(fs.readFileSync(FICHEIRO, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return { guilds: {} };
        // Guardar uma cópia do ficheiro estragado em vez de o perder
        const copia = `${FICHEIRO}.corrupt-${Date.now()}`;
        fs.copyFileSync(FICHEIRO, copia);
        console.error(`❌ Unreadable ${FICHEIRO}, starting fresh (backup at ${copia}):`, error.message);
        return { guilds: {} };
    }
}

const dados = carregar();

function guardar() {
    // Escrever para um ficheiro temporário e renomear evita ficheiros corrompidos
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
        message: config.DEFAULT_MESSAGE,
        monthlySummary: config.DEFAULT_MONTHLY_SUMMARY,
        enabled: true,
    };
}

/** @returns {EstadoServidor} */
function estadoVazio() {
    return { data: null, enviados: [], concluido: false, resumo: null };
}

/** Configuração do servidor, ou null se ainda não tiver os dois canais escolhidos. */
function obterConfig(guildId) {
    const cfg = dados.guilds[guildId]?.config;
    return cfg?.birthdayChannelId && cfg?.generalChannelId ? cfg : null;
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
