/* Cancela a autorização de cobrança automática da mensalidade.
   Não devolve dinheiro: só impede cobranças futuras. */
import { getStore } from '@netlify/blobs';
import { json, mpFetch, mpTokenFor, paymentModeFor, setCorsOrigin, rateLimit, viewUnavailable } from './_shared.mjs';
import { VIEW_TOKEN, PLAYER_TOKEN, copyAutoPayments, findPlayerId, readJson } from './_daily.mjs';

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const limit = await rateLimit(req, 'monthly-auto-cancel', { max: 10, windowMs: 60000 });
  if (!limit.ok) {
    return json({ error: 'Muitas tentativas em pouco tempo. Aguarde um minuto.' }, 429, {
      'Retry-After': String(limit.retryAfter)
    });
  }

  const { body, tooLarge } = await readJson(req);
  if (tooLarge) return json({ error: 'Requisição muito grande.' }, 413);

  const v = String(body.v || '').trim().toUpperCase();
  const p = String(body.p || '').trim().toUpperCase();
  if (!VIEW_TOKEN.test(v) || !PLAYER_TOKEN.test(p)) return json({ error: 'Link inválido.' }, 400);

  const store = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });
  const record = await store.get(v, { type: 'json', consistency: 'strong' });
  if (!record) return json({ error: 'Link inválido ou removido.' }, 404);
  const unavailable = viewUnavailable(record);
  if (unavailable) return json({ error: unavailable, expired: true }, 410);
  if (await paymentModeFor(record) !== 'mp') return json({ error: 'Cobrança automática desativada.' }, 410);

  const playerId = findPlayerId(record.playerTokens, p);
  if (!playerId) return json({ error: 'Link de jogador inválido.' }, 403);

  const autos = copyAutoPayments(record.autoPayments);
  const row = autos[playerId];
  if (!row || !row.preapprovalId || row.status === 'cancelled') {
    if (row && row.status === 'cancelled') return json({ ok: true, status: 'cancelled', message: 'Cobrança automática já estava cancelada.' });
    return json({ error: 'Não há cobrança automática ativa para cancelar.' }, 404);
  }

  const now = new Date().toISOString();
  const token = await mpTokenFor(String(record.ownerKey || ''));
  if (!token) return json({ error: 'A conta Mercado Pago do administrador não está conectada.' }, 503);

  const result = await mpFetch('/preapproval/' + encodeURIComponent(row.preapprovalId), {
    token,
    method: 'PUT',
    body: { status: 'cancelled' }
  });
  if (!result.ok) {
    const detail = result.data?.message || 'Não foi possível cancelar no Mercado Pago.';
    return json({ error: 'Mercado Pago: ' + detail }, 502);
  }

  autos[playerId] = {
    ...row,
    status: 'cancelled',
    cancelledAt: now,
    history: [...(row.history || []), { at: now, event: 'cancelada_pelo_jogador' }].slice(-12)
  };

  await store.setJSON(v, {
    ...record,
    autoPayments: autos,
    updatedAt: now
  }, { metadata: { owner: 'license' } });

  return json({ ok: true, status: 'cancelled', message: 'Cobrança automática cancelada. Você ainda pode pagar no Pix ou no cartão.' });
};
