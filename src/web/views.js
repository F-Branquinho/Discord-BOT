// Panel pages, as plain server-rendered HTML (no JavaScript in the browser)

function esc(valor) {
    return String(valor ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function avatarUtilizador(id, avatar) {
    return avatar
        ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=64`
        : 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function iconeServidor(id, nome, icon) {
    if (icon) return `<img class="icone" src="https://cdn.discordapp.com/icons/${esc(id)}/${esc(icon)}.png?size=64" alt="">`;
    const iniciais = nome.split(/\s+/).map((p) => p[0]).join('').slice(0, 3);
    return `<span class="icone icone-texto">${esc(iniciais)}</span>`;
}

const CSS = `
:root {
  --fundo: #f2f3f5; --cartao: #ffffff; --texto: #1e1f22; --suave: #5c5e66; --borda: #dcdde1;
  --marca: #d63fbf; --marca-texto: #ffffff; --ok: #1f8b4c; --aviso: #b26b00; --erro: #c62828;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fundo: #1e1f22; --cartao: #2b2d31; --texto: #f2f3f5; --suave: #a7a9b0; --borda: #3f4147;
    --marca: #f47fff; --marca-texto: #1e1f22; --ok: #57d68d; --aviso: #f0b232; --erro: #ff6b6b;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; background: var(--fundo); color: var(--texto); }
main { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
header .quem { display: flex; align-items: center; gap: 10px; }
h1 { font-size: 1.6rem; margin: 0 0 8px; }
h2 { font-size: 1.15rem; margin: 0 0 12px; }
a { color: var(--marca); }
.cartao { background: var(--cartao); border: 1px solid var(--borda); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
.suave { color: var(--suave); }
.botao { display: inline-block; background: var(--marca); color: var(--marca-texto); border: 0; border-radius: 8px;
  padding: 10px 18px; font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; }
.botao.secundario { background: transparent; color: var(--texto); border: 1px solid var(--borda); }
.avatar { width: 36px; height: 36px; border-radius: 50%; }
.icone { width: 48px; height: 48px; border-radius: 14px; flex-shrink: 0; }
.icone-texto { display: inline-flex; align-items: center; justify-content: center; background: var(--borda); font-weight: 700; font-size: .9rem; }
.servidor { display: flex; align-items: center; gap: 14px; }
.servidor .nome { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.etiqueta { font-size: .8rem; font-weight: 600; }
.etiqueta.ok { color: var(--ok); } .etiqueta.aviso { color: var(--aviso); } .etiqueta.erro { color: var(--erro); }
label { display: block; font-weight: 600; margin: 16px 0 6px; }
label.caixa { display: flex; align-items: center; gap: 8px; font-weight: 400; }
select, input[type=text], input[type=time], textarea { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--borda);
  background: var(--fundo); color: var(--texto); font: inherit; }
textarea { min-height: 80px; resize: vertical; }
.ajuda { font-size: .85rem; color: var(--suave); margin-top: 4px; }
.alerta { border-radius: 8px; padding: 12px 14px; margin-bottom: 16px; border: 1px solid; }
.alerta.ok { border-color: var(--ok); color: var(--ok); }
.alerta.aviso { border-color: var(--aviso); color: var(--aviso); }
.alerta.erro { border-color: var(--erro); color: var(--erro); }
.alerta ul { margin: 0; padding-left: 20px; }
.grelha { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
@media (max-width: 560px) { .grelha { grid-template-columns: 1fr; } }
.lista { margin: 0; padding-left: 20px; }
.centro { text-align: center; padding: 48px 20px; }
.centro .avatar { width: 96px; height: 96px; margin-bottom: 12px; }
`;

function layout(titulo, corpo) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<style>${CSS}</style>
</head>
<body><main>${corpo}</main></body>
</html>`;
}

function cabecalho(sessao) {
    return `<header>
  <div class="quem">
    <img class="avatar" src="${avatarUtilizador(sessao.userId, sessao.avatar)}" alt="">
    <span>${esc(sessao.nome)}</span>
  </div>
  <div class="quem">
    ${sessao.dono ? '<a class="botao secundario" href="/settings">Bot settings</a>' : ''}
    <form method="post" action="/logout">
      <input type="hidden" name="csrf" value="${esc(sessao.csrf)}">
      <button class="botao secundario" type="submit">Log out</button>
    </form>
  </div>
</header>`;
}

function alertas(tipo, mensagens) {
    if (!mensagens?.length) return '';
    return `<div class="alerta ${tipo}"><ul>${mensagens.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>`;
}

function paginaInicial({ bot }) {
    return layout('Birthday bot', `
<div class="cartao centro">
  <img class="avatar" src="${avatarUtilizador(bot.id, bot.avatar)}" alt="">
  <h1>${esc(bot.username)}</h1>
  <p class="suave">Wishes your server members a happy birthday on their day and posts the month's birthdays on the 1st.</p>
  <p><a class="botao" href="/login">Log in with Discord</a></p>
</div>`);
}

function paginaServidores({ sessao, servidores }) {
    const itens = servidores.map((s) => {
        let estado;
        let acao;
        if (!s.temBot) {
            estado = '<span class="etiqueta suave">Bot not added</span>';
            acao = `<a class="botao secundario" href="${esc(s.convite)}">Add bot</a>`;
        } else {
            estado = s.configurado
                ? '<span class="etiqueta ok">● Set up</span>'
                : '<span class="etiqueta aviso">● Not set up yet</span>';
            acao = `<a class="botao" href="/server/${esc(s.id)}">Set up</a>`;
        }
        return `<div class="cartao servidor">
  ${iconeServidor(s.id, s.nome, s.icon)}
  <div class="nome">${esc(s.nome)}<br>${estado}${s.comoDono ? ' <span class="etiqueta suave">· as bot owner</span>' : ''}</div>
  ${acao}
</div>`;
    }).join('');

    const vazio = `<div class="cartao"><p>You don't have the <strong>Manage Server</strong> permission in any server.</p></div>`;
    return layout('Your servers', `
${cabecalho(sessao)}
<h1>Your servers</h1>
<p class="suave">Servers where you have the Manage Server permission${sessao.dono ? ', plus every server the bot is in (you own the bot)' : ''}. After adding the bot to a server, <a href="/login">refresh the list</a>.</p>
${servidores.length ? itens : vazio}`);
}

function opcoesCanais(canais, selecionado) {
    const opcoes = ['<option value="">Choose a channel…</option>'];
    let categoria;
    for (const c of canais) {
        if (c.categoria !== categoria) {
            if (categoria !== undefined) opcoes.push('</optgroup>');
            opcoes.push(`<optgroup label="${esc(c.categoria ?? 'No category')}">`);
            categoria = c.categoria;
        }
        opcoes.push(`<option value="${esc(c.id)}"${c.id === selecionado ? ' selected' : ''}>#${esc(c.nome)}</option>`);
    }
    if (categoria !== undefined) opcoes.push('</optgroup>');
    return opcoes.join('');
}

function paginaServidor({ sessao, guild, canais, fusos, idiomas, cfg, erros, avisos, guardado, resumo }) {
    let cartaoResumo = '';
    if (resumo) {
        const doMes = resumo.doMes.length
            ? `<ul class="lista">${resumo.doMes.map((a) => `<li>${esc(a.data)} - ${esc(a.nome)}</li>`).join('')}</ul>`
            : '<p class="suave">Nobody has a birthday this month.</p>';
        cartaoResumo = `<div class="cartao">
  <h2>Status</h2>
  ${resumo.erroLista ? alertas('erro', [resumo.erroLista]) : `<p>📋 ${resumo.total} birthdays on the list</p>`}
  <p>🔍 Last check: ${esc(resumo.ultima)}<br>⏰ Next check: ${esc(resumo.proxima)}</p>
  <h2>${esc(resumo.nomeMes)}</h2>
  ${doMes}
</div>`;
    }

    return layout(`${guild.name}: settings`, `
${cabecalho(sessao)}
<p><a href="/">← Your servers</a></p>
<div class="servidor" style="margin-bottom:16px">
  ${iconeServidor(guild.id, guild.name, guild.icon)}
  <h1 class="nome" style="margin:0">${esc(guild.name)}</h1>
</div>
${guardado ? alertas('ok', ['Settings saved.']) : ''}
${alertas('erro', erros)}
${alertas('aviso', avisos)}
${cartaoResumo}
<form class="cartao" method="post" action="/server/${esc(guild.id)}">
  <input type="hidden" name="csrf" value="${esc(sessao.csrf)}">
  <h2>Settings</h2>

  <label for="birthdayChannelId">Birthday list channel</label>
  <select id="birthdayChannelId" name="birthdayChannelId" required>${opcoesCanais(canais, cfg.birthdayChannelId)}</select>
  <div class="ajuda">One line per person, e.g. <code>25/12 - @person</code>. /birthday-add writes here.</div>

  <label for="generalChannelId">Channel for birthday messages</label>
  <select id="generalChannelId" name="generalChannelId" required>${opcoesCanais(canais, cfg.generalChannelId)}</select>

  <div class="grelha">
    <div>
      <label for="checkTime">Daily check time</label>
      <input id="checkTime" name="checkTime" type="time" value="${esc(cfg.checkTime)}" required>
    </div>
    <div>
      <label for="timezone">Timezone</label>
      <input id="timezone" name="timezone" type="text" list="fusos" value="${esc(cfg.timezone)}" required>
      <datalist id="fusos">${fusos.map((f) => `<option value="${esc(f)}">`).join('')}</datalist>
    </div>
  </div>

  <label for="language">Message language</label>
  <select id="language" name="language" required>${Object.entries(idiomas).map(([codigo, i]) => `<option value="${esc(codigo)}"${codigo === cfg.language ? ' selected' : ''}>${esc(i.nome)}</option>`).join('')}</select>
  <div class="ajuda">Language of the birthday message and the monthly summary posted in this server.</div>

  <label for="message">Custom birthday message (optional)</label>
  <textarea id="message" name="message" maxlength="1500" placeholder="${esc(idiomas[cfg.language]?.mensagemAniversario)}">${esc(cfg.message)}</textarea>
  <div class="ajuda"><code>{user}</code> is replaced by the birthday person's mention. Leave empty to use the default for the chosen language:
    <ul class="lista">${Object.values(idiomas).map((i) => `<li>${esc(i.nome)}: ${esc(i.mensagemAniversario)}</li>`).join('')}</ul></div>

  <label class="caixa"><input type="checkbox" name="monthlySummary"${cfg.monthlySummary ? ' checked' : ''}> Post the month's birthdays on the 1st</label>
  <label class="caixa"><input type="checkbox" name="enabled"${cfg.enabled ? ' checked' : ''}> Birthday messages turned on in this server</label>

  <p style="margin-top:20px"><button class="botao" type="submit">Save</button></p>
</form>`);
}

function paginaSetup({ campos, publicUrl, recuperacao, botLigado, erros }) {
    const introducao = recuperacao
        ? '<p>The saved bot token stopped working. Paste a new one to get the bot back online.</p>'
        : '<p>Connect the bot to your Discord application. Everything is checked with Discord before it is saved.</p>';
    return layout('Bot setup', `
<h1>Bot setup</h1>
${introducao}
${botLigado ? alertas('ok', ['The bot is already connected (token from .env). Finish the panel setup below.']) : ''}
${alertas('erro', erros)}
<form class="cartao" method="post" action="/setup" autocomplete="off">
  <label for="code">Setup code</label>
  <input id="code" name="code" type="text" required placeholder="ABCD-EFGH" spellcheck="false">
  <div class="ajuda">Shown by the installer and in the bot's logs: <code>journalctl -u discord-bot</code>. It keeps strangers from setting up your bot first.</div>
${campos.botToken ? `
  <label for="botToken">Bot token</label>
  <input id="botToken" name="botToken" type="password" required spellcheck="false">
  <div class="ajuda"><a href="https://discord.com/developers/applications" target="_blank" rel="noopener">Developer Portal</a> → your application → <strong>Bot</strong> → <strong>Reset Token</strong>. On the same page, turn on <strong>Message Content Intent</strong>.</div>` : ''}
${campos.clientSecret ? `
  <label for="clientSecret">OAuth2 client secret</label>
  <input id="clientSecret" name="clientSecret" type="password" required spellcheck="false">
  <div class="ajuda">Developer Portal → your application → <strong>OAuth2</strong> → <strong>Client Secret</strong>. Used for "Log in with Discord".</div>` : ''}
${campos.publicUrl ? `
  <label for="publicUrl">Public address of this panel</label>
  <input id="publicUrl" name="publicUrl" type="text" required placeholder="https://bot.example.com" value="${esc(publicUrl)}" spellcheck="false">
  <div class="ajuda">The address your Cloudflare Tunnel points at this bot, without a trailing <code>/</code>.</div>` : ''}

  <p style="margin-top:20px"><button class="botao" type="submit">Connect</button></p>
</form>`);
}

function paginaSetupConcluido({ nome, publicUrl, redirect, convite }) {
    return layout('Setup complete', `
<h1>✅ ${esc(nome)} is online</h1>
<div class="cartao">
  <h2>Last steps</h2>
  <ol class="lista">
    <li>In Developer Portal → <strong>OAuth2</strong> → <strong>Redirects</strong>, add:<br><code>${esc(redirect)}</code></li>
    <li>Add the bot to your server: <a href="${esc(convite)}" target="_blank" rel="noopener">invite link</a>.</li>
    <li>Open <a href="${esc(publicUrl)}">${esc(publicUrl)}</a>, log in with Discord and set up each server.</li>
  </ol>
</div>`);
}

function paginaDefinicoes({ sessao, origens, publicUrl, botNome, erros, guardado }) {
    const doEnv = '<div class="ajuda">Set in <code>.env</code>, so it can only be changed there.</div>';
    return layout('Bot settings', `
${cabecalho(sessao)}
<p><a href="/">← Your servers</a></p>
<h1>Bot settings</h1>
<p class="suave">Connected as ${esc(botNome)}. Only the owner of the Discord application sees this page.</p>
${guardado ? alertas('ok', ['Settings saved.']) : ''}
${alertas('erro', erros)}
<form class="cartao" method="post" action="/settings" autocomplete="off">
  <input type="hidden" name="csrf" value="${esc(sessao.csrf)}">

  <label for="botToken">New bot token</label>
  ${origens.botToken === 'env' ? doEnv : `<input id="botToken" name="botToken" type="password" placeholder="Leave empty to keep the current one" spellcheck="false">
  <div class="ajuda">The bot reconnects with the new token; if it doesn't work, the current one stays.</div>`}

  <label for="clientSecret">New OAuth2 client secret</label>
  ${origens.clientSecret === 'env' ? doEnv : '<input id="clientSecret" name="clientSecret" type="password" placeholder="Leave empty to keep the current one" spellcheck="false">'}

  <label for="publicUrl">Public address of this panel</label>
  ${origens.publicUrl === 'env' ? `<p><code>${esc(publicUrl)}</code></p>${doEnv}` : `<input id="publicUrl" name="publicUrl" type="text" required value="${esc(publicUrl)}" spellcheck="false">
  <div class="ajuda">If you change it, also update the redirect in Developer Portal → OAuth2 → Redirects (<code>&lt;address&gt;/callback</code>).</div>`}

  <p style="margin-top:20px"><button class="botao" type="submit">Save</button></p>
</form>`);
}

function paginaErro(mensagem, { estado = 'Error', link = '/' } = {}) {
    return layout(estado, `
<div class="cartao centro">
  <h1>${esc(estado)}</h1>
  <p>${esc(mensagem)}</p>
  <p><a class="botao" href="${esc(link)}">Back</a></p>
</div>`);
}

module.exports = {
    esc,
    paginaInicial,
    paginaServidores,
    paginaServidor,
    paginaSetup,
    paginaSetupConcluido,
    paginaDefinicoes,
    paginaErro,
};
