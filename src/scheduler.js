const cron = require('node-cron');
const { lerAniversarios, enviarResumoMensal, verificarAniversarios } = require('./birthdays');
const store = require('./store');

const ESPERA_APOS_ERRO_MS = 5 * 60 * 1000;

/**
 * Data e hora atuais no fuso horário indicado.
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
 * Faz a verificação de hoje de um servidor. Como o estado fica em disco,
 * reinícios não duplicam mensagens. Em caso de erro, tenta de novo daqui a 5 min.
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
    let { resumo } = estado; // último mês (AAAA-MM) com resumo enviado
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
 * Corre a verificação de cada servidor que já passou a sua hora e ainda não foi verificado hoje.
 * Também apanha o dia de hoje se o bot esteve em baixo à hora marcada.
 */
function tick(client) {
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
 * Cada servidor tem a sua hora e fuso, por isso o cron corre de minuto a minuto
 * e o tick decide que servidores já chegaram à hora.
 * @param {import('discord.js').Client} client
 */
function iniciarAgendador(client) {
    cron.schedule('* * * * *', () => tick(client));
    console.log(`⏰ Scheduler started (${store.servidoresConfigurados().length} configured servers)`);
    tick(client);
}

/** Estado da próxima verificação de um servidor, para o /aniversario-status e o painel. */
function proximaVerificacao(guildId, cfg) {
    const agora = agoraNoFuso(cfg.timezone);
    const estado = store.lerEstado(guildId);
    if (!cfg.enabled) return 'desligada';
    if (estado.data === agora.data && estado.concluido) return `amanhã às ${cfg.checkTime} (${cfg.timezone})`;
    if (agora.horaMinuto < cfg.checkTime) return `hoje às ${cfg.checkTime} (${cfg.timezone})`;
    return 'a decorrer, a tentar de novo de 5 em 5 min';
}

module.exports = { agoraNoFuso, iniciarAgendador, proximaVerificacao };
