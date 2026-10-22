const crypto = require('crypto');
const express = require('express');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const store = require('../store');
const { IDIOMAS } = require('../i18n');
const { lerAniversarios, formatarData, nomeDoMes, aniversariosDoMes } = require('../birthdays');
const { agoraNoFuso, proximaVerificacao, ultimaVerificacao } = require('../scheduler');
const { urlConvite } = require('../commands');
const views = require('./views');

const API = 'https://discord.com/api/v10';
const COOKIE_SESSAO = 'sessao';
const COOKIE_ESTADO = 'oauth_state';
const SESSAO_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const TIPOS_TEXTO = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const FUSOS = Intl.supportedValuesOf('timeZone');
const { ViewChannel, SendMessages, ReadMessageHistory, ManageGuild, Administrator } = PermissionFlagsBits;

// Sessions live in memory: a bot restart just means logging in again
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
        return res.status(403).send(views.paginaErro('This form has expired. Reload the page and try again.'));
    }
    next();
}

async function apiDiscord(caminho, accessToken) {
    const resposta = await fetch(`${API}${caminho}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resposta.ok) throw new Error(`Discord API ${caminho} returned ${resposta.status}`);
    return resposta.json();
}

/**
 * Returns the server if the user has Manage Server there. The bot checks the permission on
 * every request, not just at login, so removing someone's permission takes effect right away.
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

/** Permissions the bot is missing in the chosen channels: errors block saving, warnings don't. */
function verificarPermissoes(guild, cfg) {
    const erros = [];
    const avisos = [];
    const verificar = (canalId, papel, necessarias, lista) => {
        const canal = guild.channels.cache.get(canalId);
        const tem = canal?.permissionsFor(guild.members.me);
        const faltam = necessarias.filter(([p]) => !tem?.has(p)).map(([, nome]) => nome);
        if (canal && faltam.length) lista.push(`In #${canal.name} (${papel}) I'm missing: ${faltam.join(', ')}.`);
    };
    verificar(cfg.birthdayChannelId, 'birthday list', [[ViewChannel, 'View Channel'], [ReadMessageHistory, 'Read Message History']], erros);
    verificar(cfg.birthdayChannelId, 'birthday list', [[SendMessages, 'Send Messages (for /birthday-add)']], avisos);
    verificar(cfg.generalChannelId, 'birthday messages', [[ViewChannel, 'View Channel'], [SendMessages, 'Send Messages']], erros);
    return { erros, avisos };
}

async function resumoServidor(client, guild) {
    const cfg = store.obterConfig(guild.id);
    if (!cfg) return null;

    const hoje = agoraNoFuso(cfg.timezone);
    const resumo = {
        total: 0,
        doMes: [],
        nomeMes: `Birthdays in ${nomeDoMes(hoje.mes)}`,
        ultima: ultimaVerificacao(guild.id),
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
        resumo.erroLista = `Couldn't read the birthday list channel: ${error.message}`;
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
        idiomas: IDIOMAS,
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

    app.get('/health', (req, res) => {
        res.status(client.isReady() ? 200 : 503).type('text').send(client.isReady() ? 'ok' : 'starting');
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
                return res.status(400).send(views.paginaErro('The login was cancelled or expired. Please try again.', { link: '/login' }));
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

    // Used when the user can't manage the server; sends them to add the bot if it isn't there
    function negar(req, res) {
        const { id } = req.params;
        if (!client.guilds.cache.has(id) && req.sessao.guilds.some((g) => g.id === id)) {
            return res.redirect(urlConvite(client.user.id, id));
        }
        return res.status(403).send(views.paginaErro("You don't have the Manage Server permission in this server.", { estado: 'No access' }));
    }

    app.get('/server/:id', exigirSessao, async (req, res, next) => {
        try {
            const guild = await servidorGerivel(client, req.params.id, req.sessao.userId);
            if (!guild) return negar(req, res);
            res.send(await renderServidor(client, guild, req.sessao, { guardado: req.query.saved === '1' }));
        } catch (error) {
            next(error);
        }
    });

    app.post('/server/:id', exigirSessao, exigirCsrf, async (req, res, next) => {
        try {
            const guild = await servidorGerivel(client, req.params.id, req.sessao.userId);
            if (!guild) return negar(req, res);

            const campo = (nome) => (typeof req.body[nome] === 'string' ? req.body[nome].trim() : '');
            const cfg = {
                birthdayChannelId: campo('birthdayChannelId'),
                generalChannelId: campo('generalChannelId'),
                timezone: campo('timezone'),
                checkTime: campo('checkTime'),
                language: campo('language'),
                message: campo('message').replaceAll('\r\n', '\n') || null,
                monthlySummary: req.body.monthlySummary === 'on',
                enabled: req.body.enabled === 'on',
            };

            const canais = new Set(canaisDeTexto(guild).map((c) => c.id));
            const erros = [];
            if (!canais.has(cfg.birthdayChannelId)) erros.push('Choose the birthday list channel.');
            if (!canais.has(cfg.generalChannelId)) erros.push('Choose the channel for birthday messages.');
            if (!config.horaValida(cfg.checkTime)) erros.push('The time must be in HH:MM format.');
            if (!config.fusoValido(cfg.timezone)) erros.push(`"${cfg.timezone}" isn't a valid timezone (e.g. Europe/Lisbon).`);
            if (!IDIOMAS[cfg.language]) erros.push('Choose a message language.');
            if (cfg.message && cfg.message.length > 1500) erros.push('The message can be at most 1500 characters.');
            else if (cfg.message && !cfg.message.includes('{user}')) erros.push('The message must include {user}, which is replaced by the birthday person\'s mention.');

            const permissoes = erros.length ? { erros: [], avisos: [] } : verificarPermissoes(guild, cfg);
            erros.push(...permissoes.erros);
            if (erros.length) {
                return res.status(400).send(await renderServidor(client, guild, req.sessao, { cfg, erros, avisos: permissoes.avisos }));
            }

            store.guardarConfig(guild.id, cfg);
            console.log(`⚙ [${guild.name}] Configuration saved by ${req.sessao.nome} (${req.sessao.userId})`);
            res.redirect(`/server/${guild.id}?saved=1`);
        } catch (error) {
            next(error);
        }
    });

    app.use((req, res) => {
        res.status(404).send(views.paginaErro("This page doesn't exist.", { estado: 'Not found' }));
    });

    // eslint-disable-next-line no-unused-vars
    app.use((error, req, res, next) => {
        console.error('❌ Panel error:', error);
        res.status(500).send(views.paginaErro('Something went wrong. Please try again in a moment.'));
    });

    // Clear expired sessions every hour
    setInterval(() => {
        for (const [id, s] of sessoes) if (s.expira < Date.now()) sessoes.delete(id);
    }, 60 * 60 * 1000).unref();

    return app.listen(config.WEB_PORT, config.WEB_HOST, () => {
        console.log(`🌐 Panel listening on http://${config.WEB_HOST}:${config.WEB_PORT} (public URL: ${config.PUBLIC_URL})`);
    });
}

module.exports = { iniciarPainel };
