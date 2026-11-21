/* Cria uma assinatura recorrente no Mercado Pago e devolve o link de pagamento. */
import { randomUUID } from 'node:crypto';
import { json, siteUrl, plans, licenses, mpFetch, cleanDevice } from './_shared.mjs';

function newKey() {
  return 'RL-' + randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    return json({
      error: 'Os pagamentos ainda não foram configurados. Siga o passo a passo no README para ligar o Mercado Pago.'
    }, 503);
  }

  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'Dados inválidos.' }, 400); }

  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Informe um e-mail válido para receber a assinatura.' }, 400);
  }

  /* A chave passa a valer apenas neste aparelho (anti-compartilhamento). */
  const device = cleanDevice(body.deviceId);

  const allPlans = plans();
  const plan = Object.prototype.hasOwnProperty.call(allPlans, body.plan) ? body.plan : 'monthly';
  const chosen = allPlans[plan];

  let key = newKey();
  const store = licenses();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await store.get(key, { type: 'json', consistency: 'strong' });
    if (!existing) break;
    key = newKey();
  }

  const base = siteUrl(req);
  const backUrl = base + '/index.html?license=' + encodeURIComponent(key);
  const notificationUrl = base + '/.netlify/functions/mp-webhook';

  const payload = {
    reason: 'Racha do Loló — assinatura ' + chosen.label,
    external_reference: key,
    payer_email: email,
    auto_recurring: {
      frequency: chosen.frequency,
      frequency_type: 'months',
      transaction_amount: chosen.amount,
      currency_id: 'BRL'
    },
    back_url: backUrl,
    notification_url: notificationUrl,
    status: 'pending'
  };

  const result = await mpFetch('/preapproval', { token, method: 'POST', body: payload });
  if (!result.ok || !result.data || !result.data.init_point) {
    const detail = result.data?.message || result.error || 'Não foi possível abrir o pagamento.';
    return json({ error: 'Mercado Pago: ' + detail }, 502);
  }

  await store.setJSON(key, {
    key,
    email,
    plan,
    amount: chosen.amount,
    devices: device ? [device] : [],
    status: 'pending',
    mpStatus: result.data.status || 'pending',
    subscriptionId: String(result.data.id || ''),
    initPoint: result.data.init_point,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: [{ at: new Date().toISOString(), status: 'checkout_criado' }]
  });

  return json({
    key,
    initPoint: result.data.init_point,
    subscriptionId: String(result.data.id || ''),
    message: 'Abra o link do Mercado Pago para concluir a assinatura.'
  });
};
