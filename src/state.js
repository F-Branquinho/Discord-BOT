const fs = require('fs');
const path = require('path');
const config = require('./config');

const FICHEIRO_ESTADO = path.join(config.DATA_DIR, 'estado.json');

fs.mkdirSync(config.DATA_DIR, { recursive: true });

/**
 * @returns {{ data: string | null, enviados: string[], concluido: boolean }}
 */
function lerEstado() {
    try {
        return JSON.parse(fs.readFileSync(FICHEIRO_ESTADO, 'utf8'));
    } catch (error) {
        if (error.code !== 'ENOENT') console.warn('⚠ Estado ilegível, a começar do zero:', error.message);
        return { data: null, enviados: [], concluido: false };
    }
}

function guardarEstado(estado) {
    // Escrever para um ficheiro temporário e renomear evita estados corrompidos
    const temporario = `${FICHEIRO_ESTADO}.tmp`;
    fs.writeFileSync(temporario, JSON.stringify(estado, null, 2));
    fs.renameSync(temporario, FICHEIRO_ESTADO);
}

module.exports = { lerEstado, guardarEstado };
