// Páginas do painel, em HTML simples gerado no servidor (sem JavaScript no browser)

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
<html lang="pt">
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
  <form method="post" action="/logout">
    <input type="hidden" name="csrf" value="${esc(sessao.csrf)}">
    <button class="botao secundario" type="submit">Sair</button>
  </form>
</header>`;
}

function alertas(tipo, mensagens) {
    if (!mensagens?.length) return '';
    return `<div class="alerta ${tipo}"><ul>${mensagens.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>`;
}

function paginaInicial({ bot }) {
    return layout('Bot de aniversários', `
<div class="cartao centro">
  <img class="avatar" src="${avatarUtilizador(bot.id, bot.avatar)}" alt="">
  <h1>${esc(bot.username)}</h1>
  <p class="suave">Dá os parabéns aos membros do teu servidor no dia de anos e publica a lista do mês no dia 1.</p>
  <p><a class="botao" href="/login">Entrar com Discord</a></p>
</div>`);
}

function paginaServidores({ sessao, servidores }) {
    const itens = servidores.map((s) => {
        let estado;
        let acao;
        if (!s.temBot) {
            estado = '<span class="etiqueta suave">Bot não adicionado</span>';
            acao = `<a class="botao secundario" href="${esc(s.convite)}">Adicionar bot</a>`;
        } else {
            estado = s.configurado
                ? '<span class="etiqueta ok">● Configurado</span>'
                : '<span class="etiqueta aviso">● Por configurar</span>';
            acao = `<a class="botao" href="/servidor/${esc(s.id)}">Configurar</a>`;
        }
        return `<div class="cartao servidor">
  ${iconeServidor(s.id, s.nome, s.icon)}
  <div class="nome">${esc(s.nome)}<br>${estado}</div>
  ${acao}
</div>`;
    }).join('');

    const vazio = `<div class="cartao"><p>Não tens a permissão <strong>Gerir servidor</strong> em nenhum servidor.</p></div>`;
    return layout('Os teus servidores', `
${cabecalho(sessao)}
<h1>Os teus servidores</h1>
<p class="suave">Servidores onde tens a permissão Gerir servidor. Depois de adicionares o bot a um servidor, <a href="/login">atualiza a lista</a>.</p>
${servidores.length ? itens : vazio}`);
}

function opcoesCanais(canais, selecionado) {
    const opcoes = ['<option value="">Escolhe um canal…</option>'];
    let categoria;
    for (const c of canais) {
        if (c.categoria !== categoria) {
            if (categoria !== undefined) opcoes.push('</optgroup>');
            opcoes.push(`<optgroup label="${esc(c.categoria ?? 'Sem categoria')}">`);
            categoria = c.categoria;
        }
        opcoes.push(`<option value="${esc(c.id)}"${c.id === selecionado ? ' selected' : ''}>#${esc(c.nome)}</option>`);
    }
    if (categoria !== undefined) opcoes.push('</optgroup>');
    return opcoes.join('');
}

function paginaServidor({ sessao, guild, canais, fusos, cfg, erros, avisos, guardado, resumo }) {
    let cartaoResumo = '';
    if (resumo) {
        const doMes = resumo.doMes.length
            ? `<ul class="lista">${resumo.doMes.map((a) => `<li>${esc(a.data)} - ${esc(a.nome)}</li>`).join('')}</ul>`
            : '<p class="suave">Ninguém faz anos este mês.</p>';
        cartaoResumo = `<div class="cartao">
  <h2>Estado</h2>
  ${resumo.erroLista ? alertas('erro', [resumo.erroLista]) : `<p>📋 ${resumo.total} aniversários na lista</p>`}
  <p>🔍 Última verificação: ${esc(resumo.ultima)}<br>⏰ Próxima verificação: ${esc(resumo.proxima)}</p>
  <h2>${esc(resumo.nomeMes)}</h2>
  ${doMes}
</div>`;
    }

    return layout(`${guild.name}: configuração`, `
${cabecalho(sessao)}
<p><a href="/">← Os teus servidores</a></p>
<div class="servidor" style="margin-bottom:16px">
  ${iconeServidor(guild.id, guild.name, guild.icon)}
  <h1 class="nome" style="margin:0">${esc(guild.name)}</h1>
</div>
${guardado ? alertas('ok', ['Configuração guardada.']) : ''}
${alertas('erro', erros)}
${alertas('aviso', avisos)}
${cartaoResumo}
<form class="cartao" method="post" action="/servidor/${esc(guild.id)}">
  <input type="hidden" name="csrf" value="${esc(sessao.csrf)}">
  <h2>Configuração</h2>

  <label for="birthdayChannelId">Canal com a lista de aniversários</label>
  <select id="birthdayChannelId" name="birthdayChannelId" required>${opcoesCanais(canais, cfg.birthdayChannelId)}</select>
  <div class="ajuda">Uma linha por pessoa, ex: <code>25/12 - @pessoa</code>. O /aniversario-adicionar escreve aqui.</div>

  <label for="generalChannelId">Canal onde enviar os parabéns</label>
  <select id="generalChannelId" name="generalChannelId" required>${opcoesCanais(canais, cfg.generalChannelId)}</select>

  <div class="grelha">
    <div>
      <label for="checkTime">Hora da verificação diária</label>
      <input id="checkTime" name="checkTime" type="time" value="${esc(cfg.checkTime)}" required>
    </div>
    <div>
      <label for="timezone">Fuso horário</label>
      <input id="timezone" name="timezone" type="text" list="fusos" value="${esc(cfg.timezone)}" required>
      <datalist id="fusos">${fusos.map((f) => `<option value="${esc(f)}">`).join('')}</datalist>
    </div>
  </div>

  <label for="message">Mensagem de parabéns</label>
  <textarea id="message" name="message" maxlength="1500" required>${esc(cfg.message)}</textarea>
  <div class="ajuda"><code>{user}</code> é substituído pela menção ao aniversariante.</div>

  <label class="caixa"><input type="checkbox" name="monthlySummary"${cfg.monthlySummary ? ' checked' : ''}> Publicar a lista do mês no dia 1</label>
  <label class="caixa"><input type="checkbox" name="enabled"${cfg.enabled ? ' checked' : ''}> Parabéns ligados neste servidor</label>

  <p style="margin-top:20px"><button class="botao" type="submit">Guardar</button></p>
</form>`);
}

function paginaErro(mensagem, { estado = 'Erro', link = '/' } = {}) {
    return layout(estado, `
<div class="cartao centro">
  <h1>${esc(estado)}</h1>
  <p>${esc(mensagem)}</p>
  <p><a class="botao" href="${esc(link)}">Voltar</a></p>
</div>`);
}

module.exports = { esc, paginaInicial, paginaServidores, paginaServidor, paginaErro };
