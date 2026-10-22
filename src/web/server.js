const crypto = require('crypto');
const express = require('express');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const store = require('../store');
const settings = require('../settings');
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
// Wrong setup codes allowed per window, so the code can't be guessed
const MAX_FALHAS_SETUP = 10;
const JANELA_FALHAS_MS = 15 * 60 * 1000;

// Sessions live in memory: a bot restart just means logging in again
const sessoes = new Map();
const falhasSetup = [];

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
    if (settings.obter().publicUrl?.startsWith('https://')) partes.push('Secure');
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

function exigirDono(req, res, next) {
    if (!req.sessao.dono) {
        return res.status(403).send(views.paginaErro('Only the owner of the bot application can change its settings.', { estado: 'No access' }));
    }
    next();
}

function campo(req, nome) {
    return typeof req.body?.[nome] === 'string' ? req.body[nome].trim() : '';
}

async function apiDiscord(caminho, accessToken) {
    const resposta = await fetch(`${API}${caminho}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resposta.ok) throw new Error(`Discord API ${caminho} returned ${resposta.status}`);
    return resposta.json();
}

/** The application a bot token belongs to, or null if the token is invalid. */
async function aplicacaoDoToken(token) {
    const resposta = await fetch(`${API}/oauth2/applications/@me`, { headers: { Authorization: `Bot ${token}` } });
    if (resposta.status === 401) return null;
    if (!resposta.ok) throw new Error(`Discord API returned ${resposta.status}`);
    return resposta.json();
}

/** Checks the OAuth2 client secret by asking Discord for a client-credentials token. */
async function segredoValido(applicationId, segredo) {
    const resposta = await fetch(`${API}/oauth2/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${applicationId}:${segredo}`).toString('base64')}`,
        },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'identify' }),
    });
    return resposta.ok;
}

/**
 * Returns the server if the user has Manage Server there. The bot checks the permission on
 * every request, not just at login, so removing someone's permission takes effect right away.
 * The owner of the bot application can manage every server the bot is in: whoever holds
 * the bot token already controls the bot there.
 */
async function servidorGerivel(client, guildId, sessao) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return null;
    if (sessao.dono) return guild;
    const membro = await guild.members.fetch(sessao.userId).catch(() => null);
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

/** Address the visitor used through the tunnel, to prefill the public address on the setup page. */
function urlDoPedido(req) {
    const proto = req.headers['x-forwarded-proto'];
    return proto === 'https' && req.headers.host ? `https://${req.headers.host}` : '';
}

/**
 * @param {typeof import('../bot')} bot
 * @returns {import('http').Server}
 */
