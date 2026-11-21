/* Nota (1..5) dada por um jogador a um jogo já realizado, no link compartilhado. */
import { getStore } from '@netlify/blobs';
import { json, setCorsOrigin, viewUnavailable } from './_shared.mjs';

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

function copyRatings(raw) {
  const out = dict();
  const src = isObject(raw) ? raw : {};
  Object.keys(src).slice(0, MAX_GAMES).forEach((gameKey) => {
    const gameId = text(gameKey, 60);
    if (!gameId) return;
    const values = isObject(src[gameKey]) ? src[gameKey] : {};
    const clean = dict();
    Object.keys(values).slice(0, MAX_PLAYERS).forEach((playerKey) => {
      const playerId = text(playerKey, 60);
      const rating = Number(values[playerKey]);
      if (playerId && Number.isInteger(rating) && rating >= 1 && rating <= 5) clean[playerId] = rating;
    });
    out[gameId] = clean;
  });
  return out;
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const { body, tooLarge } = await readJson(req);
  if (tooLarge) return json({ error: 'Requisição muito grande.' }, 413);

  const v = String(body.v || '').trim().toUpperCase();
  const p = String(body.p || '').trim().toUpperCase();
  const gameId = text(body.gameId, 60);
  const rating = Number(body.rating);

  if (!VIEW_TOKEN.test(v) || !PLAYER_TOKEN.test(p)) return json({ error: 'Link inválido.' }, 400);
  if (!gameId) return json({ error: 'Jogo não identificado.' }, 400);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: 'Nota inválida.' }, 400);

  const store = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });
  const record = await store.get(v, { type: 'json', consistency: 'strong' });
  if (!record) return json({ error: 'Link inválido ou removido.' }, 404);
  const unavailable = viewUnavailable(record);
  if (unavailable) return json({ error: unavailable, expired: true }, 410);

  const playerId = findPlayerId(record.playerTokens, p);
  if (!playerId) return json({ error: 'Link de jogador inválido.' }, 403);

  const ratings = copyRatings(record.ratings);
  if (!isObject(ratings[gameId])) ratings[gameId] = dict();
  ratings[gameId][playerId] = rating;

  const now = new Date().toISOString();
  await store.setJSON(v, { ...record, ratings, updatedAt: now }, { metadata: { owner: 'license' } });

  return json({ ok: true, rating });
};
