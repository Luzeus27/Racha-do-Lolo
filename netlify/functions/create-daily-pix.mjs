/* Cria o PIX da diária de um jogo para um jogador identificado pelo link VP.
   A vaga só é confirmada depois que o webhook do Mercado Pago avisar o pagamento. */
import { createHash, randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { json, mpFetch, mpTokenFor, paymentModeFor, siteUrl, setCorsOrigin, rateLimit, viewUnavailable } from './_shared.mjs';
import {
  VIEW_TOKEN, PLAYER_TOKEN, copyCredits, copyDailyPayments, copyReservations,
  copyResponses, copyWaitlist, cleanWaitlist, findPlayerId, gameById,
  hasSlot, isObject, playerRole, readJson, text
} from './_daily.mjs';

const RESERVATION_MS = 30 * 60 * 1000;

function newPaymentId() {
  return 'DP-' + randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
}

function payerEmail(view, playerId) {
  const hash = createHash('sha256').update(view + '|' + playerId).digest('hex').slice(0, 14);
  return 'jogador.' + hash + '@example.com';
}

function gameLabel(game) {
  const date = String(game?.date || '');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const day = match ? `${match[3]}/${match[2]}/${match[1]}` : date;
  const name = String(game?.name || '').trim();
  return ('Diária Racha do Loló' + (name ? ' — ' + name : '') + (day ? ' — ' + day : '')).slice(0, 120);
}

function history(row, event, at) {
  return {
    ...row,
    history: [...(Array.isArray(row.history) ? row.history : []), { at, event }].slice(-12)
  };
}

function publicPayment(row) {
  if (!row) return null;
  return {
    status: row.status,
    amount: row.amount,
    qrCode: row.qrCode,
    qrBase64: row.qrBase64,
    expiresAt: row.expiresAt,
    paidAt: row.paidAt,
    usedCredit: row.usedCredit,
    paymentId: row.paymentId
  };
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const limit = await rateLimit(req, 'daily-pix', { max: 12, windowMs: 60000 });
  if (!limit.ok) {
    return json({ error: 'Muitas tentativas em pouco tempo. Aguarde um minuto.' }, 429, {
      'Retry-After': String(limit.retryAfter)
    });
  }

  const { body, tooLarge } = await readJson(req);
  if (tooLarge) return json({ error: 'Requisição muito grande.' }, 413);

  const v = String(body.v || '').trim().toUpperCase();
  const p = String(body.p || '').trim().toUpperCase();
  const gameId = text(body.gameId, 60);
  if (!VIEW_TOKEN.test(v) || !PLAYER_TOKEN.test(p)) return json({ error: 'Link inválido.' }, 400);
  if (!gameId) return json({ error: 'Jogo não identificado.' }, 400);

  const store = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });
  const record = await store.get(v, { type: 'json', consistency: 'strong' });
  if (!record) return json({ error: 'Link inválido ou removido.' }, 404);
  const unavailable = viewUnavailable(record);
  if (unavailable) return json({ error: unavailable, expired: true }, 410);
  if (await paymentModeFor(record) !== 'mp') {
    return json({ error: 'Pagamentos pelo Mercado Pago desativados. Use o PIX do administrador.' }, 410);
  }

  const playerId = findPlayerId(record.playerTokens, p);
  if (!playerId) return json({ error: 'Link de jogador inválido.' }, 403);

  const settings = isObject(record.snapshot?.settings) ? record.snapshot.settings : {};
  if (settings.dailyPaymentEnabled === false) {
    return json({ ok: true, status: 'disabled', message: 'O pagamento de diárias está desligado. Confirme normalmente.' });
  }
  if (playerRole(record, playerId) !== 'daily') {
    return json({ ok: true, status: 'yes', message: 'Sua mensalidade já está paga. Confirme normalmente.' });
  }

  const game = gameById(record, gameId);
  if (!game) return json({ error: 'Jogo não encontrado neste link.' }, 404);
  if (game.done === true) return json({ error: 'Este jogo já foi realizado.' }, 400);

  const amount = Number(settings.dayFee);
  if (!Number.isFinite(amount) || amount <= 0) {
    return json({ error: 'O valor da diária não está configurado.' }, 503);
  }

  const responses = copyResponses(record.responses);
  if (responses[gameId]?.[playerId] === 'yes') {
    return json({ ok: true, status: 'yes', message: 'Sua presença já está confirmada.' });
  }
  const paidBefore = Object.values(copyDailyPayments(record.dailyPayments))
    .some((row) => row.gameId === gameId && row.playerId === playerId && row.status === 'confirmed');
  if (paidBefore) {
    return json({ ok: true, status: 'yes', message: 'Sua presença já está confirmada.' });
  }

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const payments = copyDailyPayments(record.dailyPayments);
  const reservations = copyReservations(record.reservations);
  const credits = copyCredits(record.dailyCredits);

  /* Reaproveita um QR ainda válido: evita duplicidade e não cria outro PIX
     só porque a pessoa tocou duas vezes no botão. */
  const pending = Object.values(payments)
    .filter((row) => row.gameId === gameId && row.playerId === playerId &&
      row.status === 'pending' && Date.parse(row.expiresAt) > nowMs && row.qrCode)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (pending) {
    return json({
      ok: true,
      status: 'pending',
      message: 'PIX já gerado. Pague e a vaga será confirmada automaticamente.',
      payment: publicPayment(pending)
    });
  }

  /* Um código vencido não pode ser pago depois que outro foi gerado. */
  Object.values(payments)
    .filter((row) => row.gameId === gameId && row.playerId === playerId && row.status === 'pending')
    .forEach((row) => {
      row.status = 'expired';
      row.history = history(row, 'pix_expirado', now).history;
    });

  if (!hasSlot(record, gameId, playerId, nowMs)) {
    const waitlist = copyWaitlist(record.waitlist);
    if (!Array.isArray(waitlist[gameId])) waitlist[gameId] = [];
    if (!waitlist[gameId].includes(playerId)) waitlist[gameId].push(playerId);
    await store.setJSON(v, {
      ...record,
      waitlist,
      dailyPayments: payments,
      reservations,
      updatedAt: now
    }, { metadata: { owner: 'license' } });
    return json({
      ok: true,
      status: 'wait',
      waitlist: waitlist[gameId],
      message: 'As vagas acabaram. Você entrou na fila de espera e não precisa pagar agora.'
    });
  }

  /* Crédito de um jogo cancelado pode garantir a vaga sem novo pagamento. */
  if ((credits[playerId] || 0) + 0.001 >= amount) {
    const paymentId = newPaymentId();
    const row = history({
      paymentId,
      gameId,
      playerId,
      amount,
      status: 'confirmed',
      mpPaymentId: '',
      externalReference: '',
      qrCode: '',
      qrBase64: '',
      createdAt: now,
      expiresAt: '',
      paidAt: now,
      usedCredit: true,
      refundReason: ''
    }, 'credito_utilizado', now);
    payments[paymentId] = row;
    credits[playerId] = Math.round(((credits[playerId] || 0) - amount) * 100) / 100;
    if (credits[playerId] <= 0) delete credits[playerId];

    if (!isObject(responses[gameId])) responses[gameId] = Object.create(null);
    responses[gameId][playerId] = 'yes';
    const waitlist = cleanWaitlist(responses, copyWaitlist(record.waitlist));
    reservations[gameId] = (reservations[gameId] || []).filter((r) => r.playerId !== playerId);

    await store.setJSON(v, {
      ...record,
      responses,
      waitlist,
      dailyPayments: payments,
      dailyCredits: credits,
      reservations,
      updatedAt: now
    }, { metadata: { owner: 'license' } });

    return json({
      ok: true,
      status: 'yes',
      usedCredit: true,
      message: 'Crédito usado. Presença confirmada!',
      payment: publicPayment(row)
    });
  }

  const token = await mpTokenFor(String(record.ownerKey || ''));
  if (!token) return json({ error: 'A conta Mercado Pago do administrador não está conectada.' }, 503);

  const paymentId = newPaymentId();
  const expiresAt = new Date(nowMs + RESERVATION_MS).toISOString();
  const externalReference = 'DIARIA|' + v + '|' + paymentId;
  const result = await mpFetch('/v1/payments', {
    token,
    method: 'POST',
    body: {
      transaction_amount: amount,
      description: gameLabel(game),
      external_reference: externalReference,
      notification_url: siteUrl(req) + '/.netlify/functions/mp-webhook?cliente=' + encodeURIComponent(String(record.ownerKey || '')),
      payment_method_id: 'pix',
      date_of_expiration: expiresAt,
      payer: { email: payerEmail(v, playerId) }
    }
  });

  if (!result.ok || !result.data) {
    const detail = result.data?.message || result.error || 'Não foi possível gerar o PIX.';
    return json({ error: 'Mercado Pago: ' + detail }, 502);
  }

  const interaction = result.data.point_of_interaction?.transaction_data || {};
  const qrCode = String(interaction.qr_code || '').slice(0, 2000);
  const qrBase64 = String(interaction.qr_code_base64 || '');
  if (!qrCode && !/^[A-Za-z0-9+/=]+$/.test(qrBase64)) {
    return json({ error: 'O Mercado Pago não devolveu o código PIX. Tente novamente.' }, 502);
  }

  const row = history({
    paymentId,
    gameId,
    playerId,
    amount,
    status: 'pending',
    externalReference,
    mpPaymentId: String(result.data.id || ''),
    qrCode,
    qrBase64: /^[A-Za-z0-9+/=]+$/.test(qrBase64) ? qrBase64.slice(0, 200000) : '',
    createdAt: now,
    expiresAt,
    paidAt: '',
    usedCredit: false,
    refundReason: ''
  }, 'pix_gerado', now);
  payments[paymentId] = row;
  reservations[gameId] = [
    ...(reservations[gameId] || []).filter((r) => r.playerId !== playerId),
    { paymentId, playerId, createdAt: now, expiresAt }
  ].slice(0, 200);

  await store.setJSON(v, {
    ...record,
    dailyPayments: payments,
    reservations,
    updatedAt: now
  }, { metadata: { owner: 'license' } });

  return json({
    ok: true,
    status: 'pending',
    message: 'PIX gerado! Pague para garantir sua vaga. A confirmação é automática.',
    payment: publicPayment(row)
  });
};
