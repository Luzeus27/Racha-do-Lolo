/* Consulta pública da licença. Nunca devolve token nem dados de pagamento. */
import { timingSafeEqual } from 'node:crypto';
import {
  json, licenses, plans, maskEmail, validUntil, mpFetch, normalizeStatus,
  cleanDevice, deviceAllowed, setCorsOrigin, clearStaleCancel, rateLimit
} from './_shared.mjs';

function cleanKey(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

/* Notebook + celular: a mesma chave pode ficar em até 2 aparelhos. */
const MAX_DEVICES = 2;

/* Confere direto no Mercado Pago quando o usuário volta do checkout.
   Serve como rede de segurança se o webhook atrasar ou não chegar. */
async function syncFromMercadoPago(store, key, record) {
  const token = process.env.MP_ACCESS_TOKEN;
  const subscriptionId = record && record.subscriptionId;
  if (!token || !subscriptionId || record.status === 'active' || record.cancelRequestedAt) return record;

  const res = await mpFetch('/preapproval/' + encodeURIComponent(subscriptionId), { token });
  if (!res.ok || !res.data) return record;

  const sub = res.data;
  const status = normalizeStatus(sub.status);
  if (status !== 'active') return record;

  const now = new Date().toISOString();
  const next = {
    ...record,
    status,
    mpStatus: sub.status,
    amount: sub.auto_recurring?.transaction_amount || record.amount,
    nextPaymentAt: sub.next_payment_date || record.nextPaymentAt || null,
    email: sub.payer_email || record.email,
    ...clearStaleCancel(record, sub),
    lastSyncAt: now,
    updatedAt: now,
    history: [...(record.history || []), { at: now, event: 'verify:' + sub.status }].slice(-20)
  };
  await store.setJSON(key, next);
  return next;
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);

  const limit = await rateLimit(req, 'license', { max: 60, windowMs: 60000 });
  if (!limit.ok) {
    return json({ error: 'Muitas consultas de licença. Aguarde um minuto.' }, 429, {
      'Retry-After': String(limit.retryAfter)
    });
  }

  let key = '';
  let action = '';
  let device = '';
  let email = '';
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      key = cleanKey(body.key);
      action = String(body.action || '');
      device = cleanDevice(body.deviceId);
      email = String(body.email || '').trim().toLowerCase();
    } catch (e) { key = ''; }
  } else if (req.method === 'GET') {
    const params = new URL(req.url).searchParams;
    key = cleanKey(params.get('key'));
    device = cleanDevice(params.get('device'));
  } else {
    return json({ error: 'Método não permitido.' }, 405);
  }

  const allPlans = plans();
  const publicPlans = {};
  Object.entries(allPlans).forEach(([id, p]) => {
    publicPlans[id] = {
      amount: p.amount, label: p.label, tier: p.tier, cycle: p.cycle
    };
  });
  const publicInfo = {
    configured: !!process.env.MP_ACCESS_TOKEN,
    plans: publicPlans
  };

  if (!key) return json({ ...publicInfo, state: 'no_key' }, 200);
  if (!/^[A-Z0-9-]{8,40}$/.test(key)) {
    return json({ ...publicInfo, valid: false, state: 'invalid' }, 200);
  }

  const store = licenses();
  let record = await store.get(key, { type: 'json', consistency: 'strong' });
  if (!record) {
    return json({ ...publicInfo, valid: false, state: 'not_found' }, 200);
  }

  /* Vincula até 2 aparelhos: confirma o e-mail do titular e acrescenta o novo,
     sem derrubar o aparelho já autorizado (notebook + celular, por exemplo). */
  if (action === 'transfer') {
    if (!device) return json({ ...publicInfo, error: 'Dispositivo não identificado.' }, 400);
    const ownerEmail = String(record.email || '').toLowerCase();
    const a = Buffer.from(email);
    const b = Buffer.from(ownerEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || a.length !== b.length || !timingSafeEqual(a, b)) {
      return json({ ...publicInfo, valid: false, error: 'O e-mail informado não corresponde ao titular da assinatura.' }, 403);
    }
    const devices = Array.isArray(record.devices) ? record.devices.slice(0, MAX_DEVICES) : [];
    if (!devices.includes(device)) {
      if (devices.length >= MAX_DEVICES) {
        return json({
          ...publicInfo,
          valid: false,
          error: 'Esta chave já está vinculada a 2 aparelhos. Desvincule um aparelho antes de adicionar outro.'
        }, 409);
      }
      devices.push(device);
    }
    const now = new Date().toISOString();
    record = {
      ...record,
      devices,
      updatedAt: now,
      history: [...(record.history || []), { at: now, event: 'transfer:device' }].slice(-20)
    };
    await store.setJSON(key, record);
    return json({
      ...publicInfo,
      ok: true,
      message: 'Chave vinculada a este aparelho. Você pode usar a chave em até 2 aparelhos.'
    }, 200);
  }

  /* Chave vinculada a outro aparelho: não revela e-mail nem dados da assinatura. */
  if (!deviceAllowed(record, device)) {
    return json({
      ...publicInfo,
      valid: false,
      state: 'device_mismatch',
      message: 'Esta chave está vinculada a outro dispositivo. Digite o e-mail usado no checkout no formulário abaixo para vincular este aparelho (até 2 aparelhos).'
    }, 200);
  }

  /* Licenças criadas antes do vínculo são associadas ao primeiro aparelho que consultar. */
  if (device && !(record.devices || []).length) {
    record = { ...record, devices: [device], updatedAt: new Date().toISOString() };
    await store.setJSON(key, record);
  }

  if (action === 'verify') {
    try { record = await syncFromMercadoPago(store, key, record); }
    catch (e) { /* mantém o status atual se o MP estiver indisponível */ }
  }

  let status = record.status === 'active' && validUntil(record.nextPaymentAt) ? 'active' : record.status || 'pending';

  /* Cancelamento solicitado: o acesso permanece até o fim do período já pago. */
  if (record.cancelRequestedAt && record.nextPaymentAt) {
    const end = Date.parse(record.nextPaymentAt);
    if (Number.isFinite(end) && end <= Date.now()) status = 'inactive';
  }

  const valid = status === 'active';

  return json({
    ...publicInfo,
    valid,
    state: status,
    key: record.key,
    plan: record.plan || 'monthly',
    amount: record.amount || null,
    emailMasked: maskEmail(record.email),
    nextPaymentAt: record.nextPaymentAt || null,
    lastPaymentAt: record.lastPaymentAt || null,
    cancelRequestedAt: record.cancelRequestedAt || null,
    updatedAt: record.updatedAt || record.createdAt || null
  }, 200);
};
