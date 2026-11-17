/* Recebe as notificações do Mercado Pago e atualiza a licença no Netlify Blobs. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { json, licenses, mpFetch, normalizeStatus } from './_shared.mjs';

function parseSignature(header) {
  const result = {};
  String(header || '').split(',').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > 0) result[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  });
  return { ts: result.ts || '', v1: result.v1 || '' };
}

function signatureIsValid(secret, { ts, v1 }, dataId, requestId) {
  if (!secret || !ts || !v1) return false;

  let tsMs = Number(ts);
  if (!Number.isFinite(tsMs)) return false;
  if (tsMs < 1e12) tsMs *= 1000;
  if (Math.abs(Date.now() - tsMs) > 10 * 60 * 1000) return false;

  const manifest = [
    dataId ? 'id:' + String(dataId).toLowerCase() + ';' : '',
    requestId ? 'request-id:' + requestId + ';' : '',
    'ts:' + ts + ';'
  ].join('');

  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  const received = String(v1).toLowerCase();
  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

async function findBySubscription(store, subscriptionId) {
  if (!subscriptionId) return null;
  const { blobs } = await store.list();
  for (const blob of blobs) {
    const record = await store.get(blob.key, { type: 'json', consistency: 'strong' });
    if (record && String(record.subscriptionId || '') === String(subscriptionId)) return record;
  }
  return null;
}

async function save(store, key, patch, event) {
  const current = (await store.get(key, { type: 'json', consistency: 'strong' })) || {};
  const clean = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  const next = {
    ...current,
    ...clean,
    key,
    updatedAt: new Date().toISOString(),
    history: [...(current.history || []), { at: new Date().toISOString(), event }].slice(-20)
  };
  await store.setJSON(key, next);
  return next;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json({}, 204);

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return json({ received: false, error: 'Pagamentos não configurados.' }, 503);

  const url = new URL(req.url);
  const dataId = url.searchParams.get('data.id') || url.searchParams.get('data_id') || '';
  const requestId = req.headers.get('x-request-id') || '';
  const secret = process.env.MP_WEBHOOK_SECRET;

  if (secret) {
    const signature = parseSignature(req.headers.get('x-signature'));
    if (!signatureIsValid(secret, signature, dataId, requestId)) {
      return json({ received: false, error: 'Assinatura inválida.' }, 401);
    }
  }

  let payload = {};
  try { payload = await req.json(); } catch (e) { payload = {}; }

  const topic = String(
    url.searchParams.get('topic') ||
    url.searchParams.get('type') ||
    payload.type ||
    payload.topic ||
    ''
  ).toLowerCase();

  const id = String(dataId || payload?.data?.id || '');
  if (!id) return json({ received: true, ignored: 'sem id' }, 200);

  const store = licenses();
  const now = new Date().toISOString();

  if (topic === 'subscription_preapproval' || topic === 'subscription') {
    const result = await mpFetch('/preapproval/' + encodeURIComponent(id), { token });
    if (!result.ok || !result.data) {
      return json({ received: false, error: 'Não foi possível consultar a assinatura.' }, 502);
    }

    const sub = result.data;
    const key = String(sub.external_reference || '').trim().toUpperCase();
    if (!key) return json({ received: true, ignored: 'sem external_reference' }, 200);

    await save(store, key, {
      email: sub.payer_email || undefined,
      subscriptionId: String(sub.id || id),
      mpStatus: sub.status,
      status: normalizeStatus(sub.status),
      amount: sub.auto_recurring?.transaction_amount || undefined,
      nextPaymentAt: sub.next_payment_date || null,
      lastSyncAt: now
    }, 'subscription:' + sub.status);

    return json({ received: true, key }, 200);
  }

  if (topic === 'subscription_authorized_payment' || topic === 'invoice') {
    const result = await mpFetch('/authorized_payments/' + encodeURIComponent(id), { token });
    if (!result.ok || !result.data) {
      return json({ received: true, ignored: 'cobrança não encontrada' }, 200);
    }

    const charge = result.data;
    const subId = String(charge.preapproval_id || charge.preapproval?.id || '');
    const record = await findBySubscription(store, subId);
    if (!record) return json({ received: true, ignored: 'assinatura não vinculada' }, 200);

    await save(store, record.key, {
      lastPaymentAt: charge.date_created || now,
      lastPaymentStatus: charge.status || '',
      status: charge.status === 'approved' ? 'active' : record.status
    }, 'charge:' + (charge.status || 'unknown'));

    return json({ received: true, key: record.key }, 200);
  }

  if (topic === 'payment') {
    const result = await mpFetch('/v1/payments/' + encodeURIComponent(id), { token });
    if (!result.ok || !result.data) return json({ received: true }, 200);

    const payment = result.data;
    const key = String(payment.external_reference || '').trim().toUpperCase();
    const record = key ? await store.get(key, { type: 'json', consistency: 'strong' }) : null;
    if (!record) return json({ received: true, ignored: 'pagamento sem licença' }, 200);

    await save(store, key, {
      status: payment.status === 'approved' ? 'active' : record.status,
      mpStatus: payment.status || record.mpStatus,
      lastPaymentAt: payment.date_approved || payment.date_created || now,
      lastPaymentStatus: payment.status || ''
    }, 'payment:' + payment.status);

    return json({ received: true, key }, 200);
  }

  return json({ received: true, ignored: topic || 'desconhecido' }, 200);
};
