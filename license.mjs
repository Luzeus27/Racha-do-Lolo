/* Consulta pública da licença. Nunca devolve token nem dados de pagamento. */
import { json, licenses, plans, maskEmail, validUntil } from './_shared.mjs';

function cleanKey(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json({}, 204);

  let key = '';
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      key = cleanKey(body.key);
    } catch (e) { key = ''; }
  } else if (req.method === 'GET') {
    key = cleanKey(new URL(req.url).searchParams.get('key'));
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

  const record = await licenses().get(key, { type: 'json', consistency: 'strong' });
  if (!record) {
    return json({ ...publicInfo, valid: false, state: 'not_found' }, 200);
  }

  const status = record.status === 'active' && validUntil(record.nextPaymentAt) ? 'active' : record.status || 'pending';
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
    updatedAt: record.updatedAt || record.createdAt || null
  }, 200);
};
