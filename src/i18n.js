// Languages for the messages the bot posts in each server (birthday message and monthly summary).
// Commands and the panel are always in English.

const IDIOMAS = {
    en: {
        nome: 'English',
        locale: 'en-US',
        mensagemAniversario: '🎉 Happy birthday, {user}! 🎂 Have an amazing day!',
        // Used when several people have their birthday on the same day
        mensagemAniversarioVarios: '🎉 Happy birthday, {user}! 🎂 Have an amazing day!',
        tituloResumo: (mes) => `📅 **Birthdays in ${mes}**`,
    },
    pt: {
        nome: 'Português',
        locale: 'pt-PT',
        mensagemAniversario: '🎉 Hoje é o teu dia, {user}! 🎂 Feliz aniversário!',
        mensagemAniversarioVarios: '🎉 Hoje é o vosso dia, {user}! 🎂 Feliz aniversário!',
        tituloResumo: (mes) => `📅 **Aniversários de ${mes}**`,
    },
};

const IDIOMA_POR_OMISSAO = 'en';

/** Falls back to English for unknown codes. */
function idioma(codigo) {
    return IDIOMAS[codigo] ?? IDIOMAS[IDIOMA_POR_OMISSAO];
}

module.exports = { IDIOMAS, IDIOMA_POR_OMISSAO, idioma };
