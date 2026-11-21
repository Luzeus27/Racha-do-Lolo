/* Visão individual de um jogador, liberada apenas pelo par de tokens VW + VP.
   Nunca devolve tokens de outros jogadores nem dados de contato. */
import { getStore } from '@netlify/blobs';
import { json, setCorsOrigin, viewUnavailable } from './_shared.mjs';

const VIEW_TOKEN = /^VW-[A-F0-9]{16}$/;
const PLAYER_TOKEN = /^VP-[A-F0-9]{16}$/;

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max = 120) {
  return String(value ?? '').slice(0, max);
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function todayISO() {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = (type) => (parts.find((p) => p.type === type) || {}).value || '';
    if (get('year') && get('month') && get('day')) return `${get('year')}-${get('month')}-${get('day')}`;
  } catch (e) { /* usa a data local do servidor como fallback */ }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function findPlayerId(playerTokens, playerToken) {
  const tokens = isObject(playerTokens) ? playerTokens : {};
  for (const [id, value] of Object.entries(tokens)) {
    if (String(value) === playerToken) return text(id, 60);
  }
  return '';
}

function label(game) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(game.date || '');
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const year = String(Math.max(0, Math.floor(number(game.year)))).padStart(4, '0');
  const month = String(Math.max(1, Math.floor(number(game.month)) || 1)).padStart(2, '0');
  return `01/${month}/${year}`;
}

function copyGames(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 500).map((g) => ({
    id: text(g && g.id, 60),
    date: text(g && g.date, 20),
    month: number(g && g.month),
    year: number(g && g.year),
    done: !!(g && g.done === true)
  })).filter((g) => !!g.id);
}

function answersFor(raw, gameId, playerId) {
  const games = isObject(raw) ? raw : {};
  const answers = isObject(games[gameId]) ? games[gameId] : {};
  const status = String(answers[playerId] || '');
  return status === 'yes' || status === 'no' ? status : null;
}

function waitlisted(raw, gameId, playerId) {
  const games = isObject(raw) ? raw : {};
  return Array.isArray(games[gameId]) && games[gameId].slice(0, 200).includes(playerId);
}

function myRating(raw, gameId, playerId) {
  const games = isObject(raw) ? raw : {};
  const values = isObject(games[gameId]) ? games[gameId] : {};
  const rating = Number(values[playerId]);
  return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
}

function openDues(raw, playerId) {
  const source = isObject(raw) ? raw : {};
  const list = Object.prototype.hasOwnProperty.call(source, playerId) && Array.isArray(source[playerId])
    ? source[playerId]
    : [];
  return list.slice(0, 36).filter((d) => isObject(d) && d.paid === false).map((d) => {
    const pix = typeof d.pix === 'string' && d.pix.startsWith('000201') ? d.pix.slice(0, 800) : '';
    return {
      month: number(d.month),
      year: number(d.year),
      amount: number(d.amount),
      paid: false,
      pix,
      txid: text(d.txid, 80),
      receiptId: text(d.receiptId, 80)
    };
  });
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'GET') return json({ error: 'Método não permitido.' }, 405);

  const params = new URL(req.url).searchParams;
  const v = String(params.get('v') || '').trim().toUpperCase();
  const p = String(params.get('p') || '').trim().toUpperCase();
  if (!VIEW_TOKEN.test(v) || !PLAYER_TOKEN.test(p)) return json({ error: 'Link inválido.' }, 400);

  const store = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });
  const record = await store.get(v, { type: 'json', consistency: 'strong' });
  if (!record) return json({ error: 'Link inválido ou removido.' }, 404);
  const unavailable = viewUnavailable(record);
  if (unavailable) return json({ error: unavailable, expired: true }, 410);

  const playerId = findPlayerId(record.playerTokens, p);
  if (!playerId) return json({ error: 'Link de jogador inválido.' }, 403);

  const snapshot = isObject(record.snapshot) ? record.snapshot : {};
  const players = Array.isArray(snapshot.players) ? snapshot.players : [];
  const mine = players.find((player) => isObject(player) && text(player.id, 60) === playerId);
  if (!mine) return json({ error: 'Jogador não encontrado neste link.' }, 403);

  const today = todayISO();
  const games = copyGames(snapshot.games);
  const upcoming = games.filter((g) => g.date && g.date >= today);
  const pool = upcoming.length ? upcoming : games;
  const nextGames = pool.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);

  const confirmations = isObject(snapshot.confirmations) ? snapshot.confirmations : {};
  const gamesOut = nextGames.map((g) => {
    let confirmed = answersFor(record.responses, g.id, playerId);
    if (confirmed === null && Array.isArray(confirmations[g.id]) &&
        confirmations[g.id].slice(0, 200).some((id) => text(id, 60) === playerId)) {
      confirmed = 'yes';
    }
    return {
      id: g.id,
      date: g.date,
      confirmed,
      waitlisted: waitlisted(record.waitlist, g.id, playerId)
    };
  });

  const pastGames = games
    .filter((g) => g.done || (g.date && g.date < today))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8)
    .map((g) => ({
      id: g.id,
      label: label(g),
      date: g.date,
      myRating: myRating(record.ratings, g.id, playerId)
    }));

  return json({
    ok: true,
    player: {
      id: playerId,
      name: text(mine.name, 90),
      position: text(mine.position, 30),
      photo: typeof mine.photo === 'string' && /^data:image\/(png|jpeg|webp);base64,/i.test(mine.photo)
        ? mine.photo.slice(0, 160000)
        : ''
    },
    games: gamesOut,
    pastGames,
    dues: openDues(snapshot.dues, playerId),
    updatedAt: record.updatedAt || null
  });
};
