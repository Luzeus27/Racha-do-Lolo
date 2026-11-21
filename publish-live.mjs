/* Placar ao vivo do link compartilhado. Somente o administrador (licença ativa
   no aparelho vinculado e dona do link) pode iniciar, lançar eventos e encerrar. */
import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { json, licenses, cleanDevice, deviceAllowed, normalizeStatus, validUntil } from './_shared.mjs';

const MAX_BODY = 16 * 1024;
const MAX_EVENTS = 1000;
const VIEW_TOKEN = /^VW-[A-F0-9]{16}$/;
const ACTIONS = ['start', 'goal', 'assist', 'card', 'undo', 'stop'];

function cleanKey(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max = 60) {
  return String(value ?? '').slice(0, max);
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
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

/* Mesma regra de publish-view: assinatura ativa (mensal/anual/vitalícia) e
   aparelho vinculado. Cancelamento só vale depois do período já pago. */
async function isAdmin(key, device) {
  if (!key || !/^[A-Z0-9-]{8,40}$/.test(key) || !device) return false;
  const record = await licenses().get(key, { type: 'json', consistency: 'strong' });
  if (!record) return false;
  let active = normalizeStatus(record.status) === 'active' && validUntil(record.nextPaymentAt);
  if (record.cancelRequestedAt && record.nextPaymentAt) {
    const end = Date.parse(record.nextPaymentAt);
    if (Number.isFinite(end) && end <= Date.now()) active = false;
  }
  return active && deviceAllowed(record, device);
}

function cleanEvent(raw, now) {
  const ev = isObject(raw) ? raw : {};
  return {
    id: text(ev.id, 40) || 'EV-' + randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase(),
    at: text(ev.at, 40) || now,
    type: ['goal', 'assist', 'card'].includes(ev.type) ? ev.type : 'assist',
    playerId: text(ev.playerId, 60),
    team: ev.team === 'B' ? 'B' : 'A',
    minute: Math.max(0, Math.min(120, Math.floor(number(ev.minute))))
  };
}

function scoreFromEvents(events) {
  const score = { A: 0, B: 0 };
  events.forEach((ev) => {
    if (ev.type === 'goal') score[ev.team === 'B' ? 'B' : 'A'] += 1;
  });
  return score;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const { body, tooLarge } = await readJson(req);
  if (tooLarge) return json({ error: 'Requisição muito grande.' }, 413);

  const key = cleanKey(body.licenseKey);
  const device = cleanDevice(body.deviceId);
  if (!key || !device) return json({ error: 'Licença ou dispositivo não identificado.' }, 401);

  const v = String(body.v || '').trim().toUpperCase();
  const action = String(body.action || '').trim().toLowerCase();
  if (!VIEW_TOKEN.test(v)) return json({ error: 'Link inválido.' }, 400);
  if (!ACTIONS.includes(action)) return json({ error: 'Ação inválida.' }, 400);
  if (!(await isAdmin(key, device))) {
    return json({ error: 'Assinatura ativa e aparelho vinculado são necessários.' }, 403);
  }

  const store = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });
  const record = await store.get(v, { type: 'json', consistency: 'strong' });
  if (!record || record.ownerKey !== key) return json({ error: 'Link não pertence a esta licença.' }, 403);

  const now = new Date().toISOString();
  let live;

  if (action === 'start') {
    live = {
      gameId: text(body.gameId, 60),
      startedAt: now,
      updatedAt: now,
      events: [],
      score: { A: 0, B: 0 }
    };
  } else {
    const previous = isObject(record.live) ? record.live : null;
    if (!previous) return json({ error: 'Nenhuma partida ao vivo.' }, 400);

    const events = (Array.isArray(previous.events) ? previous.events : []).slice(-MAX_EVENTS)
      .map((ev) => cleanEvent(ev, now));
    const score = isObject(previous.score) ? { A: number(previous.score.A), B: number(previous.score.B) } : { A: 0, B: 0 };

    if (action === 'goal' || action === 'assist' || action === 'card') {
      const team = String(body.team || '').trim().toUpperCase() === 'B' ? 'B' : 'A';
      events.push({
        id: 'EV-' + randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase(),
        at: now,
        type: action,
        playerId: text(body.playerId, 60),
        team,
        minute: Math.max(0, Math.min(120, Math.floor(number(body.minute))))
      });
      if (action === 'goal') score[team] += 1;
    } else if (action === 'undo') {
      events.pop();
    }

    live = {
      ...previous,
      gameId: text(previous.gameId, 60),
      startedAt: text(previous.startedAt, 40),
      events: events.slice(-MAX_EVENTS),
      score: action === 'undo' ? scoreFromEvents(events) : { A: Math.max(0, Math.floor(score.A)), B: Math.max(0, Math.floor(score.B)) },
      updatedAt: now
    };
    if (action === 'stop') live.endedAt = now;
    else if (previous.endedAt) live.endedAt = text(previous.endedAt, 40);
  }

  await store.setJSON(v, { ...record, live, updatedAt: now }, { metadata: { owner: 'license' } });
  return json({ ok: true, live });
};
