// Small enhancements for the panel pages. Everything still works without JavaScript.

// Server settings: the custom message placeholder follows the chosen message language
(() => {
    const idioma = document.getElementById('language');
    const mensagem = document.getElementById('message');
    if (!idioma || !mensagem || !idioma.dataset.mensagens) return;

    const mensagens = JSON.parse(idioma.dataset.mensagens);
    idioma.addEventListener('change', () => {
        mensagem.placeholder = mensagens[idioma.value] ?? '';
    });
})();
