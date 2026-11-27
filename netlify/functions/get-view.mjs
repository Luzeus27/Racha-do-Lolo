/* Leitura pública do retrato compartilhado. O token VW é a única credencial
   necessária aqui; nunca expor mensalidades, tokens VP ou dados de contato. */
import { getStore } from '@netlify/blobs';
import { json, setCorsOrigin, viewUnavailable } from './_shared.mjs';

const PLAYER_FIELDS = [
  'id', 'name', 'type', 'position', 'active', 'age', 'height', 'weight',
  'strength', 'speed', 'photo'
];
const SETTINGS_FIELDS = [
  'year', 'monthlyFee', 'dayFee', 'goalkeepers', 'gamesPerMonth',
  'feePresidente', 'feeVice', 'feeDiretor', 'feeConselheiro',
  'ptsGoal', 'ptsAssist', 'ptsPresence', 'ptsFairPlay', 'ptsPunctual', 'ptsFarrapou', 'ptsAtrasado', 'ptsDesarme', 'ptsDefesas', 'ptsParedoes', 'ptsGolsSofridos', 'ptsCard',
  'plannedMembers', 'maxPlayers',
  'rachaName', 'rachaFounded', 'rachaLocation', 'rachaTime', 'rachaDuration', 'rachaRules', 'rachaLogo',
  'donationEnabled', 'donationText', 'donationPix'
];

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

function pick(source, keys) {
  const obj = isObject(source) ? source : {};
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}

/* Só status bruto (`yes`/`no`): nenhum outro dado do jogador é devolvido. */
function publicResponses(raw) {
  const out = dict();
  const src = isObject(raw) ? raw : {};
  Object.keys(src).slice(0, 500).forEach((gameKey) => {
    const gameId = text(gameKey, 60);
    if (!gameId) return;
    const answers = isObject(src[gameKey]) ? src[gameKey] : {};
    const clean = dict();
    Object.keys(answers).slice(0, 200).forEach((playerKey) => {
      const playerId = text(playerKey, 60);
      const status = String(answers[playerKey]);
      if (playerId && (status === 'yes' || status === 'no')) clean[playerId] = status;
    });
    out[gameId] = clean;
  });
  return out;
}

/* Notas 1..5 por jogo/jogador vindas de versões antigas (a interface não usa mais). */
function publicRatings(raw) {
  const out = dict();
  const src = isObject(raw) ? raw : {};
  Object.keys(src).slice(0, 500).forEach((gameKey) => {
    const gameId = text(gameKey, 60);
    if (!gameId) return;
    const values = isObject(src[gameKey]) ? src[gameKey] : {};
    const clean = dict();
    Object.keys(values).slice(0, 200).forEach((playerKey) => {
      const playerId = text(playerKey, 60);
      const rating = Number(values[playerKey]);
      if (playerId && Number.isInteger(rating) && rating >= 1 && rating <= 5) clean[playerId] = rating;
    });
    out[gameId] = clean;
  });
  return out;
}

function publicWaitlist(raw) {
  const out = dict();
  const src = isObject(raw) ? raw : {};
  Object.keys(src).slice(0, 500).forEach((gameKey) => {
    const gameId = text(gameKey, 60);
    if (!gameId) return;
    const seen = new Set();
    out[gameId] = (Array.isArray(src[gameKey]) ? src[gameKey] : []).slice(0, 200)
      .map((v) => text(v, 60))
      .filter((id) => {
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
  });
  return out;
}

function publicLive(raw) {
  if (!isObject(raw)) return null;
  const score = isObject(raw.score) ? raw.score : {};
  const events = (Array.isArray(raw.events) ? raw.events : []).slice(-1000).map((item) => {
    const ev = isObject(item) ? item : {};
    return {
      id: text(ev.id, 40),
      at: text(ev.at, 40),
      type: ['goal', 'assist', 'card'].includes(ev.type) ? ev.type : 'assist',
      playerId: text(ev.playerId, 60),
      team: ev.team === 'B' ? 'B' : 'A',
      minute: number(ev.minute)
    };
  });
  const live = {
    gameId: text(raw.gameId, 60),
    startedAt: text(raw.startedAt, 40),
    updatedAt: text(raw.updatedAt, 40),
    events,
    score: { A: number(score.A), B: number(score.B) }
  };
  if (raw.endedAt) live.endedAt = text(raw.endedAt, 40);
  return live;
}

/* Snapshot sem `dues` e sem nenhum campo de contato (mesmo em registros antigos). */
function publicSnapshot(raw) {
  const src = isObject(raw) ? raw : {};
  const snap = {};
  [
    'publishedAt', 'confirmations', 'drawHistory', 'scores', 'finance'
  ].forEach((key) => {
    if (src[key] !== undefined) snap[key] = src[key];
  });
  snap.settings = pick(src.settings, SETTINGS_FIELDS);
  snap.players = (Array.isArray(src.players) ? src.players : []).slice(0, 200)
    .map((p) => pick(p, PLAYER_FIELDS));
  snap.games = (Array.isArray(src.games) ? src.games : []).slice(0, 500).map((g) => pick(g, [
    'id', 'date', 'month', 'year', 'done', 'canceled', 'name', 'time'
  ]));
  return snap;
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  let token = '';
  if (req.method === 'GET') {
    token = String(new URL(req.url).searchParams.get('v') || '').trim().toUpperCase();
  } else {
    const header = req.headers && typeof req.headers.get === 'function' ? req.headers.get('content-length') : null;
    const declared = Number(header);
    if (Number.isFinite(declared) && declared > 16 * 1024) return json({ error: 'Requisição muito grande.' }, 413);
    try {
      const raw = await req.text();
      if (Buffer.byteLength(raw, 'utf8') > 16 * 1024) return json({ error: 'Requisição muito grande.' }, 413);
      const body = raw ? JSON.parse(raw) : {};
      token = String(isObject(body) ? body.token || '' : '').trim().toUpperCase();
    } catch (e) { token = ''; }
  }

  if (!/^VW-[A-F0-9]{16}$/.test(token)) {
    return json({ error: 'Link inválido.' }, 404);
  }

  const store = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });
  const record = await store.get(token, { type: 'json', consistency: 'strong' });
  if (!record) return json({ error: 'Link inválido ou removido.' }, 404);
  const unavailable = viewUnavailable(record);
  if (unavailable) return json({ error: unavailable, expired: true }, 410);

  return json({
    token,
    updatedAt: record.updatedAt || null,
    snapshot: publicSnapshot(record.snapshot),
    responses: publicResponses(record.responses),
    ratings: publicRatings(record.ratings),
    waitlist: publicWaitlist(record.waitlist),
    live: publicLive(record.live)
  });
};
