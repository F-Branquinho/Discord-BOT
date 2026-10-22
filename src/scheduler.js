const cron = require('node-cron');
const { lerAniversarios, enviarResumoMensal, verificarAniversarios } = require('./birthdays');
const store = require('./store');

const ESPERA_APOS_ERRO_MS = 5 * 60 * 1000;

/**
 * Current date and time in the given timezone.
 */
function agoraNoFuso(timeZone) {
    const partes = Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', {
            timeZone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(new Date()).map((p) => [p.type, p.value]),
    );
    return {
        ano: Number(partes.year),
        mes: Number(partes.month),
        dia: Number(partes.day),
        data: `${partes.year}-${partes.month}-${partes.day}`,
        horaMinuto: `${partes.hour}:${partes.minute}`,
    };
}

const aCorrer = new Set();
const proximaTentativa = new Map();

/**
 * Runs today's check for one server. State is kept on disk, so restarts never
 * send duplicate messages. On error, it retries 5 minutes later.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 * @param {import('./store').ConfigServidor} cfg
 */
async function verificarServidor(client, guildId, cfg) {
    const agora = agoraNoFuso(cfg.timezone);
    const estado = store.lerEstado(guildId);
    const nome = client.guilds.cache.get(guildId)?.name ?? guildId;

    aCorrer.add(guildId);
    const enviados = new Set(estado.data === agora.data ? estado.enviados : []);
    const mesAtual = agora.data.slice(0, 7);
    let { resumo } = estado;
    const guardar = (concluido) => store.guardarEstado(guildId, { data: agora.data, enviados: [...enviados], concluido, resumo });

    try {
        console.log(`🎂 [${nome}] Checking birthdays for ${agora.data}...`);
        const lista = await lerAniversarios(client, cfg.birthdayChannelId);

        if (cfg.monthlySummary && agora.dia === 1 && resumo !== mesAtual) {
            await enviarResumoMensal(client, cfg, lista, agora);
            resumo = mesAtual;
            guardar(false);
        }

        await verificarAniversarios(client, cfg, lista, agora, enviados, (userId) => {
            enviados.add(userId);
            guardar(false);
        });
        guardar(true);
        proximaTentativa.delete(guildId);
        console.log(`✅ [${nome}] Check complete`);
    } catch (error) {
        console.error(`❌ [${nome}] Check failed, retrying in ${ESPERA_APOS_ERRO_MS / 60000} min:`, error);
        proximaTentativa.set(guildId, Date.now() + ESPERA_APOS_ERRO_MS);
    } finally {
        aCorrer.delete(guildId);
    }
}

/**
 * Checks every server that has passed its check time and hasn't been checked today.
 * This also catches up on today if the bot was down at the scheduled time.
 */
function tick(obterCliente) {
    const client = obterCliente();
    if (!client?.isReady()) return;
    for (const [guildId, cfg] of store.servidoresConfigurados()) {
        if (!cfg.enabled || !client.guilds.cache.has(guildId) || aCorrer.has(guildId)) continue;
        if (Date.now() < (proximaTentativa.get(guildId) ?? 0)) continue;

        const agora = agoraNoFuso(cfg.timezone);
        if (agora.horaMinuto < cfg.checkTime) continue;
        const estado = store.lerEstado(guildId);
        if (estado.data === agora.data && estado.concluido) continue;

        verificarServidor(client, guildId, cfg);
    }
}

/**
 * Each server has its own time and timezone, so cron runs every minute
 * and the tick decides which servers are due.
 * @param {() => import('discord.js').Client | null} obterCliente - the current client changes when the token changes
 */
function iniciarAgendador(obterCliente) {
    cron.schedule('* * * * *', () => tick(obterCliente));
    console.log(`⏰ Scheduler started (${store.servidoresConfigurados().length} configured servers)`);
}

/** Runs a tick right away, e.g. when the bot connects after being down. */
function verificarAgora(obterCliente) {
    tick(obterCliente);
}

/** When a server's next check happens, for /birthday-status and the panel. */
function proximaVerificacao(guildId, cfg) {
    const agora = agoraNoFuso(cfg.timezone);
    const estado = store.lerEstado(guildId);
    if (!cfg.enabled) return 'off';
    if (estado.data === agora.data && estado.concluido) return `tomorrow at ${cfg.checkTime} (${cfg.timezone})`;
    if (agora.horaMinuto < cfg.checkTime) return `today at ${cfg.checkTime} (${cfg.timezone})`;
    return 'in progress, retrying every 5 min';
}

/** "22/10/2026 ✅" for the last check, for /birthday-status and the panel. */
function ultimaVerificacao(guildId) {
    const estado = store.lerEstado(guildId);
    if (!estado.data) return 'none yet';
    return `${estado.data.split('-').reverse().join('/')} ${estado.concluido ? '✅' : '⚠ incomplete'}`;
}

module.exports = { agoraNoFuso, iniciarAgendador, verificarAgora, proximaVerificacao, ultimaVerificacao };
