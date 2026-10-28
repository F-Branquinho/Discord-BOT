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
main.larga { max-width: 1080px; }
footer { max-width: 1080px; margin: 0 auto; padding: 24px 16px 40px; text-align: center; font-size: .9rem; color: var(--suave); }
footer a { color: var(--suave); }
.topo { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0 32px; }
.marca-bot { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 1.1rem; color: var(--texto); text-decoration: none; }
.hero { display: grid; grid-template-columns: 1.1fr .9fr; gap: 40px; align-items: center; padding: 24px 0 56px; }
.hero h1 { font-size: clamp(2rem, 5vw, 3.2rem); line-height: 1.1; margin: 12px 0 16px; letter-spacing: -.02em; }
.hero p.lead { font-size: 1.15rem; color: var(--suave); margin: 0 0 24px; }
.selo { display: inline-block; padding: 4px 12px; border-radius: 999px; background: color-mix(in srgb, var(--marca) 15%, transparent); color: var(--marca); font-weight: 600; font-size: .9rem; }
.acoes { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.botao.grande { padding: 14px 24px; font-size: 1.05rem; border-radius: 10px; }
.pequeno { font-size: .9rem; }
.discord { background: #313338; color: #dbdee1; border-radius: 14px; padding: 20px; box-shadow: 0 20px 50px rgba(0,0,0,.25); font-size: .95rem; }
.discord .canal { color: #949ba4; font-weight: 600; padding-bottom: 12px; margin-bottom: 14px; border-bottom: 1px solid #3f4147; }
.msg { display: flex; gap: 12px; margin-bottom: 16px; }
.msg:last-child { margin-bottom: 0; }
.msg img { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; }
.msg .autor { color: #f2f3f5; font-weight: 600; }
.msg .app { background: #5865f2; color: #fff; font-size: .65rem; font-weight: 700; padding: 1px 5px; border-radius: 4px; margin-left: 4px; vertical-align: 2px; }
.msg .hora { color: #949ba4; font-size: .75rem; margin-left: 6px; }
.mencao { background: rgba(88,101,242,.3); color: #c9cdfb; border-radius: 3px; padding: 0 2px; }
.secao { padding: 40px 0; }
.secao > h2 { font-size: 1.7rem; text-align: center; margin: 0 0 8px; }
.secao > p.suave { text-align: center; margin: 0 auto 32px; max-width: 560px; }
.cartoes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.cartoes .cartao { margin: 0; }
.cartoes.duas { grid-template-columns: repeat(2, 1fr); }
.hero > *, .cartoes > *, .msg > div { min-width: 0; }
body { overflow-wrap: break-word; }
.cartoes h3 { margin: 8px 0 6px; font-size: 1.05rem; }
.cartoes p { margin: 0; color: var(--suave); }
.emoji { font-size: 1.8rem; }
.passo-num { display: inline-flex; width: 32px; height: 32px; border-radius: 50%; align-items: center; justify-content: center; background: var(--marca); color: var(--marca-texto); font-weight: 700; }
.comando code { font-weight: 700; color: var(--marca); }
.cta { text-align: center; padding: 48px 20px; }
.cta h2 { font-size: 1.7rem; margin: 0 0 16px; }
.texto-legal { max-width: 760px; margin: 0 auto; }
.texto-legal h2 { margin-top: 28px; }
@media (max-width: 860px) {
  .hero { grid-template-columns: 1fr; gap: 28px; padding-top: 0; }
  .cartoes, .cartoes.duas { grid-template-columns: 1fr; }
}
`;

const REPOSITORIO = 'https://github.com/F-Branquinho/Discord-BOT';

function layout(titulo, corpo, { larga = false, descricao } = {}) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
${descricao ? `<meta name="description" content="${esc(descricao)}">` : ''}
<style>${CSS}</style>
<script src="/panel.js" defer></script>
</head>
<body>
<main${larga ? ' class="larga"' : ''}>${corpo}</main>
<footer><a href="/">Home</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="${REPOSITORIO}" target="_blank" rel="noopener">Source code</a></footer>
</body>
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

const FUNCIONALIDADES = [
    ['🎉', 'Birthday messages', 'A happy birthday message in your channel of choice, on the right day, at the time you pick.'],
    ['📅', 'Monthly summary', "On the 1st of every month, a list of that month's birthdays, so nobody is caught off guard."],
    ['🌍', 'Your timezone', 'Each server has its own time and timezone, so messages arrive at midnight where you are.'],
    ['🗣', 'Your language', 'Messages in English or Portuguese, or write your own birthday message.'],
    ['⌨', 'Slash commands', 'Members add their own birthday with /birthday-add. No admin needed.'],
    ['🔕', 'No spam', 'Lists and summaries never ping anyone. Only the birthday person gets mentioned, once.'],
];

function paginaInicial({ bot, sessao, servidores, comandos, exemplo }) {
    const nome = esc(bot.username);
    const avatar = avatarUtilizador(bot.id, bot.avatar);
    const mensagem = esc(exemplo).replace('{user}', '<span class="mencao">@Alex</span>');
    const contaServidores = servidores === 1 ? '1 server' : `${servidores} servers`;
    return layout(`${bot.username}: birthday bot for Discord`, `
<nav class="topo">
  <a class="marca-bot" href="/"><img class="avatar" src="${avatar}" alt="">${nome}</a>
  ${sessao ? '<a class="botao secundario" href="/dashboard">Dashboard</a>' : '<a class="botao secundario" href="/login">Log in</a>'}
</nav>

<section class="hero">
  <div>
    <span class="selo">🎂 Birthday bot for Discord</span>
    <h1>Never miss a birthday in your server again</h1>
    <p class="lead">${nome} wishes your members a happy birthday at the right time, in your timezone, and posts the month's birthdays on the 1st. Set it up in two minutes.</p>
    <div class="acoes">
      <a class="botao grande" href="/add">Add to Discord</a>
      <a class="botao secundario grande" href="/dashboard">Open dashboard</a>
    </div>
    <p class="suave pequeno">Free · Open source · Used in ${contaServidores}</p>
  </div>
  <div class="discord" aria-label="Example of a birthday message in Discord">
    <div class="canal"># general</div>
    <div class="msg">
      <img src="${avatar}" alt="">
      <div><span class="autor">${nome}</span><span class="app">APP</span><span class="hora">Today at 00:01</span>
        <div>${mensagem}</div></div>
    </div>
    <div class="msg">
      <img src="${avatar}" alt="">
      <div><span class="autor">${nome}</span><span class="app">APP</span><span class="hora">1 November at 00:01</span>
        <div>📅 <strong>Birthdays in November</strong><br>• 02/11 - <span class="mencao">@Sam</span><br>• 19/11 - <span class="mencao">@Rita</span><br>• 22/11 - <span class="mencao">@Leo</span></div></div>
    </div>
  </div>
</section>

<section class="secao">
  <h2>Everything a birthday bot should do</h2>
  <p class="suave">Simple to set up, and it just works every day.</p>
  <div class="cartoes">
    ${FUNCIONALIDADES.map(([emoji, titulo, texto]) => `<div class="cartao"><span class="emoji">${emoji}</span><h3>${titulo}</h3><p>${texto}</p></div>`).join('')}
  </div>
</section>

<section class="secao">
  <h2>How it works</h2>
  <p class="suave">Three steps and you're done.</p>
  <div class="cartoes">
    <div class="cartao"><span class="passo-num">1</span><h3>Add the bot</h3><p>Click <strong>Add to Discord</strong> and pick your server.</p></div>
    <div class="cartao"><span class="passo-num">2</span><h3>Pick the channels</h3><p>Choose where the birthday list lives and where the messages go. You land right on that page.</p></div>
    <div class="cartao"><span class="passo-num">3</span><h3>Add birthdays</h3><p>Members use <code>/birthday-add</code>, or write <code>25/12 - @name</code> in the list channel.</p></div>
  </div>
</section>

<section class="secao">
  <h2>Commands</h2>
  <p class="suave">All replies are short and never ping the people on the list.</p>
  <div class="cartoes duas">
    ${comandos.map((c) => `<div class="cartao comando"><code>/${esc(c.nome)}</code><p>${esc(c.descricao)}</p></div>`).join('')}
  </div>
</section>

<section class="cta cartao">
  <h2>Ready to celebrate?</h2>
  <div class="acoes" style="justify-content:center"><a class="botao grande" href="/add">Add to Discord</a></div>
</section>`, {
        larga: true,
        descricao: `${bot.username} is a free, open-source Discord bot that wishes your server members a happy birthday and posts the month's birthdays.`,
    });
}

function paginaServidores({ sessao, servidores }) {
    const itens = servidores.map((s) => {
        let estado;
        let acao;
        if (!s.temBot) {
            estado = '<span class="etiqueta suave">Bot not added</span>';
            acao = `<a class="botao secundario" href="/add?guild=${esc(s.id)}">Add bot</a>`;
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
<p><a href="/dashboard">← Your servers</a></p>
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
  <select id="language" name="language" required data-mensagens="${esc(JSON.stringify(Object.fromEntries(Object.entries(idiomas).map(([codigo, i]) => [codigo, i.mensagemAniversario]))))}">${Object.entries(idiomas).map(([codigo, i]) => `<option value="${esc(codigo)}"${codigo === cfg.language ? ' selected' : ''}>${esc(i.nome)}</option>`).join('')}</select>
  <div class="ajuda">Language of the birthday message and the monthly summary posted in this server.</div>

  <label for="message">Custom birthday message (optional)</label>
  <textarea id="message" name="message" maxlength="1500" placeholder="${esc(idiomas[cfg.language]?.mensagemAniversario)}">${esc(cfg.message)}</textarea>
  <div class="ajuda"><code>{user}</code> is replaced by the birthday person's mention. When several people have their birthday on the same day, they get one message together (e.g. <code>@Ana and @Rui</code>). Leave empty to use the default for the chosen language:
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
<p><a href="/dashboard">← Your servers</a></p>
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

function paginaPrivacidade({ botNome }) {
    const nome = esc(botNome);
    return layout('Privacy policy', `
<div class="texto-legal">
<p><a href="/">← Home</a></p>
<h1>Privacy policy</h1>
<p class="suave">${nome} is a Discord bot that posts birthday messages. This page explains what it stores and why.</p>

<h2>What the bot stores</h2>
<ul>
  <li><strong>Server settings</strong> chosen in the dashboard: the server ID, the IDs of the birthday list and birthday message channels, the check time, timezone, message language, an optional custom message, and whether the monthly summary is on.</li>
  <li><strong>Delivery state</strong>: the last day it checked each server and the Discord user IDs that already got that day's message, so nobody gets it twice.</li>
</ul>

<h2>What the bot reads but does not store</h2>
<ul>
  <li>The <strong>birthday list</strong> (day, month and a user mention) lives in a channel of your Discord server. The bot reads it when it needs it and never copies it elsewhere. Delete a line in that channel and it's gone.</li>
  <li>When you <strong>log in to the dashboard</strong>, Discord shares your user ID, username, avatar and the list of your servers. This is kept in memory only while you're logged in (at most 7 days, or until the bot restarts) and is never written to disk.</li>
</ul>

<h2>Cookies</h2>
<p>The dashboard uses one cookie to keep you logged in, and a short-lived one during login to protect it. There are no analytics, ads or tracking.</p>

<h2>Sharing</h2>
<p>Nothing is sold or shared. Data only goes to Discord, to post messages and read the channels you chose.</p>

<h2>Deleting your data</h2>
<ul>
  <li>Remove the bot from your server and that server's settings and delivery state are deleted.</li>
  <li>Remove your line from the birthday list channel to take your birthday off the list.</li>
  <li>For anything else, open an issue on the <a href="${REPOSITORIO}/issues" target="_blank" rel="noopener">project's GitHub</a>.</li>
</ul>
</div>`, { descricao: `What ${botNome} stores and why.` });
}

function paginaTermos({ botNome }) {
    const nome = esc(botNome);
    return layout('Terms of service', `
<div class="texto-legal">
<p><a href="/">← Home</a></p>
<h1>Terms of service</h1>
<p>By adding ${nome} to a server or using its dashboard, you agree to these terms.</p>
<ul>
  <li>${nome} is free and provided as is, without guarantees that it will always be online or deliver every message.</li>
  <li>Only add the bot to servers where you're allowed to, and only add birthdays of people who are fine with it being shared in the server.</li>
  <li>Don't use the bot to spam, harass anyone, or break <a href="https://discord.com/terms" target="_blank" rel="noopener">Discord's Terms of Service</a>.</li>
  <li>The bot may be removed from servers that abuse it, and these terms may change; the current version is always on this page.</li>
</ul>
<p>See the <a href="/privacy">privacy policy</a> for what the bot stores. The source code is on <a href="${REPOSITORIO}" target="_blank" rel="noopener">GitHub</a>.</p>
</div>`, { descricao: `Terms of service for ${botNome}.` });
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
    paginaPrivacidade,
    paginaTermos,
    paginaErro,
};
