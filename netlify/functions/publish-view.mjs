/* Publica um retrato somente leitura do racha para o link compartilhável.
   Assinantes ativos (mensal/anual) e a conta vitalícia, no aparelho vinculado,
   podem publicar. Cada licença publica apenas o seu próprio retrato. */
import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { json, licenses, siteUrl, cleanDevice, deviceAllowed, normalizeStatus, validUntil } from './_shared.mjs';

const MAX_BYTES = 3 * 1024 * 1024;
const PHOTO_MAX = 160000;

function cleanKey(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function pick(source, keys) {
  const obj = source && typeof source === 'object' ? source : {};
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
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

/* Lista branca: nada de telefone, e-mail, chave PIX, comprovantes ou observações. */
function sanitize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const settings = pick(src.settings, [
    'year', 'monthlyFee', 'dayFee', 'goalkeepers', 'gamesPerMonth',
    'ptsGoal', 'ptsAssist', 'ptsPresence', 'ptsFairPlay', 'ptsPunctual', 'ptsCard',
    'plannedMembers'
  ]);

  const players = (Array.isArray(src.players) ? src.players : []).slice(0, 200).map((p) => ({
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
  }));

  const games = (Array.isArray(src.games) ? src.games : []).slice(0, 500).map((g) => ({
    id: text(g.id, 60),
    date: text(g.date, 20),
    month: number(g.month),
    year: number(g.year),
    done: g.done === true
  }));

  const confirmations = {};
  const conf = src.confirmations && typeof src.confirmations === 'object' ? src.confirmations : {};
  Object.keys(conf).slice(0, 200).forEach((key) => {
    confirmations[text(key, 60)] = ids(conf[key], 200);
  });

  const drawHistory = (Array.isArray(src.drawHistory) ? src.drawHistory : []).slice(0, 20).map((h) => ({
    id: text(h.id, 60),
    createdAt: text(h.createdAt, 40),
    gameKey: text(h.gameKey, 60),
    gameLabel: text(h.gameLabel, 60),
    mode: text(h.mode, 20),
    teamSize: number(h.teamSize),
    teams: (Array.isArray(h.teams) ? h.teams : []).slice(0, 20).map((t) => ids(t, 30))
  }));

  const scores = (Array.isArray(src.scores) ? src.scores : []).slice(0, 800).map((s) => ({
    id: text(s.id, 60),
    playerId: text(s.playerId, 60),
    month: number(s.month),
    year: number(s.year),
    goals: number(s.goals),
    assists: number(s.assists),
    presence: number(s.presence),
    fairPlay: number(s.fairPlay),
    punctual: number(s.punctual),
    cards: number(s.cards)
  }));

  const financeRaw = src.finance && typeof src.finance === 'object' ? src.finance : {};
  const finance = {
    paid: number(financeRaw.paid),
    open: number(financeRaw.open),
    byMonth: (Array.isArray(financeRaw.byMonth) ? financeRaw.byMonth : []).slice(0, 36).map((m) => ({
      month: number(m.month),
      year: number(m.year),
      paid: number(m.paid),
      open: number(m.open)
    }))
  };

  return {
    publishedAt: text(src.publishedAt, 40),
    settings,
    players,
    games,
    confirmations,
    drawHistory,
    scores,
    finance
  };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  let body = {};
  try { body = await req.json(); } catch (e) { body = {}; }

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

  let token = wantsReuse ? requested : 'VW-' + randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
  if (wantsReuse) {
    const existing = await store.get(token, { type: 'json', consistency: 'strong' });
    if (existing && existing.ownerKey !== key) token = 'VW-' + randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
  }

  const now = new Date().toISOString();
  await store.setJSON(token, {
    token,
    ownerKey: key,
    createdAt: (await store.get(token, { type: 'json', consistency: 'strong' }))?.createdAt || now,
    updatedAt: now,
    snapshot: { ...snapshot, publishedAt: now }
  }, { metadata: { owner: 'license' } });

  return json({
    ok: true,
    token,
    url: siteUrl(req) + '/visualizar.html?v=' + encodeURIComponent(token),
    publishedAt: now
  });
};
