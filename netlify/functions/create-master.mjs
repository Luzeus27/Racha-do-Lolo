/* Cria uma licença vitalícia (conta master) para o administrador.
   Sem cobrança no Mercado Pago e sem recorrência. Uso único, protegido por segredo. */
import { randomUUID } from 'node:crypto';
import { json, licenses, cleanDevice, setCorsOrigin } from './_shared.mjs';

function cleanKey(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  /* Se MASTER_SETUP_SECRET estiver definida, ela tem precedência.
     Enquanto isso não acontece, usa a chave secreta já configurada do webhook. */
  const secret = process.env.MASTER_SETUP_SECRET || process.env.MP_WEBHOOK_SECRET;
  if (!secret) return json({ error: 'Setup de conta master não configurado.' }, 503);

  let body = {};
  try { body = await req.json(); } catch (e) { body = {}; }
  if (String(body.secret || '') !== secret) {
    return json({ error: 'Não autorizado.' }, 401);
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Informe um e-mail válido.' }, 400);
  }
  const device = cleanDevice(body.deviceId);

  const store = licenses();
  const now = new Date().toISOString();
  const newKey = () => 'RL-' + randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  let key = newKey();
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!(await store.get(key, { type: 'json', consistency: 'strong' }))) break;
    key = newKey();
  }

  await store.setJSON(key, {
    key,
    email,
    plan: 'lifetime',
    amount: 0,
    master: true,
    devices: device ? [device] : [],
    status: 'active',
    mpStatus: 'lifetime',
    subscriptionId: null,
    nextPaymentAt: null,
    lastPaymentAt: null,
    createdAt: now,
    updatedAt: now,
    history: [{ at: now, event: 'master_created' }]
  });

  return json({
    key,
    email,
    message: 'Conta master vitalícia criada. Digite esta chave no app para vincular ao aparelho.'
  });
};
