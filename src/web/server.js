const crypto = require('crypto');
const express = require('express');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const store = require('../store');
const { lerAniversarios, formatarData, nomeDoMes, aniversariosDoMes } = require('../birthdays');
const { agoraNoFuso, proximaVerificacao } = require('../scheduler');
const { urlConvite } = require('../commands');
const views = require('./views');

const API = 'https://discord.com/api/v10';
const COOKIE_SESSAO = 'sessao';
const COOKIE_ESTADO = 'oauth_state';
const SESSAO_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const TIPOS_TEXTO = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const FUSOS = Intl.supportedValuesOf('timeZone');
const { ViewChannel, SendMessages, ReadMessageHistory, ManageGuild, Administrator } = PermissionFlagsBits;

// Sessões em memória: um reinício do bot obriga a entrar outra vez, o que não faz mal
const sessoes = new Map();

function lerCookies(req) {
    const cookies = {};
    for (const parte of (req.headers.cookie ?? '').split(';')) {
        const i = parte.indexOf('=');
        if (i > 0) cookies[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
    }
    return cookies;
}

function definirCookie(res, nome, valor, maxAgeMs) {
    const partes = [`${nome}=${encodeURIComponent(valor)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
    if (config.PUBLIC_URL.startsWith('https://')) partes.push('Secure');
    res.append('Set-Cookie', partes.join('; '));
}

function iguais(a, b) {
    return typeof a === 'string' && typeof b === 'string' && a.length === b.length
        && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function obterSessao(req) {
    const id = lerCookies(req)[COOKIE_SESSAO];
    const sessao = id ? sessoes.get(id) : null;
    if (!sessao) return null;
    if (sessao.expira < Date.now()) {
        sessoes.delete(id);
        return null;
    }
    return sessao;
}

function exigirSessao(req, res, next) {
    req.sessao = obterSessao(req);
    if (!req.sessao) return res.redirect('/login');
    next();
}

function exigirCsrf(req, res, next) {
    if (!iguais(req.body?.csrf, req.sessao?.csrf)) {
        return res.status(403).send(views.paginaErro('O formulário expirou. Recarrega a página e tenta outra vez.'));
    }
    next();
}

async function apiDiscord(caminho, accessToken) {
    const resposta = await fetch(`${API}${caminho}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resposta.ok) throw new Error(`Discord API ${caminho} returned ${resposta.status}`);
    return resposta.json();
}

/**
 * Devolve o servidor se o utilizador lá tiver Gerir servidor. A permissão é confirmada pelo bot
 * no momento, não só a partir do login, para que tirar a permissão a alguém tenha efeito imediato.
 */
async function servidorGerivel(client, guildId, userId) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return null;
    const membro = await guild.members.fetch(userId).catch(() => null);
    return membro?.permissions.has(ManageGuild) ? guild : null;
}

function canaisDeTexto(guild) {
    return [...guild.channels.cache.values()]
        .filter((c) => TIPOS_TEXTO.includes(c.type))
        .sort((a, b) => (a.parent?.rawPosition ?? -1) - (b.parent?.rawPosition ?? -1) || a.rawPosition - b.rawPosition)
        .map((c) => ({ id: c.id, nome: c.name, categoria: c.parent?.name ?? null }));
}

/** Permissões que faltam ao bot nos canais escolhidos: erros impedem de guardar, avisos não. */
function verificarPermissoes(guild, cfg) {
    const erros = [];
    const avisos = [];
    const verificar = (canalId, papel, necessarias, lista) => {
        const canal = guild.channels.cache.get(canalId);
        const tem = canal?.permissionsFor(guild.members.me);
        const faltam = necessarias.filter(([p]) => !tem?.has(p)).map(([, nome]) => nome);
        if (canal && faltam.length) lista.push(`No canal #${canal.name} (${papel}) falta-me: ${faltam.join(', ')}.`);
    };
    verificar(cfg.birthdayChannelId, 'lista', [[ViewChannel, 'Ver canal'], [ReadMessageHistory, 'Ler histórico de mensagens']], erros);
    verificar(cfg.birthdayChannelId, 'lista', [[SendMessages, 'Enviar mensagens (para o /aniversario-adicionar)']], avisos);
    verificar(cfg.generalChannelId, 'parabéns', [[ViewChannel, 'Ver canal'], [SendMessages, 'Enviar mensagens']], erros);
    return { erros, avisos };
}

