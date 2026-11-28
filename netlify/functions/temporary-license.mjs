/* Administração de chave temporária de teste (nível PRO, sem cobrança).
   Só a conta master vitalícia, em um dos aparelhos do titular, pode criar,
   prorrogar, consultar ou revogar. A chave gerada nunca vai para logs. */
import { createHash, randomUUID } from 'node:crypto';
import {
  json, licenses, cleanDevice, cleanLicenseKey, deviceAllowed,
  setCorsOrigin, rateLimit
} from './_shared.mjs';

const PLAN = 'temporary_pro';
const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_DAYS = 3; /* mesmo intervalo usado por validUntil() no servidor */
const KEY_RE = /^RL-[A-Z0-9-]{8,40}$/;
const ACTIONS = ['create', 'extend', 'revoke', 'status'];

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function pointerKey(masterKey) {
  return 'temp:' + createHash('sha256').update(masterKey).digest('hex').slice(0, 24);
}

function newKey() {
  return 'RL-' + randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
}

function futureDate(days, from = Date.now()) {
  return new Date(from + days * DAY_MS).toISOString();
}

/* nextPaymentAt é lido por várias funções com a tolerância de 3 dias do
   validUntil(). Guardar o fim real menos esses 3 dias faz todas expirarem
   na mesma data; expiresAt continua sendo a data mostrada ao usuário. */
function paymentDate(expiresAt) {
  return new Date(Date.parse(expiresAt) - GRACE_DAYS * DAY_MS).toISOString();
}

function daysLeft(expiresAt) {
  const end = Date.parse(String(expiresAt || ''));
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - Date.now()) / DAY_MS));
}

function history(record, event, extra = {}) {
  return [...(record.history || []), { at: new Date().toISOString(), event, ...extra }].slice(-20);
}

async function findByEmail(store, email) {
  if (typeof store.list !== 'function') return null;
  let cursor = null;
  for (let page = 0; page < 50; page++) {
    let result;
    try {
      result = await store.list(cursor ? { cursor, limit: 100 } : { limit: 100 });
    } catch (e) { return null; }
    const blobs = Array.isArray(result && result.blobs) ? result.blobs : [];
    for (const blob of blobs) {
      const key = String(blob && blob.key ? blob.key : '');
      if (!KEY_RE.test(key)) continue;
      try {
        const record = await store.get(key, { type: 'json', consistency: 'strong' });
        if (record && record.temporary && String(record.email || '').toLowerCase() === email) {
          return { key, record };
        }
      } catch (e) { /* uma chave ilegível não impede a busca */ }
    }
    const next = String((result && (result.cursor || result.nextCursor)) || '');
    if (!next || next === cursor) break;
    cursor = next;
  }
  return null;
}

