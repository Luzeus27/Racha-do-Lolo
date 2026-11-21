/* Gera links de lembrete (WhatsApp) para jogos próximos dos links publicados.
   Função agendável: exige REMINDER_SECRET no header x-reminder-secret. */
import { getStore } from '@netlify/blobs';
import { json, siteUrl } from './_shared.mjs';

const MAX_REMINDERS = 200;
const MAX_PAGES = 50;
const VIEW_TOKEN = /^VW-[A-F0-9]{16}$/;
const PLAYER_TOKEN = /^VP-[A-F0-9]{16}$/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max = 60) {
  return String(value ?? '').slice(0, max);
}

function isProduction() {
  if (process.env.NETLIFY_LOCAL === 'true') return false;
  const context = String(process.env.CONTEXT || '').toLowerCase();
  return context === 'production' || String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function authorized(req, scheduled) {
  /* O agendador do Netlify envia POST com {"next_run": "..."} e não permite
     headers customizados; essas chamadas são sempre internas e confiáveis. */
  if (scheduled) return true;
  const secret = process.env.REMINDER_SECRET;
  if (secret) {
    const provided = typeof req.headers?.get === 'function' ? req.headers.get('x-reminder-secret') : null;
    return String(provided || '') === secret;
  }
  /* Sem segredo configurado: somente chamada explícita local em desenvolvimento. */
  return !isProduction() && new URL(req.url).searchParams.get('local') === '1';
}

async function isScheduledInvocation(req) {
  if (String(req.method || '').toUpperCase() !== 'POST') return false;
  try {
    const raw = await req.clone().text();
    if (!raw || raw.length > 1024) return false;
    const body = JSON.parse(raw);
    return isObject(body) && typeof body.next_run === 'string' && body.next_run.length > 0;
  } catch (e) { return false; }
}

/* `list()` nem sempre está disponível (emuladores/versões antigas do Blobs).
   Nesse caso devolvemos lista vazia e um aviso, sem tentar adivinhar chaves. */
async function listKeys(store) {
  if (typeof store.list !== 'function') {
    return { keys: [], warning: 'Listagem de links indisponível neste ambiente.' };
  }
  const keys = [];
  const seen = new Set();
  let cursor = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    let result;
    try {
      result = await store.list(cursor ? { cursor, limit: 100 } : { limit: 100 });
    } catch (e) {
      return { keys, warning: 'Não foi possível listar os links publicados.' };
    }
    const blobs = Array.isArray(result && result.blobs) ? result.blobs : [];
    blobs.forEach((blob) => {
      const key = String(blob && blob.key ? blob.key : '');
      if (VIEW_TOKEN.test(key) && !seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    });
    const next = result && result.cursor ? String(result.cursor) : '';
    if (!next || next === cursor) return { keys, warning: '' };
    cursor = next;
  }

  return { keys, warning: 'Listagem de links truncada; nem todos foram verificados.' };
}

function hoursUntil(date, nowMs) {
  if (!DATE_ONLY.test(date)) return null;
  const target = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(target)) return null;
  return (target - nowMs) / 3600000;
}

function reminderType(hours) {
  if (hours === null) return '';
  if (hours >= 23 && hours <= 25) return '24h';
  if (hours >= 1 && hours <= 3) return '2h';
  return '';
}

function labelBR(date) {
  const match = DATE_ONLY.exec(date);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const declared = Number(typeof req.headers?.get === 'function' ? req.headers.get('content-length') : 0);
  if (Number.isFinite(declared) && declared > 16 * 1024) return json({ error: 'Requisição muito grande.' }, 413);
  const scheduled = await isScheduledInvocation(req);
  if (!authorized(req, scheduled)) {
    return json({ error: process.env.REMINDER_SECRET ? 'Não autorizado.' : 'Lembretes não configurados.' },
      process.env.REMINDER_SECRET ? 401 : 503);
  }

  const store = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });
  const { keys, warning } = await listKeys(store);
  const base = siteUrl(req);
  const nowMs = Date.now();
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const reminders = [];

  for (const vw of keys) {
    if (reminders.length >= MAX_REMINDERS) break;
    let record = null;
    try { record = await store.get(vw, { type: 'json', consistency: 'strong' }); }
    catch (e) { continue; }

    if (!isObject(record)) continue;
    const snapshot = isObject(record.snapshot) ? record.snapshot : {};
    const games = Array.isArray(snapshot.games) ? snapshot.games.slice(0, 500) : [];
    const tokens = isObject(record.playerTokens) ? record.playerTokens : {};
    const players = Object.entries(tokens).slice(0, 200)
      .filter(([id, token]) => !!text(id, 60) && PLAYER_TOKEN.test(String(token)))
      .map(([id, token]) => [text(id, 60), String(token)]);

    for (const value of games) {
      if (reminders.length >= MAX_REMINDERS) break;
      const game = isObject(value) ? value : {};
      const date = text(game.date, 20);
      if (!date || date < today) continue;
      const when = reminderType(hoursUntil(date, nowMs));
      if (!when) continue;

      const gameId = text(game.id, 60);
      if (!gameId) continue;
      for (const [playerId, playerToken] of players) {
        if (reminders.length >= MAX_REMINDERS) break;
        const link = base + '/jogador.html?v=' + vw + '&p=' + playerToken;
        const message = '🏽 Racha do Loló: jogo em ' + labelBR(date) + '! Confirme sua presença: ' + link;
        reminders.push({
          vw,
          gameId,
          date,
          when,
          playerId,
          url: 'https://wa.me/?text=' + encodeURIComponent(message)
        });
      }
    }
  }

  reminders.sort((a, b) => a.date.localeCompare(b.date) ||
    a.gameId.localeCompare(b.gameId) || a.playerId.localeCompare(b.playerId));

  return json({
    ok: true,
    generatedAt: new Date(nowMs).toISOString(),
    reminders: reminders.slice(0, MAX_REMINDERS),
    ...(warning ? { warning } : {})
  });
};