async function resumoServidor(client, guild) {
    const cfg = store.obterConfig(guild.id);
    if (!cfg) return null;

    const estado = store.lerEstado(guild.id);
    const hoje = agoraNoFuso(cfg.timezone);
    const resumo = {
        total: 0,
        doMes: [],
        nomeMes: `Aniversários de ${nomeDoMes(hoje.mes)}`,
        ultima: estado.data ? `${estado.data.split('-').reverse().join('/')} ${estado.concluido ? '✅' : '⚠ incompleta'}` : 'ainda nenhuma',
        proxima: proximaVerificacao(guild.id, cfg),
        erroLista: null,
    };
    try {
        const lista = await lerAniversarios(client, cfg.birthdayChannelId);
        resumo.total = lista.length;
        for (const a of aniversariosDoMes(lista, hoje.mes)) {
            const user = await client.users.fetch(a.userId).catch(() => null);
            resumo.doMes.push({ data: formatarData(a.dia, a.mes), nome: user?.globalName ?? user?.username ?? a.userId });
        }
    } catch (error) {
        resumo.erroLista = `Não consegui ler o canal da lista: ${error.message}`;
    }
    return resumo;
}

async function renderServidor(client, guild, sessao, { cfg, erros = [], avisos = [], guardado = false } = {}) {
    const atual = cfg ?? store.obterConfig(guild.id) ?? store.configPorOmissao();
    return views.paginaServidor({
        sessao,
        guild,
        canais: canaisDeTexto(guild),
        fusos: FUSOS,
        cfg: atual,
        erros,
        avisos: [...avisos, ...(cfg ? [] : verificarPermissoes(guild, atual).avisos)],
        guardado,
        resumo: await resumoServidor(client, guild),
    });
}

/**
 * @param {import('discord.js').Client} client
 * @returns {import('http').Server}
 */