async function locate(store, masterKey, email) {
  try {
    const pointer = await store.get(pointerKey(masterKey), { type: 'json', consistency: 'strong' });
    const key = cleanLicenseKey(pointer && pointer.key);
    if (key) {
      const record = await store.get(key, { type: 'json', consistency: 'strong' });
      if (record && record.temporary && (!email || String(record.email || '').toLowerCase() === email)) {
        return { key, record };
      }
    }
  } catch (e) { /* cai na busca por e-mail */ }
  return email ? findByEmail(store, email) : null;
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  let body = {};
  try { body = await req.json(); } catch (e) { return json({ error: 'Dados inválidos.' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Dados inválidos.' }, 400);
  }

  const masterKey = cleanLicenseKey(body.masterKey);
  const masterDevice = cleanDevice(body.masterDevice);
  const limit = await rateLimit(req, 'temp-license', {
    max: 12, windowMs: 60000, key: masterDevice || 'sem-aparelho'
  });
  if (!limit.ok) {
    return json({ error: 'Muitas tentativas. Aguarde um minuto.' }, 429, {
      'Retry-After': String(limit.retryAfter)
    });
  }
  if (!masterKey || !masterDevice) return json({ error: 'Não autorizado.' }, 401);

  const store = licenses();
  let master;
  try {
    master = await store.get(masterKey, { type: 'json', consistency: 'strong' });
  } catch (e) {
    return json({ error: 'Serviço de licenças indisponível.' }, 503);
  }
  const isOwner = !!master && master.plan === 'lifetime'
    && master.status === 'active' && deviceAllowed(master, masterDevice);
  if (!isOwner) return json({ error: 'Não autorizado.' }, 403);

  let action = ACTIONS.includes(String(body.action || '').toLowerCase())
    ? String(body.action).toLowerCase()
    : 'create';
  const email = cleanEmail(body.email);
  if (!email) return json({ error: 'Informe o e-mail de quem vai testar.' }, 400);

  const rawDays = Number(body.days);
  const days = Number.isInteger(rawDays) && rawDays > 0 ? Math.min(365, rawDays) : 60;
  const now = Date.now();

  /* Criar duas vezes para o mesmo e-mail prorroga a chave existente:
     nunca ficam duas chaves de teste ativas para a mesma pessoa. */
  let found = await locate(store, masterKey, email);
  if (action === 'create' && found) action = 'extend';

  if (action !== 'create' && !found) {
    return json({ error: 'Nenhuma chave temporária encontrada para este e-mail.' }, 404);
  }

  let key;
  let record;
  let message;

  if (action === 'create') {
    key = newKey();
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = await store.get(key, { type: 'json', consistency: 'strong' });
      if (!exists) break;
      key = newKey();
    }
    const expiresAt = futureDate(days, now);
    record = {
      key,
      email,
      plan: PLAN,
      temporary: true,
      master: false,
      amount: 0,
      devices: [],
      status: 'active',
      mpStatus: 'temporary',
      subscriptionId: null,
      nextPaymentAt: paymentDate(expiresAt),
      expiresAt,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      history: [{ at: new Date(now).toISOString(), event: 'temp_created', days }]
    };
    message = `Chave de teste criada com ${days} dias de validade.`;
  } else if (action === 'extend') {
    key = found.key;
    const previousEnd = Date.parse(String(found.record.expiresAt || found.record.nextPaymentAt || ''));
    const from = Number.isFinite(previousEnd) && previousEnd > now ? previousEnd : now;
    const expiresAt = futureDate(days, from);
    record = {
      ...found.record,
      email,
      plan: PLAN,
      temporary: true,
      status: 'active',
      revokedAt: null,
      nextPaymentAt: paymentDate(expiresAt),
      expiresAt,
      updatedAt: new Date(now).toISOString(),
      history: history(found.record, 'temp_extended', { days })
    };
    message = `Prazo prorrogado em ${days} dias, sem gerar outra chave.`;
  } else if (action === 'revoke') {
    key = found.key;
    record = {
      ...found.record,
      status: 'inactive',
      revokedAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      history: history(found.record, 'temp_revoked')
    };
    message = 'Chave de teste revogada. O acesso para imediatamente.';
  } else {
    return json({
      ok: true,
      action: 'status',
      key: found.key,
      email,
      status: found.record.status || 'active',
      expiresAt: found.record.expiresAt || null,
      daysLeft: daysLeft(found.record.expiresAt),
      message: 'Chave localizada.'
    }, 200);
  }

  try {
    await store.setJSON(key, record);
    await store.setJSON(pointerKey(masterKey), {
      key,
      email,
      expiresAt: record.expiresAt || null,
      revokedAt: record.revokedAt || null,
      updatedAt: record.updatedAt
    });
  } catch (e) {
    return json({ error: 'Não foi possível salvar a chave temporária. Tente novamente.' }, 503);
  }

  return json({
    ok: true,
    action,
    key,
    email,
    status: record.status,
    expiresAt: record.expiresAt || null,
    daysLeft: daysLeft(record.expiresAt),
    message
  }, 200);
};
