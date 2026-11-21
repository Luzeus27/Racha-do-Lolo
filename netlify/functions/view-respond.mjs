/* Resposta do jogador a um jogo do link compartilhado. O token VP é enviado
   apenas no link individual; aqui ele é trocado pelo id do jogador. */
import { getStore } from '@netlify/blobs';
import { json, setCorsOrigin, rateLimit, viewUnavailable } from './_shared.mjs';

const MAX_BODY = 16 * 1024;
const VIEW_TOKEN = /^VW-[A-F0-9]{16}$/;
const PLAYER_TOKEN = /^VP-[A-F0-9]{16}$/;
const MAX_GAMES = 500;
const MAX_PLAYERS = 200;

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function dict() {
  return Object.create(null);
}

function text(value, max = 60) {
  return String(value ?? '').slice(0, max);
}

async function readJson(req) {
  const header = req.headers && typeof req.headers.get === 'function' ? req.headers.get('content-length') : null;
  const declared = Number(header);
  if (Number.isFinite(declared) && declared > MAX_BODY) return { body: {}, tooLarge: true };
  let raw = '';
  try { raw = await req.text(); } catch (e) { return { body: {}, tooLarge: false }; }
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY) return { body: {}, tooLarge: true };
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return { body: isObject(parsed) ? parsed : {}, tooLarge: false };
  } catch (e) { return { body: {}, tooLarge: false }; }
}

function findPlayerId(playerTokens, playerToken) {
  const tokens = isObject(playerTokens) ? playerTokens : {};
  for (const [id, value] of Object.entries(tokens)) {
    if (String(value) === playerToken) return text(id, 60);
  }
  return '';
}

function copyResponses(raw) {
  const out = dict();
  const src = isObject(raw) ? raw : {};
  Object.keys(src).slice(0, MAX_GAMES).forEach((gameKey) => {
    const gameId = text(gameKey, 60);
    if (!gameId) return;
    const answers = isObject(src[gameKey]) ? src[gameKey] : {};
    const clean = dict();
    Object.keys(answers).slice(0, MAX_PLAYERS).forEach((playerKey) => {
      const playerId = text(playerKey, 60);
      const status = String(answers[playerKey]);
      if (playerId && (status === 'yes' || status === 'no')) clean[playerId] = status;
    });
    out[gameId] = clean;
  });
  return out;
}

function copyWaitlist(raw) {
  const out = dict();
  const src = isObject(raw) ? raw : {};
  Object.keys(src).slice(0, MAX_GAMES).forEach((gameKey) => {
    const gameId = text(gameKey, 60);
    if (!gameId) return;
    const seen = new Set();
    out[gameId] = (Array.isArray(src[gameKey]) ? src[gameKey] : []).slice(0, MAX_PLAYERS)
      .map((v) => text(v, 60))
      .filter((id) => {
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
  });
  return out;
}

/* Quem confirmou sai da fila; ninguém fica nas duas listas ao mesmo tempo. */
function cleanWaitlist(responses, waitlist) {
  const out = dict();
  Object.entries(waitlist).slice(0, MAX_GAMES).forEach(([gameId, list]) => {
    if (!gameId) return;
    const answers = isObject(responses[gameId]) ? responses[gameId] : {};
    const kept = [];
    (Array.isArray(list) ? list : []).slice(0, MAX_PLAYERS).forEach((id) => {
      if (!id || answers[id] === 'yes' || kept.includes(id)) return;
      kept.push(id);
    });
    out[gameId] = kept;
  });
  return out;
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const limit = await rateLimit(req, 'view-respond', { max: 30, windowMs: 60000 });
  if (!limit.ok) {
    return json({ error: 'Muitas respostas em pouco tempo. Aguarde um minuto.' }, 429, {
      'Retry-After': String(limit.retryAfter)
    });
  }

  const { body, tooLarge } = await readJson(req);
  if (tooLarge) return json({ error: 'Requisição muito grande.' }, 413);

  const v = String(body.v || '').trim().toUpperCase();
  const p = String(body.p || '').trim().toUpperCase();
  const gameId = text(body.gameId, 60);
  const response = String(body.response || '').trim().toLowerCase();

  if (!VIEW_TOKEN.test(v) || !PLAYER_TOKEN.test(p)) return json({ error: 'Link inválido.' }, 400);
  if (!gameId) return json({ error: 'Jogo não identificado.' }, 400);
  if (response !== 'yes' && response !== 'no') return json({ error: 'Resposta inválida.' }, 400);

  const store = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });
  const record = await store.get(v, { type: 'json', consistency: 'strong' });
  if (!record) return json({ error: 'Link inválido ou removido.' }, 404);
  const unavailable = viewUnavailable(record);
  if (unavailable) return json({ error: unavailable, expired: true }, 410);

  const playerId = findPlayerId(record.playerTokens, p);
  if (!playerId) return json({ error: 'Link de jogador inválido.' }, 403);

  const responses = copyResponses(record.responses);
  const waitlist = copyWaitlist(record.waitlist);
  if (!isObject(responses[gameId])) responses[gameId] = dict();
  const answers = responses[gameId];

  const confirmedBefore = Object.entries(answers).filter(([, status]) => status === 'yes').map(([id]) => id);
  const wasConfirmed = answers[playerId] === 'yes';
  const rawMax = Number(record.snapshot?.settings?.maxPlayers);
  const maxPlayers = Number.isFinite(rawMax) && rawMax > 0 ? Math.floor(rawMax) : 0;

  let status;
  if (response === 'yes') {
    if (maxPlayers > 0 && confirmedBefore.length >= maxPlayers && !wasConfirmed) {
      const queue = Array.isArray(waitlist[gameId]) ? waitlist[gameId].slice(0, MAX_PLAYERS) : [];
      if (!queue.includes(playerId)) queue.push(playerId);
      waitlist[gameId] = queue.slice(0, MAX_PLAYERS);
      delete answers[playerId];
      status = 'wait';
    } else {
      answers[playerId] = 'yes';
      waitlist[gameId] = (waitlist[gameId] || []).filter((id) => id !== playerId);
      status = 'yes';
    }
  } else {
    answers[playerId] = 'no';
    waitlist[gameId] = (waitlist[gameId] || []).filter((id) => id !== playerId);
    status = 'no';
  }

  const cleanQueue = cleanWaitlist(responses, waitlist);
  const confirmed = Object.entries(answers).filter(([, value]) => value === 'yes').map(([id]) => id);
  const now = new Date().toISOString();
  await store.setJSON(v, { ...record, responses, waitlist: cleanQueue, updatedAt: now }, { metadata: { owner: 'license' } });

  return json({
    ok: true,
    status,
    confirmed,
    waitlist: cleanQueue[gameId] || []
  });
};
