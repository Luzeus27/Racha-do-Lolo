/* Cancela a assinatura no Mercado Pago a pedido do titular da chave. */
import { json, licenses, mpFetch, cleanDevice, deviceAllowed, setCorsOrigin } from './_shared.mjs';

function cleanKey(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return json({ error: 'Pagamentos não configurados.' }, 503);

  let body = {};
  try { body = await req.json(); } catch (e) { body = {}; }

  const key = cleanKey(body.key);
  const device = cleanDevice(body.deviceId);
  if (!/^[A-Z0-9-]{8,40}$/.test(key)) return json({ error: 'Chave inválida.' }, 400);
  if (!device) return json({ error: 'Dispositivo não identificado.' }, 400);

  const store = licenses();
  const record = await store.get(key, { type: 'json', consistency: 'strong' });
  if (!record) return json({ error: 'Licença não encontrada.' }, 404);
  if (!deviceAllowed(record, device)) {
    return json({ error: 'Esta chave está vinculada a outro dispositivo.' }, 403);
  }
  if (!record.subscriptionId) return json({ error: 'Assinatura não encontrada.' }, 404);

  const alreadyRequested = !!record.cancelRequestedAt;
  if (!alreadyRequested) {
    const res = await mpFetch('/preapproval/' + encodeURIComponent(record.subscriptionId), {
      token,
      method: 'PUT',
      body: { status: 'cancelled' }
    });
    if (!res.ok) {
      /* Se o Mercado Pago já cancelou, aceita o estado atual. */
      if (String(res.data?.status || '').toLowerCase() !== 'cancelled') {
        return json({
          error: 'Não foi possível cancelar no Mercado Pago. Tente novamente ou fale com o administrador.',
          detail: res.data?.message || null
        }, 502);
      }
    }
  }

  const now = new Date().toISOString();
  const next = {
    ...record,
    cancelRequestedAt: record.cancelRequestedAt || now,
    mpStatus: 'cancelled',
    updatedAt: now,
    history: [
      ...(record.history || []),
      { at: now, event: alreadyRequested ? 'cancel:repeat' : 'cancel:user_request' }
    ].slice(-20)
  };
  await store.setJSON(key, next);

  return json({
    ok: true,
    state: 'cancelled',
    message: 'Assinatura cancelada. O acesso permanece até o fim do período já pago.'
  }, 200);
};
