/* Reconciliação diária com o Mercado Pago.
   Confere o status real de cada assinatura e corrige o Blobs caso um webhook
   tenha sido perdido. Função agendável: aceita o POST interno do Netlify
   (`{"next_run":...}`) ou o header x-reconcile-secret. */
import { timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import {
  json, licenses, mpFetch, normalizeStatus, setCorsOrigin, clearStaleCancel, rateLimit
} from './_shared.mjs';

const MAX_PAGES = 50;
const LICENSE_KEY = /^RL-[A-Z0-9-]{8,40}$/;

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isProduction() {
  if (process.env.NETLIFY_LOCAL === 'true') return false;
  const context = String(process.env.CONTEXT || '').toLowerCase();
  return context === 'production' || String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function authorized(req, scheduled) {
  /* O agendador do Netlify envia POST com {"next_run":"..."} e não permite
     headers customizados; essas chamadas são internas e confiáveis. */
  if (scheduled) return true;
  const secret = process.env.RECONCILE_SECRET;
  if (secret) {
    const provided = typeof req.headers?.get === 'function'
      ? req.headers.get('x-reconcile-secret')
      : null;
    const a = Buffer.from(String(provided || ''));
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  return !isProduction() && new URL(req.url).searchParams.get('local') === '1';
}

async function isScheduledInvocation(req) {
  if (String(req.method || '').toUpperCase() !== 'POST') return false;
  /* Exige o identificador de agendamento além do corpo next_run, para que um
     POST comum não dispare a reconciliação se a função ganhar URL pública. */
  const get = typeof req.headers?.get === 'function' ? (n) => req.headers.get(n) : () => '';
  const event = String(get('x-netlify-event') || get('x-nf-event') || '').toLowerCase();
  const agent = String(get('user-agent') || '').toLowerCase();
  if (event !== 'schedule' && !agent.includes('netlify clockwork')) return false;
  try {
    const raw = await req.clone().text();
    if (!raw || raw.length > 1024) return false;
    const body = JSON.parse(raw);
    return isObject(body) && typeof body.next_run === 'string' && body.next_run.length > 0;
  } catch (e) { return false; }
}

async function listKeys(store) {
  if (typeof store.list !== 'function') {
    return { keys: [], warning: 'Listagem de licenças indisponível neste ambiente.' };
  }
  const keys = [];
  const seen = new Set();
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    let result;
    try {
      result = await store.list(cursor ? { cursor, limit: 100 } : { limit: 100 });
    } catch (e) {
      return { keys, warning: 'Não foi possível listar as licenças.' };
    }
    const blobs = Array.isArray(result && result.blobs) ? result.blobs : [];
    blobs.forEach((blob) => {
      const key = String(blob && blob.key ? blob.key : '');
      if (LICENSE_KEY.test(key) && !seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    });
    const next = String((result && (result.cursor || result.nextCursor)) || '');
    if (!next || next === cursor) return { keys, warning: '' };
    cursor = next;
  }
  return { keys, warning: 'Listagem truncada; nem todas as licenças foram verificadas.' };
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  const limit = await rateLimit(req, 'reconcile', { max: 10, windowMs: 60000 });
  if (!limit.ok) return json({ error: 'Muitas tentativas. Aguarde um minuto.' }, 429, {
    'Retry-After': String(limit.retryAfter)
  });

  const scheduled = await isScheduledInvocation(req);
  if (!authorized(req, scheduled)) return json({ error: 'Não autorizado.' }, 403);

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return json({ error: 'Pagamentos não configurados.' }, 503);

  const store = licenses();
  const { keys, warning } = await listKeys(store);
  const now = new Date().toISOString();
  let checked = 0;
  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (const key of keys) {
    let current;
    try {
      current = await store.get(key, { type: 'json', consistency: 'strong' });
    } catch (e) { failed++; continue; }
    if (!current || !current.subscriptionId || current.plan === 'lifetime') {
      skipped++;
      continue;
    }

    const result = await mpFetch('/preapproval/' + encodeURIComponent(current.subscriptionId), { token });
    if (!result.ok || !result.data) { failed++; continue; }
    const sub = result.data;
    const status = normalizeStatus(sub.status);
    const patch = {
      mpStatus: sub.status,
      status,
      amount: sub.auto_recurring?.transaction_amount || current.amount,
      nextPaymentAt: sub.next_payment_date || null,
      email: sub.payer_email || current.email,
      lastSyncAt: now,
      ...clearStaleCancel(current, sub)
    };

    /* Cancelamento solicitado só vale até o fim do período já pago. */
    const end = Date.parse(String(patch.nextPaymentAt || ''));
    if (current.cancelRequestedAt && Number.isFinite(end) && end <= Date.now()) {
      patch.status = 'inactive';
    }

    const changed = Object.keys(patch).some((k) => JSON.stringify(current[k]) !== JSON.stringify(patch[k]));
    if (!changed) { checked++; continue; }

    const next = {
      ...current,
      ...patch,
      key,
      updatedAt: now,
      history: [...(current.history || []), { at: now, event: 'reconcile:' + sub.status }].slice(-20)
    };
    try {
      await store.setJSON(key, next);
      updated++;
    } catch (e) { failed++; }
    checked++;
  }

  return json({ ok: true, at: now, total: keys.length, checked, updated, failed, skipped, warning });
};
