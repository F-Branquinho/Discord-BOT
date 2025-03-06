async function onMessage(message) {
    if (message.author.bot) return;

    console.log(`Mensagem recebida de ${message.author.username}: ${message.content}`);

}

module.exports = { onMessage };