/* Faz upgrade do Básico para o PRO alterando a assinatura existente no Mercado Pago.
   Não cria nova chave nem nova assinatura: evita cobrança dupla. */
import { json, licenses, plans, mpFetch, cleanDevice, deviceAllowed, setCorsOrigin, rateLimit } from './_shared.mjs';

function cleanKey(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
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

  const key = cleanKey(body.key);
  const device = cleanDevice(body.deviceId);
  if (!/^RL-[A-Z0-9-]{8,40}$/.test(key)) return json({ error: 'Chave inválida.' }, 400);
  if (!device) return json({ error: 'Dispositivo não identificado.' }, 400);

  const limit = await rateLimit(req, 'change-plan', { max: 8, windowMs: 60000, key: key + '|' + device });
  if (!limit.ok) {
    return json({ error: 'Muitas tentativas. Aguarde um minuto e tente novamente.' }, 429, {
      'Retry-After': String(limit.retryAfter)
    });
  }

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return json({ error: 'Pagamentos não configurados.' }, 503);

  const allPlans = plans();
  const plan = String(body.plan || '');
  if (!Object.prototype.hasOwnProperty.call(allPlans, plan)) {
    return json({ error: 'Plano inválido.' }, 400);
  }
  const target = allPlans[plan];
  if (target.tier !== 'intermediate') {
    return json({ error: 'Este botão serve apenas para subir ao PRO.' }, 400);
  }

  const store = licenses();
  const record = await store.get(key, { type: 'json', consistency: 'strong' });
  if (!record) return json({ error: 'Licença não encontrada.' }, 404);
  if (!deviceAllowed(record, device)) {
    return json({ error: 'Esta chave está vinculada a outro dispositivo.' }, 403);
  }
  if (record.cancelRequestedAt) {
    return json({ error: 'Você solicitou o cancelamento. Assine novamente para fazer o upgrade.' }, 409);
  }
  if (record.status !== 'active') {
    return json({ error: 'A assinatura precisa estar ativa para fazer o upgrade.' }, 409);
  }
  if (!record.subscriptionId) {
    return json({ error: 'Assinatura não encontrada no Mercado Pago.' }, 404);
  }

  const current = allPlans[record.plan];
  if (!current || current.tier !== 'basic') {
    return json({ error: 'Esta licença já não é do plano Básico.' }, 409);
  }
  /* A API do Mercado Pago permite mudar o valor, mas não a frequência da
     assinatura existente. Por isso mensal vai só para PRO mensal, e anual
     só para PRO anual. */
  if (current.cycle !== target.cycle) {
    return json({ error: 'Para trocar mensal por anual (ou o contrário), cancele a renovação e assine no novo ciclo.' }, 409);
  }

  if (record.plan === plan && Number(record.amount) === Number(target.amount)) {
    return json({ ok: true, unchanged: true, key, plan, amount: target.amount, message: 'Esta licença já está no PRO.' }, 200);
  }

  const subId = encodeURIComponent(String(record.subscriptionId));
  const before = await mpFetch('/preapproval/' + subId, { token });
  if (!before.ok) {
    return json({ error: 'Não foi possível consultar a assinatura no Mercado Pago. Tente novamente.' }, 502);
  }
  const mpStatus = String(before.data?.status || '').toLowerCase();
  if (!['authorized', 'active', 'active_pending_cancel'].includes(mpStatus)) {
    return json({ error: 'A assinatura no Mercado Pago não está ativa. Regularize-a antes de fazer o upgrade.' }, 409);
  }

  const changed = await mpFetch('/preapproval/' + subId, {
    token,
    method: 'PUT',
    body: {
      reason: 'Racha do Loló — assinatura ' + target.label,
      auto_recurring: { transaction_amount: target.amount, currency_id: 'BRL' }
    }
  });
  if (!changed.ok) {
    const detail = changed.data?.message || '';
    return json({ error: 'Não foi possível alterar o valor no Mercado Pago. ' + detail }, 502);
  }

  const now = new Date().toISOString();
  const updated = {
    ...record,
    plan,
    amount: target.amount,
    previousPlan: record.plan,
    previousAmount: record.amount || null,
    planChangedAt: now,
    updatedAt: now,
    history: [
      ...(record.history || []),
      { at: now, event: 'upgrade:' + record.plan + '>' + plan, from: record.amount || null, to: target.amount }
    ].slice(-20)
  };
  await store.setJSON(key, updated);

  return json({
    ok: true,
    key,
    plan,
    amount: target.amount,
    message: 'Upgrade concluído. Sua chave continua a mesma e não haverá duas cobranças.'
  }, 200);
};