function iniciarPainel(client) {
    const app = express();
    const redirectUri = `${config.PUBLIC_URL}/callback`;

    app.disable('x-powered-by');
    app.use((req, res, next) => {
        res.set({
            'Content-Security-Policy': "default-src 'none'; img-src https://cdn.discordapp.com; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'same-origin',
        });
        next();
    });
    app.use(express.urlencoded({ extended: false, limit: '20kb' }));

    app.get('/saude', (req, res) => {
        res.status(client.isReady() ? 200 : 503).type('text').send(client.isReady() ? 'ok' : 'a arrancar');
    });

    app.get('/', (req, res) => {
        const sessao = obterSessao(req);
        if (!sessao) return res.send(views.paginaInicial({ bot: client.user }));

        const servidores = sessao.guilds
            .map((g) => ({
                ...g,
                temBot: client.guilds.cache.has(g.id),
                configurado: Boolean(store.obterConfig(g.id)),
                convite: urlConvite(client.user.id, g.id),
            }))
            .sort((a, b) => Number(b.temBot) - Number(a.temBot) || a.nome.localeCompare(b.nome));
        res.send(views.paginaServidores({ sessao, servidores }));
    });

    app.get('/login', (req, res) => {
        const estado = crypto.randomBytes(16).toString('hex');
        definirCookie(res, COOKIE_ESTADO, estado, 10 * 60 * 1000);
        const url = new URL('https://discord.com/oauth2/authorize');
        url.search = new URLSearchParams({
            client_id: client.user.id,
            response_type: 'code',
            redirect_uri: redirectUri,
            scope: 'identify guilds',
            state: estado,
            prompt: 'none',
        }).toString();
        res.redirect(url.toString());
    });

    app.get('/callback', async (req, res, next) => {
        try {
            const { code, state } = req.query;
            definirCookie(res, COOKIE_ESTADO, '', 0);
            if (typeof code !== 'string' || !iguais(state, lerCookies(req)[COOKIE_ESTADO])) {
                return res.status(400).send(views.paginaErro('O login foi cancelado ou expirou. Tenta outra vez.', { link: '/login' }));
            }

            const resposta = await fetch(`${API}/oauth2/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: client.user.id,
                    client_secret: config.DISCORD_CLIENT_SECRET,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: redirectUri,
                }),
            });
            if (!resposta.ok) throw new Error(`OAuth token exchange failed: ${resposta.status} ${await resposta.text()}`);
            const { access_token: accessToken } = await resposta.json();

            const [user, guilds] = await Promise.all([
                apiDiscord('/users/@me', accessToken),
                apiDiscord('/users/@me/guilds', accessToken),
            ]);
            const geridos = guilds
                .filter((g) => g.owner || (BigInt(g.permissions) & (ManageGuild | Administrator)) !== 0n)
                .map((g) => ({ id: g.id, nome: g.name, icon: g.icon }));

            const id = crypto.randomBytes(32).toString('hex');
            sessoes.set(id, {
                userId: user.id,
                nome: user.global_name ?? user.username,
                avatar: user.avatar,
                guilds: geridos,
                csrf: crypto.randomBytes(16).toString('hex'),
                expira: Date.now() + SESSAO_MAX_MS,
            });
            definirCookie(res, COOKIE_SESSAO, id, SESSAO_MAX_MS);
            console.log(`🔑 Panel login: ${user.username} (${user.id})`);
            res.redirect('/');
        } catch (error) {
            next(error);
        }
    });

    app.post('/logout', exigirSessao, exigirCsrf, (req, res) => {
        sessoes.delete(lerCookies(req)[COOKIE_SESSAO]);
        definirCookie(res, COOKIE_SESSAO, '', 0);
        res.redirect('/');
    });

    // Responde quando o utilizador não pode gerir o servidor; manda adicionar o bot se ele lá não estiver
    function negar(req, res) {
        const { id } = req.params;
        if (!client.guilds.cache.has(id) && req.sessao.guilds.some((g) => g.id === id)) {
            return res.redirect(urlConvite(client.user.id, id));
        }
        return res.status(403).send(views.paginaErro('Não tens a permissão Gerir servidor neste servidor.', { estado: 'Sem acesso' }));
    }

    app.get('/servidor/:id', exigirSessao, async (req, res, next) => {
        try {
            const guild = await servidorGerivel(client, req.params.id, req.sessao.userId);
            if (!guild) return negar(req, res);
            res.send(await renderServidor(client, guild, req.sessao, { guardado: req.query.guardado === '1' }));
        } catch (error) {
            next(error);
        }
    });

    app.post('/servidor/:id', exigirSessao, exigirCsrf, async (req, res, next) => {
        try {
            const guild = await servidorGerivel(client, req.params.id, req.sessao.userId);
            if (!guild) return negar(req, res);

            const campo = (nome) => (typeof req.body[nome] === 'string' ? req.body[nome].trim() : '');
            const cfg = {
                birthdayChannelId: campo('birthdayChannelId'),
                generalChannelId: campo('generalChannelId'),
                timezone: campo('timezone'),
                checkTime: campo('checkTime'),
                message: campo('message').replaceAll('\r\n', '\n'),
                monthlySummary: req.body.monthlySummary === 'on',
                enabled: req.body.enabled === 'on',
            };

            const canais = new Set(canaisDeTexto(guild).map((c) => c.id));
            const erros = [];
            if (!canais.has(cfg.birthdayChannelId)) erros.push('Escolhe o canal com a lista de aniversários.');
            if (!canais.has(cfg.generalChannelId)) erros.push('Escolhe o canal onde enviar os parabéns.');
            if (!config.horaValida(cfg.checkTime)) erros.push('A hora tem de estar no formato HH:MM.');
            if (!config.fusoValido(cfg.timezone)) erros.push(`"${cfg.timezone}" não é um fuso horário válido (ex: Europe/Lisbon).`);
            if (!cfg.message || cfg.message.length > 1500) erros.push('A mensagem tem de ter entre 1 e 1500 caracteres.');
            else if (!cfg.message.includes('{user}')) erros.push('A mensagem tem de incluir {user}, que é substituído pela menção ao aniversariante.');

            const permissoes = erros.length ? { erros: [], avisos: [] } : verificarPermissoes(guild, cfg);
            erros.push(...permissoes.erros);
            if (erros.length) {
                return res.status(400).send(await renderServidor(client, guild, req.sessao, { cfg, erros, avisos: permissoes.avisos }));
            }

            store.guardarConfig(guild.id, cfg);
            console.log(`⚙ [${guild.name}] Configuration saved by ${req.sessao.nome} (${req.sessao.userId})`);
            res.redirect(`/servidor/${guild.id}?guardado=1`);
        } catch (error) {
            next(error);
        }
    });

    app.use((req, res) => {
        res.status(404).send(views.paginaErro('Esta página não existe.', { estado: 'Não encontrado' }));
    });

    // eslint-disable-next-line no-unused-vars
    app.use((error, req, res, next) => {
        console.error('❌ Panel error:', error);
        res.status(500).send(views.paginaErro('Ocorreu um erro. Tenta outra vez daqui a pouco.'));
    });

    // Limpar sessões expiradas de hora a hora
    setInterval(() => {
        for (const [id, s] of sessoes) if (s.expira < Date.now()) sessoes.delete(id);
    }, 60 * 60 * 1000).unref();

    return app.listen(config.WEB_PORT, config.WEB_HOST, () => {
        console.log(`🌐 Panel listening on http://${config.WEB_HOST}:${config.WEB_PORT} (public URL: ${config.PUBLIC_URL})`);
    });
}

module.exports = { iniciarPainel };