function iniciarPainel(bot) {
    const app = express();
    const cliente = () => bot.estado.cliente;
    const redirectUri = () => `${settings.obter().publicUrl}/callback`;

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
        const ligado = Boolean(cliente()?.isReady());
        let texto = 'starting';
        if (ligado) texto = 'ok';
        else if (bot.estado.erroLogin) texto = 'login failed';
        else if (!settings.obter().botToken) texto = 'setup needed';
        res.status(ligado ? 200 : 503).type('text').send(texto);
    });

    // ---- Setup: open until the token, client secret and public address are all set

    /** Only asks for what is missing (plus the token when the saved one stopped working). */
    function campos() {
        const atuais = settings.obter();
        return {
            botToken: !atuais.botToken || bot.estado.recuperacao,
            clientSecret: !atuais.clientSecret,
            publicUrl: !atuais.publicUrl,
        };
    }

    function renderSetup(req, { erros = [], publicUrl } = {}) {
        return views.paginaSetup({
            campos: campos(),
            publicUrl: publicUrl ?? settings.obter().publicUrl ?? urlDoPedido(req),
            recuperacao: bot.estado.recuperacao,
            botLigado: Boolean(cliente()?.isReady()),
            erros,
        });
    }

    app.get('/setup', (req, res) => {
        if (!bot.emSetup()) return res.redirect('/');
        res.send(renderSetup(req));
    });

    app.post('/setup', async (req, res, next) => {
        try {
            if (!bot.emSetup()) return res.redirect('/');

            const agora = Date.now();
            while (falhasSetup.length && falhasSetup[0] < agora - JANELA_FALHAS_MS) falhasSetup.shift();
            if (falhasSetup.length >= MAX_FALHAS_SETUP) {
                return res.status(429).send(views.paginaErro('Too many wrong setup codes. Wait 15 minutes and try again.', { estado: 'Slow down', link: '/setup' }));
            }

            const mostrar = campos();
            const atuais = settings.obter();
            const token = mostrar.botToken ? campo(req, 'botToken') : atuais.botToken;
            const segredo = mostrar.clientSecret ? campo(req, 'clientSecret') : atuais.clientSecret;
            const publicUrl = mostrar.publicUrl ? campo(req, 'publicUrl').replace(/\/+$/, '') : atuais.publicUrl;
            const responder = (status, erros) => res.status(status).send(renderSetup(req, { erros, publicUrl }));

            if (!iguais(campo(req, 'code').toUpperCase(), settings.codigoSetup())) {
                falhasSetup.push(agora);
                return responder(403, ["Wrong setup code. It's in the bot's logs (journalctl -u discord-bot) and was shown by the installer."]);
            }

            const erros = [];
            if (!token) erros.push('Paste the bot token.');
            if (!segredo) erros.push('Paste the OAuth2 client secret.');
            if (!settings.urlValido(publicUrl)) erros.push('The public address must look like https://bot.example.com');
            if (erros.length) return responder(400, erros);

            const aplicacao = await aplicacaoDoToken(token);
            if (!aplicacao) return responder(400, ['The bot token is invalid. Get a new one in Developer Portal → Bot → Reset Token.']);
            if (!await segredoValido(aplicacao.id, segredo)) {
                return responder(400, [`The client secret doesn't belong to ${aplicacao.name}. Copy it from Developer Portal → OAuth2 → Client Secret.`]);
            }

            if (cliente()?.token !== token || !cliente()?.isReady()) {
                try {
                    await bot.iniciarBot(token);
                } catch (error) {
                    return responder(400, [error.message]);
                }
            }

            settings.guardar({
                ...(mostrar.botToken && { botToken: token }),
                ...(mostrar.clientSecret && { clientSecret: segredo }),
                ...(mostrar.publicUrl && { publicUrl }),
            });
            settings.apagarCodigoSetup();
            bot.estado.recuperacao = false;
            console.log(`⚙ Setup complete for ${aplicacao.name}. Panel: ${publicUrl}`);
            res.send(views.paginaSetupConcluido({
                nome: aplicacao.name,
                publicUrl,
                redirect: `${publicUrl}/callback`,
                convite: urlConvite(aplicacao.id),
            }));
        } catch (error) {
            next(error);
        }
    });

    // Everything else needs the setup done and the bot connected
    app.use((req, res, next) => (bot.emSetup() ? res.redirect('/setup') : next()));
    app.use((req, res, next) => {
        if (cliente()?.isReady()) return next();
        const mensagem = bot.estado.erroLogin
            ? `The bot can't connect to Discord: ${bot.estado.erroLogin}`
            : 'The bot is starting. Try again in a few seconds.';
        res.status(503).send(views.paginaErro(mensagem, { estado: 'Bot offline', link: req.originalUrl }));
    });

    app.get('/', (req, res) => {
        const sessao = obterSessao(req);
        if (!sessao) return res.send(views.paginaInicial({ bot: cliente().user }));

        const lista = [...sessao.guilds];
        if (sessao.dono) {
            // The bot owner also sees every server the bot is in
            const ids = new Set(lista.map((g) => g.id));
            for (const guild of cliente().guilds.cache.values()) {
                if (!ids.has(guild.id)) lista.push({ id: guild.id, nome: guild.name, icon: guild.icon, comoDono: true });
            }
        }
        const servidores = lista
            .map((g) => ({
                ...g,
                temBot: cliente().guilds.cache.has(g.id),
                configurado: Boolean(store.obterConfig(g.id)),
                convite: urlConvite(cliente().user.id, g.id),
            }))
            .sort((a, b) => Number(b.temBot) - Number(a.temBot) || a.nome.localeCompare(b.nome));
        res.send(views.paginaServidores({ sessao, servidores }));
    });

    app.get('/login', (req, res) => {
        const estado = crypto.randomBytes(16).toString('hex');
        definirCookie(res, COOKIE_ESTADO, estado, 10 * 60 * 1000);
        const url = new URL('https://discord.com/oauth2/authorize');
        url.search = new URLSearchParams({
            client_id: cliente().user.id,
            response_type: 'code',
            redirect_uri: redirectUri(),
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
                    client_id: cliente().user.id,
                    client_secret: settings.obter().clientSecret,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: redirectUri(),
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

            // The owner of the application (or a member of its team) can change the bot settings
            let dono = false;
            try {
                const { owner } = await cliente().application.fetch();
                dono = owner?.members ? owner.members.has(user.id) : owner?.id === user.id;
            } catch (error) {
                console.warn('⚠ Could not check the application owner:', error.message);
            }

            const id = crypto.randomBytes(32).toString('hex');
            sessoes.set(id, {
                userId: user.id,
                nome: user.global_name ?? user.username,
                avatar: user.avatar,
                guilds: geridos,
                dono,
                csrf: crypto.randomBytes(16).toString('hex'),
                expira: Date.now() + SESSAO_MAX_MS,
            });
            definirCookie(res, COOKIE_SESSAO, id, SESSAO_MAX_MS);
            console.log(`🔑 Panel login: ${user.username} (${user.id})${dono ? ' [owner]' : ''}`);
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

    // ---- Bot settings (owner only)

    function renderDefinicoes(sessao, { erros = [], guardado = false, publicUrl } = {}) {
        return views.paginaDefinicoes({
            sessao,
            origens: { botToken: settings.origem('botToken'), clientSecret: settings.origem('clientSecret'), publicUrl: settings.origem('publicUrl') },
            publicUrl: publicUrl ?? settings.obter().publicUrl,
            botNome: cliente().user.tag,
            erros,
            guardado,
        });
    }

    app.get('/settings', exigirSessao, exigirDono, (req, res) => {
        res.send(renderDefinicoes(req.sessao, { guardado: req.query.saved === '1' }));
    });

    app.post('/settings', exigirSessao, exigirCsrf, exigirDono, async (req, res, next) => {
        try {
            const novoToken = settings.origem('botToken') === 'env' ? '' : campo(req, 'botToken');
            const novoSegredo = settings.origem('clientSecret') === 'env' ? '' : campo(req, 'clientSecret');
            const publicUrl = settings.origem('publicUrl') === 'env' ? settings.obter().publicUrl : campo(req, 'publicUrl').replace(/\/+$/, '');
            const responder = (erros) => res.status(400).send(renderDefinicoes(req.sessao, { erros, publicUrl }));

            if (!settings.urlValido(publicUrl)) return responder(['The public address must look like https://bot.example.com']);

            let applicationId = cliente().application.id;
            if (novoToken) {
                const aplicacao = await aplicacaoDoToken(novoToken);
                if (!aplicacao) return responder(['The new bot token is invalid.']);
                if (aplicacao.id !== applicationId && !novoSegredo) {
                    return responder([`This token belongs to a different application (${aplicacao.name}). Paste its client secret too.`]);
                }
                applicationId = aplicacao.id;
            }
            if (novoSegredo && !await segredoValido(applicationId, novoSegredo)) {
                return responder(["The client secret doesn't match the bot's application."]);
            }
            if (novoToken) {
                try {
                    await bot.iniciarBot(novoToken);
                } catch (error) {
                    return responder([error.message]);
                }
            }

            settings.guardar({
                ...(novoToken && { botToken: novoToken }),
                ...(novoSegredo && { clientSecret: novoSegredo }),
                ...(settings.origem('publicUrl') !== 'env' && { publicUrl }),
            });
            console.log(`⚙ Bot settings changed by ${req.sessao.nome} (${req.sessao.userId})`);
            res.redirect('/settings?saved=1');
        } catch (error) {
            next(error);
        }
    });

    // ---- Server pages

    // Used when the user can't manage the server; sends them to add the bot if it isn't there
    function negar(req, res) {
        const { id } = req.params;
        if (!cliente().guilds.cache.has(id) && req.sessao.guilds.some((g) => g.id === id)) {
            return res.redirect(urlConvite(cliente().user.id, id));
        }
        return res.status(403).send(views.paginaErro("You don't have the Manage Server permission in this server.", { estado: 'No access' }));
    }

    app.get('/server/:id', exigirSessao, async (req, res, next) => {
        try {
            const guild = await servidorGerivel(cliente(), req.params.id, req.sessao);
            if (!guild) return negar(req, res);
            res.send(await renderServidor(cliente(), guild, req.sessao, { guardado: req.query.saved === '1' }));
        } catch (error) {
            next(error);
        }
    });

    app.post('/server/:id', exigirSessao, exigirCsrf, async (req, res, next) => {
        try {
            const guild = await servidorGerivel(cliente(), req.params.id, req.sessao);
            if (!guild) return negar(req, res);

            const cfg = {
                birthdayChannelId: campo(req, 'birthdayChannelId'),
                generalChannelId: campo(req, 'generalChannelId'),
                timezone: campo(req, 'timezone'),
                checkTime: campo(req, 'checkTime'),
                language: campo(req, 'language'),
                message: campo(req, 'message').replaceAll('\r\n', '\n') || null,
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
            else if (cfg.message && !cfg.message.includes('{user}')) erros.push("The message must include {user}, which is replaced by the birthday person's mention.");

            const permissoes = erros.length ? { erros: [], avisos: [] } : verificarPermissoes(guild, cfg);
            erros.push(...permissoes.erros);
            if (erros.length) {
                return res.status(400).send(await renderServidor(cliente(), guild, req.sessao, { cfg, erros, avisos: permissoes.avisos }));
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
        console.log(`🌐 Panel listening on http://${config.WEB_HOST}:${config.WEB_PORT}`);
    });
}

module.exports = { iniciarPainel };
