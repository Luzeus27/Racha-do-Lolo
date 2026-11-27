/* Publica um retrato somente leitura do racha para o link compartilhável.
   Assinantes ativos (mensal/anual) e a conta vitalícia, no aparelho vinculado,
   podem publicar. Cada licença publica apenas o seu próprio retrato. */
import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { json, licenses, siteUrl, cleanDevice, deviceAllowed, normalizeStatus, validUntil, planTier, setCorsOrigin, rateLimit } from './_shared.mjs';
import { copyAutoPayments, copyCredits, copyDailyPayments, copyMonthlyPayments, copyReservations } from './_daily.mjs';

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const PHOTO_MAX = 160000;

function cleanKey(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function pick(source, keys) {
  const obj = isObject(source) ? source : {};
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function dict() {
  return Object.create(null);
}

function text(value, max = 120) {
  return String(value ?? '').slice(0, max);
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function ids(list, limit = 30) {
  return (Array.isArray(list) ? list : []).slice(0, limit).map((v) => text(v, 60));
}

function newViewToken() {
  return 'VW-' + randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
}

function newPlayerToken() {
  return 'VP-' + randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
}

function validPlayerToken(value) {
  return /^VP-[A-F0-9]{16}$/.test(String(value || ''));
}

function cleanExpiry(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

async function readJson(req, maxBytes) {
  const header = req.headers && typeof req.headers.get === 'function' ? req.headers.get('content-length') : null;
  const declared = Number(header);
  if (Number.isFinite(declared) && declared > maxBytes) return { body: {}, tooLarge: true };
  let raw = '';
  try { raw = await req.text(); } catch (e) { return { body: {}, tooLarge: false }; }
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) return { body: {}, tooLarge: true };
  try { return { body: raw ? JSON.parse(raw) : {}, tooLarge: false }; }
  catch (e) { return { body: {}, tooLarge: false }; }
}

/* Mensalidades: nada de telefone, e-mail ou dados pessoais além do necessário.
   O PIX só entra quando é um BR Code (`000201...`). */
function sanitizeDues(raw) {
  const src = isObject(raw) ? raw : {};
  const out = dict();
  let players = 0;
  Object.keys(src).slice(0, 200).forEach((key) => {
    if (players >= 200) return;
    const playerId = text(key, 60);
    if (!playerId) return;
    players += 1;
    out[playerId] = (Array.isArray(src[key]) ? src[key] : []).slice(0, 36).map((item) => {
      const row = isObject(item) ? item : {};
      const pix = typeof row.pix === 'string' && row.pix.startsWith('000201')
        ? row.pix.slice(0, 800)
        : '';
      return {
        month: number(row.month),
        year: number(row.year),
        amount: number(row.amount),
        paid: row.paid === true,
        pix,
        txid: text(row.txid, 80),
        receiptId: text(row.receiptId, 80)
      };
    });
  });
  return out;
}

function sanitizeSettings(raw) {
  const settings = pick(raw, [
    'year', 'monthlyFee', 'dayFee', 'goalkeepers', 'gamesPerMonth',
    'feePresidente', 'feeVice', 'feeDiretor', 'feeConselheiro',
    'ptsGoal', 'ptsAssist', 'ptsPresence', 'ptsFairPlay', 'ptsPunctual', 'ptsFarrapou', 'ptsAtrasado', 'ptsDesarme', 'ptsDefesas', 'ptsParedoes', 'ptsGolsSofridos', 'ptsCard',
    'plannedMembers', 'maxPlayers', 'paymentMode'
  ]);
  ['feePresidente', 'feeVice', 'feeDiretor', 'feeConselheiro'].forEach((k) => {
    settings[k] = number(settings[k]);
  });
  const max = Number(settings.maxPlayers);
  settings.maxPlayers = Number.isFinite(max) && max > 0 ? Math.min(1000, Math.floor(max)) : 0;
  return Object.assign(settings, {
    dailyPaymentEnabled: raw.dailyPaymentEnabled !== false,
    donationEnabled: raw.donationEnabled !== false,
    donationText: text(raw.donationText, 160),
    donationPix: typeof raw.donationPix === 'string' && raw.donationPix.startsWith('000201')
      ? raw.donationPix.slice(0, 800) : '',
    pixKey: text(raw.pixKey, 200),
    pixMerchant: text(raw.pixMerchant, 25),
    pixCity: text(raw.pixCity, 15),
    rachaName: text(raw.rachaName, 90),
    rachaFounded: text(raw.rachaFounded, 20),
    rachaLocation: text(raw.rachaLocation, 120),
    rachaTime: text(raw.rachaTime, 10),
    rachaDuration: text(raw.rachaDuration, 40),
    rachaRules: text(raw.rachaRules, 4000),
    rachaLogo: typeof raw.rachaLogo === 'string' && /^data:image\/(png|jpeg|webp);base64,/i.test(raw.rachaLogo)
      ? raw.rachaLogo.slice(0, PHOTO_MAX)
      : ''
  });
}

const DEFAULT_REMINDER_TEXT = {
  group: '⚽ {jogo}: jogo em {data} ({horario})!\nAbra o link, vá em Jogadores, encontre seu nome e faça seu check-in/pagamento: {link}\nMensalista paga a mensalidade; diarista paga a diária na sua área.',
  player: '🏽 {jogo}: jogo em {data} ({horario})! Confirme sua presença (mensalidade/diária pelo PIX no seu link): {link}'
};

/* Frases editáveis ficam FORA do snapshot público: somente send-reminders as lê. */
function privateTexts(raw) {
  const src = isObject(raw) ? raw : {};
  const clean = (value, fallback) => {
    const s = String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim().slice(0, 700);
    return s || fallback;
  };
  return { group: clean(src.group, DEFAULT_REMINDER_TEXT.group), player: clean(src.player, DEFAULT_REMINDER_TEXT.player) };
}

/* Contatos privados ficam FORA do snapshot público. O app envia os telefones
   em `playerPhones`, separados do retrato. Servem para o jogador encontrar o
   próprio perfil (find-player) e para send-reminders abrir o chat direto. */
function privateContacts(rawPhones, tokens) {
  const out = dict();
  const src = isObject(rawPhones) ? rawPhones : {};
  Object.keys(src).slice(0, 200).forEach((key) => {
    const id = text(key, 60);
    if (!id || !Object.prototype.hasOwnProperty.call(tokens, id)) return;
    let digits = String(src[key] ?? '').replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
    if (/^55\d{10,11}$/.test(digits)) out[id] = digits;
  });
  return out;
}

/* Lista branca: nada de telefone, e-mail, chave PIX, comprovantes ou observações. */
function sanitize(raw) {
  const src = isObject(raw) ? raw : {};

  const players = (Array.isArray(src.players) ? src.players : []).slice(0, 200).map((value) => {
    const p = isObject(value) ? value : {};
    return {
      id: text(p.id, 60),
      name: text(p.name, 90),
      type: text(p.type, 30),
      position: text(p.position, 30),
      active: p.active !== false,
      age: number(p.age),
      height: number(p.height),
      weight: number(p.weight),
      strength: number(p.strength),
      speed: number(p.speed),
      photo: typeof p.photo === 'string' && /^data:image\/(png|jpeg|webp);base64,/i.test(p.photo)
        ? p.photo.slice(0, PHOTO_MAX)
        : ''
    };
  });

  const games = (Array.isArray(src.games) ? src.games : []).slice(0, 500).map((value) => {
    const g = isObject(value) ? value : {};
    return {
      id: text(g.id, 60),
      date: text(g.date, 20),
      month: number(g.month),
      year: number(g.year),
      done: g.done === true,
      canceled: g.canceled === true,
      name: text(g.name, 90),
      time: text(g.time, 10)
    };
  });

  const confirmations = dict();
  const conf = isObject(src.confirmations) ? src.confirmations : {};
  Object.keys(conf).slice(0, 200).forEach((key) => {
    confirmations[text(key, 60)] = ids(conf[key], 200);
  });

  const scores = (Array.isArray(src.scores) ? src.scores : []).slice(0, 800).map((value) => {
    const s = isObject(value) ? value : {};
    return {
      id: text(s.id, 60),
      playerId: text(s.playerId, 60),
      month: number(s.month),
      year: number(s.year),
      goals: number(s.goals),
      assists: number(s.assists),
      presence: number(s.presence),
      fairPlay: number(s.fairPlay),
      punctual: number(s.punctual),
      farrapou: number(s.farrapou),
      atrasado: number(s.atrasado),
      desarmes: number(s.desarmes),
      defesas: number(s.defesas),
      paredoes: number(s.paredoes),
      golsSofridos: number(s.golsSofridos),
      cards: number(s.cards)
    };
  });

  const financeRaw = isObject(src.finance) ? src.finance : {};
  const finance = {
    paid: number(financeRaw.paid),
    open: number(financeRaw.open),
    byMonth: (Array.isArray(financeRaw.byMonth) ? financeRaw.byMonth : []).slice(0, 36).map((value) => {
      const m = isObject(value) ? value : {};
      return {
        month: number(m.month),
        year: number(m.year),
        paid: number(m.paid),
        open: number(m.open)
      };
    })
  };

  return {
    publishedAt: text(src.publishedAt, 40),
    settings: sanitizeSettings(src.settings),
    players,
    games,
    confirmations,
    drawHistory: (Array.isArray(src.drawHistory) ? src.drawHistory : []).slice(0, 20).map((value) => {
      const h = isObject(value) ? value : {};
      return {
        id: text(h.id, 60),
        createdAt: text(h.createdAt, 40),
        gameKey: text(h.gameKey, 60),
        gameLabel: text(h.gameLabel, 60),
        mode: text(h.mode, 20),
        teamSize: number(h.teamSize),
        teams: (Array.isArray(h.teams) ? h.teams : []).slice(0, 20).map((t) => ids(t, 30))
      };
    }),
    scores,
    finance,
    dues: sanitizeDues(src.dues)
  };
}

/* Tokens VP estáveis: os já existentes e válidos são mantidos; jogadores
   removidos perdem o token e jogadores novos ganham um token novo. */
function syncPlayerTokens(players, previous) {
  const out = dict();
  const source = isObject(previous) ? previous : {};
  const seen = new Set();
  players.forEach((p) => {
    const id = text(p.id, 60);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out[id] = validPlayerToken(source[id]) ? source[id] : newPlayerToken();
  });
  return out;
}

/* Tipo do jogador fica só no registro privado. O servidor usa isso para
   decidir quem confirma de graça e quem precisa pagar a diária. */
function buildPlayerRoles(players, tokens) {
  const out = dict();
  players.forEach((p) => {
    const id = text(p?.id, 60);
    if (!id || !tokens[id]) return;
    out[id] = String(p.type || '').toLowerCase() === 'diarista' ? 'daily' : 'monthly';
  });
  return out;
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const limit = await rateLimit(req, 'publish-view', { max: 10, windowMs: 60000 });
  if (!limit.ok) {
    return json({ error: 'Muitas publicações em pouco tempo. Aguarde um minuto.' }, 429, {
      'Retry-After': String(limit.retryAfter)
    });
  }

  const { body, tooLarge } = await readJson(req, MAX_BODY_BYTES);
  if (tooLarge) return json({ error: 'Retrato muito grande (fotos). Reduza as imagens.' }, 413);
  if (!isObject(body)) return json({ error: 'Dados inválidos.' }, 400);

  const key = cleanKey(body.licenseKey);
  const device = cleanDevice(body.deviceId);
  if (!key || !device) return json({ error: 'Licença ou dispositivo não identificado.' }, 401);

  const record = await licenses().get(key, { type: 'json', consistency: 'strong' });
  if (!record || !/^[A-Z0-9-]{8,40}$/.test(key)) {
    return json({ error: 'Licença não encontrada.' }, 403);
  }

  /* Vale para mensal/anual ativo e para a conta vitalícia. O cancelamento
     solicitado só encerra o acesso depois do fim do período já pago. */
  let active = normalizeStatus(record.status) === 'active' && validUntil(record.nextPaymentAt);
  if (record.cancelRequestedAt && record.nextPaymentAt) {
    const end = Date.parse(record.nextPaymentAt);
    if (Number.isFinite(end) && end <= Date.now()) active = false;
  }
  if (!active || !deviceAllowed(record, device)) {
    return json({ error: 'Assinatura ativa e aparelho vinculado são necessários para publicar.' }, 403);
  }

  const snapshot = sanitize(body.snapshot);
  if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > MAX_BYTES) {
    return json({ error: 'Retrato muito grande (fotos). Reduza as imagens.' }, 413);
  }

  const requested = String(body.token || '').trim().toUpperCase();
  const wantsReuse = /^VW-[A-F0-9]{16}$/.test(requested);
  const store = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });

  let token = wantsReuse ? requested : newViewToken();
  let previous = await store.get(token, { type: 'json', consistency: 'strong' });
  const expired = previous?.expiresAt && Date.parse(previous.expiresAt) <= Date.now();
  if (wantsReuse && ((previous && previous.ownerKey !== key) || previous?.revokedAt || expired)) {
    token = newViewToken();
    previous = null;
  }

  const now = new Date().toISOString();
  const playerTokens = syncPlayerTokens(snapshot.players, previous?.playerTokens);
  const playerRoles = buildPlayerRoles(snapshot.players, playerTokens);
  const base = siteUrl(req);
  const playerLinks = dict();
  Object.keys(playerTokens).forEach((id) => {
    playerLinks[id] = base + '/jogador.html?v=' + token + '&p=' + playerTokens[id];
  });

  await store.setJSON(token, {
    token,
    ownerKey: key,
    /* Definido pelo servidor conforme o plano da licença: o navegador não
       pode ligar o check-in automático por conta própria. */
    autoCheckin: planTier(record.plan) === 'intermediate',
    /* Escolha do administrador. Só passa a valer se a conta dele estiver vinculada. */
    paymentMode: String(snapshot.settings?.paymentMode || '').toLowerCase() === 'mp' ? 'mp' : 'manual',
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    expiresAt: cleanExpiry(body.expiresAt),
    revokedAt: null,
    snapshot: { ...snapshot, publishedAt: now },
    /* Nunca vai para get-view/get-player-view: apenas os lembretes leem. */
    contacts: privateContacts(body.playerPhones, playerTokens),
    reminderTexts: privateTexts(body.reminderTexts),
    /* Respostas, fila, notas e ao vivo pertencem ao link e sobrevivem a
       republicações do retrato. */
    playerTokens,
    playerRoles,
    responses: isObject(previous?.responses) ? previous.responses : dict(),
    waitlist: isObject(previous?.waitlist) ? previous.waitlist : dict(),
    ratings: isObject(previous?.ratings) ? previous.ratings : dict(),
    /* Pagamentos, reservas e créditos sobrevivem a republicações. */
    dailyPayments: copyDailyPayments(previous?.dailyPayments),
    monthlyPayments: copyMonthlyPayments(previous?.monthlyPayments),
    autoPayments: copyAutoPayments(previous?.autoPayments),
    dailyCredits: copyCredits(previous?.dailyCredits),
    reservations: copyReservations(previous?.reservations),
    dailyCancelLog: Array.isArray(previous?.dailyCancelLog) ? previous.dailyCancelLog.slice(-20) : [],
    manualLog: Array.isArray(previous?.manualLog) ? previous.manualLog.slice(-30) : [],
    paymentNotices: Array.isArray(previous?.paymentNotices) ? previous.paymentNotices.slice(-30) : [],
    live: previous?.live ?? null
  }, { metadata: { owner: 'license' } });

  return json({
    ok: true,
    token,
    url: base + '/visualizar.html?v=' + encodeURIComponent(token),
    publishedAt: now,
    expiresAt: cleanExpiry(body.expiresAt),
    playerLinks
  });
};
