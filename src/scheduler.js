const cron = require('node-cron');
const config = require('./config');
const { verificarAniversarios } = require('./birthdays');
const { lerEstado, guardarEstado } = require('./state');

const ESPERA_APOS_ERRO_MS = 5 * 60 * 1000;

/**
 * Data e hora atuais no fuso horário configurado.
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

let aCorrer = false;

/**
 * Faz a verificação de hoje, se ainda não foi feita. Como o estado fica em disco,
 * reinícios do contentor não duplicam mensagens. Em caso de erro, tenta de novo daqui a 5 min.
 * @param {import('discord.js').Client} client
 */
async function executarVerificacao(client) {
    if (aCorrer) return;

    const agora = agoraNoFuso(config.TIMEZONE);
    const estado = lerEstado();
    if (estado.data === agora.data && estado.concluido) return;

    aCorrer = true;
    const enviados = new Set(estado.data === agora.data ? estado.enviados : []);
    const guardar = (concluido) => guardarEstado({ data: agora.data, enviados: [...enviados], concluido });

    try {
        console.log(`🎂 A verificar aniversários de ${agora.data}...`);
        await verificarAniversarios(client, agora, enviados, (userId) => {
            enviados.add(userId);
            guardar(false);
        });
        guardar(true);
        console.log('✅ Verificação concluída');
    } catch (error) {
        console.error(`❌ Erro na verificação, nova tentativa em ${ESPERA_APOS_ERRO_MS / 60000} min:`, error);
        setTimeout(() => executarVerificacao(client), ESPERA_APOS_ERRO_MS);
    } finally {
        aCorrer = false;
    }
}

/**
 * Agenda a verificação diária para CHECK_TIME no fuso TIMEZONE.
 * Se o bot arrancar depois dessa hora e a verificação de hoje ainda não tiver sido feita
 * (ex: estava em baixo às 00:01), faz logo.
 * @param {import('discord.js').Client} client
 */
function iniciarAgendador(client) {
    const [hora, minuto] = config.CHECK_TIME.split(':').map(Number);
    cron.schedule(`${minuto} ${hora} * * *`, () => executarVerificacao(client), { timezone: config.TIMEZONE });
    console.log(`⏰ Verificação diária agendada para as ${config.CHECK_TIME} (${config.TIMEZONE})`);

    if (agoraNoFuso(config.TIMEZONE).horaMinuto >= config.CHECK_TIME) {
        executarVerificacao(client);
    }
}

module.exports = { agoraNoFuso, iniciarAgendador };
