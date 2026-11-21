/* Consulta pública da licença. Nunca devolve token nem dados de pagamento. */
import {
  json, licenses, plans, maskEmail, validUntil, mpFetch, normalizeStatus,
  cleanDevice, deviceAllowed
} from './_shared.mjs';

function cleanKey(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

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
    lastSyncAt: now,
    updatedAt: now,
    history: [...(record.history || []), { at: now, event: 'verify:' + sub.status }].slice(-20)
  };
  await store.setJSON(key, next);
  return next;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json({}, 204);

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
  const publicInfo = {
    configured: !!process.env.MP_ACCESS_TOKEN,
    plans: {
      monthly: { amount: allPlans.monthly.amount, label: 'Mensal' },
      yearly: { amount: allPlans.yearly.amount, label: 'Anual' }
    }
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

  /* Troca de aparelho: confirma o e-mail do titular e move o vínculo.
     Mantém uma licença ativa por dispositivo por vez. */
  if (action === 'transfer') {
    if (!device) return json({ ...publicInfo, error: 'Dispositivo não identificado.' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email !== String(record.email || '').toLowerCase()) {
      return json({ ...publicInfo, valid: false, error: 'O e-mail informado não corresponde ao titular da assinatura.' }, 403);
    }
    const now = new Date().toISOString();
    record = {
      ...record,
      devices: [device],
      updatedAt: now,
      history: [...(record.history || []), { at: now, event: 'transfer:device' }].slice(-20)
    };
    await store.setJSON(key, record);
    return json({ ...publicInfo, ok: true, message: 'Chave vinculada a este aparelho.' }, 200);
  }

  /* Chave vinculada a outro aparelho: não revela e-mail nem dados da assinatura. */
  if (!deviceAllowed(record, device)) {
    return json({
      ...publicInfo,
      valid: false,
      state: 'device_mismatch',
      message: 'Esta chave está vinculada a outro dispositivo. Use o aparelho original ou fale com o administrador.'
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
