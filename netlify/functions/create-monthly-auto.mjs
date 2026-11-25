/* Autoriza a cobrança automática da mensalidade no cartão.
   O jogador autoriza uma vez; o Mercado Pago cobra todo mês e o webhook baixa. */
import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { cardGross, cardFeeRate, json, mpFetch, mpTokenFor, paymentModeFor, siteUrl, setCorsOrigin, rateLimit, viewUnavailable } from './_shared.mjs';
import {
  VIEW_TOKEN, PLAYER_TOKEN, copyAutoPayments, findPlayerId,
  playerRole, readJson
} from './_daily.mjs';

function payerEmail(view, playerId) {
  const hash = createHash('sha256').update(view + '|' + playerId).digest('hex').slice(0, 14);
  return 'mensalista.' + hash + '@example.com';
}

function autoHistory(row, event, at) {
  return {
    ...row,
    history: [...(Array.isArray(row.history) ? row.history : []), { at, event }].slice(-12)
  };
}

function publicAuto(row) {
  if (!row) return null;
  return {
    status: row.status,
    netAmount: row.netAmount,
    grossAmount: row.grossAmount,
    feeAmount: row.feeAmount,
    initPoint: row.initPoint,
    activatedAt: row.activatedAt,
    cancelledAt: row.cancelledAt,
    lastChargeAt: row.lastChargeAt,
    lastChargeStatus: row.lastChargeStatus
  };
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const limit = await rateLimit(req, 'monthly-auto', { max: 10, windowMs: 60000 });
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
  if (await paymentModeFor(record) !== 'mp') {
    return json({ error: 'Cobrança automática desativada. Use o PIX do administrador.' }, 410);
  }

  const playerId = findPlayerId(record.playerTokens, p);
  if (!playerId) return json({ error: 'Link de jogador inválido.' }, 403);
  if (playerRole(record, playerId) !== 'monthly') {
    return json({ error: 'A cobrança automática é só para mensalistas.' }, 400);
  }

  const autos = copyAutoPayments(record.autoPayments);
  const current = autos[playerId];
  if (current && current.status !== 'cancelled') {
    return json({
      ok: true,
      status: current.status,
      message: current.status === 'active'
        ? 'Cobrança automática já está ativa.'
        : 'Autorização no Mercado Pago já foi iniciada. Conclua para ativar.',
      auto: publicAuto(current)
    });
  }

  const net = Math.round(Number(record.snapshot?.settings?.monthlyFee) * 100) / 100;
  if (!(net > 0)) return json({ error: 'Valor da mensalidade não configurado.' }, 503);
  const gross = cardGross(net);
  const fee = Math.round((gross - net) * 100) / 100;
  const token = await mpTokenFor(String(record.ownerKey || ''));
  if (!token) return json({ error: 'A conta Mercado Pago do administrador não está conectada.' }, 503);

  const now = new Date().toISOString();
  const back = siteUrl(req) + '/jogador.html?v=' + encodeURIComponent(v) + '&p=' + encodeURIComponent(p);
  const externalReference = 'MENSALIDADE-AUTO|' + v + '|' + playerId;

  const result = await mpFetch('/preapproval', {
    token,
    method: 'POST',
    body: {
      reason: 'Mensalidade Racha do Loló — cobrança automática',
      external_reference: externalReference,
      payer_email: payerEmail(v, playerId),
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: gross,
        currency_id: 'BRL'
      },
      back_url: back,
      notification_url: siteUrl(req) + '/.netlify/functions/mp-webhook?cliente=' + encodeURIComponent(String(record.ownerKey || '')),
      status: 'pending'
    }
  });

  if (!result.ok || !result.data) {
    const detail = result.data?.message || result.error || 'Não foi possível iniciar a cobrança automática.';
    return json({ error: 'Mercado Pago: ' + detail }, 502);
  }

  const initPoint = String(result.data.init_point || result.data.sandbox_init_point || '');
  if (!/^https:\/\//.test(initPoint)) {
    return json({ error: 'O Mercado Pago não devolveu o link de autorização. Tente novamente.' }, 502);
  }

  const row = autoHistory({
    playerId,
    status: 'pending',
    preapprovalId: String(result.data.id || ''),
    externalReference,
    netAmount: net,
    grossAmount: gross,
    feeAmount: fee,
    initPoint: initPoint.slice(0, 600),
    createdAt: now,
    activatedAt: '',
    cancelledAt: '',
    lastChargeAt: '',
    lastChargeStatus: ''
  }, 'autorização_iniciada:' + cardFeeRate().toFixed(4), now);
  autos[playerId] = row;

  await store.setJSON(v, {
    ...record,
    autoPayments: autos,
    updatedAt: now
  }, { metadata: { owner: 'license' } });

  return json({
    ok: true,
    status: 'pending',
    message: 'Autorize a cobrança automática no Mercado Pago.',
    amount: net,
    grossAmount: gross,
    feeAmount: fee,
    auto: publicAuto(row)
  });
};
