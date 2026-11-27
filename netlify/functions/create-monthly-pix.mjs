/* Cria o PIX da mensalidade de um jogador identificado pelo link VP.
   A pendência só desaparece quando o webhook do Mercado Pago aprova o pagamento. */
import { createHash, randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { beginPayment, endPayment, json, mpFetch, mpTokenFor, paymentLockKey, paymentModeFor, siteUrl, setCorsOrigin, rateLimit, viewUnavailable } from './_shared.mjs';
import {
  VIEW_TOKEN, PLAYER_TOKEN, copyMonthlyPayments, findPlayerId,
  playerRole, publicMonthlyPayment, readJson, unpaidMonths
} from './_daily.mjs';

/* A mensalidade não disputa vaga por jogo, então o código pode durar mais. */
const PIX_MS = 24 * 60 * 60 * 1000;

function newPaymentId() {
  return 'MS-' + randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
}

function payerEmail(view, playerId) {
  const hash = createHash('sha256').update(view + '|' + playerId).digest('hex').slice(0, 14);
  return 'mensalista.' + hash + '@example.com';
}

function history(row, event, at) {
  return {
    ...row,
    history: [...(Array.isArray(row.history) ? row.history : []), { at, event }].slice(-12)
  };
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const limit = await rateLimit(req, 'monthly-pix', { max: 10, windowMs: 60000 });
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
    return json({ error: 'Pagamentos pelo Mercado Pago desativados. Use o PIX do administrador.' }, 410);
  }

  const playerId = findPlayerId(record.playerTokens, p);
  if (!playerId) return json({ error: 'Link de jogador inválido.' }, 403);
  if (playerRole(record, playerId) !== 'monthly') {
    return json({ error: 'Esta cobrança é só para mensalistas. Diaristas pagam a diária de cada jogo.' }, 400);
  }

  const unpaid = unpaidMonths(record, playerId);
  if (!unpaid.length) {
    return json({ ok: true, status: 'paid', message: 'Sua mensalidade está em dia. Obrigado!' });
  }

  const askedMonth = Number(body.month);
  const askedYear = Number(body.year);
  const due = unpaid.find((d) => d.month === askedMonth && d.year === askedYear) || unpaid[0];
  if (!(due.amount > 0)) return json({ error: 'Valor da mensalidade não configurado.' }, 503);

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const payments = copyMonthlyPayments(record.monthlyPayments);

  /* Reaproveita um código ainda válido para não criar dois PIX iguais. */
  const pending = Object.values(payments)
    .filter((row) => row.playerId === playerId && row.month === due.month && row.year === due.year &&
      row.status === 'pending' && Date.parse(row.expiresAt) > nowMs && (row.qrCode || row.qrBase64))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (pending) {
    return json({
      ok: true,
      status: 'pending',
      message: 'PIX da mensalidade já gerado. Pague para ficar em dia.',
      month: due.month,
      year: due.year,
      payment: publicMonthlyPayment(pending)
    });
  }

  /* Um código vencido não pode ser aproveitado por engano depois de gerar outro. */
  Object.values(payments)
    .filter((row) => row.playerId === playerId && row.month === due.month && row.year === due.year && row.status === 'pending')
    .forEach((row) => {
      row.status = 'expired';
      row.history = history(row, 'pix_expirado', now).history;
    });

  const token = await mpTokenFor(String(record.ownerKey || ''));
  if (!token) return json({ error: 'A conta Mercado Pago do administrador não está conectada.' }, 503);

  const paymentId = newPaymentId();
  const expiresAt = new Date(nowMs + PIX_MS).toISOString();
  const externalReference = 'MENSALIDADE|' + v + '|' + paymentId;
  const lockKey = paymentLockKey(['mensalidade-pix', v, playerId, due.month, due.year]);
  if (!(await beginPayment(lockKey, paymentId))) {
    return json({ error: 'Já estamos gerando seu PIX. Aguarde um instante e tente novamente.' }, 409);
  }

  try {
    const result = await mpFetch('/v1/payments', {
      token,
      method: 'POST',
      body: {
        transaction_amount: due.amount,
        description: ('Mensalidade Racha do Loló — ' +
          String(due.month).padStart(2, '0') + '/' + due.year).slice(0, 120),
        external_reference: externalReference,
        notification_url: siteUrl(req) + '/.netlify/functions/mp-webhook?cliente=' + encodeURIComponent(String(record.ownerKey || '')),
        payment_method_id: 'pix',
        date_of_expiration: expiresAt,
        payer: { email: payerEmail(v, playerId) }
      }
    });

    if (!result.ok || !result.data) {
      const detail = result.data?.message || 'Não foi possível gerar o PIX.';
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
      playerId,
      month: due.month,
      year: due.year,
      amount: due.amount,
      status: 'pending',
      externalReference,
      mpPaymentId: String(result.data.id || ''),
      qrCode,
      qrBase64: /^[A-Za-z0-9+/=]+$/.test(qrBase64) ? qrBase64.slice(0, 200000) : '',
      createdAt: now,
      expiresAt,
      paidAt: '',
      refundReason: ''
    }, 'pix_mensalidade_gerado', now);
    payments[paymentId] = row;

    await store.setJSON(v, {
      ...record,
      monthlyPayments: payments,
      updatedAt: now
    }, { metadata: { owner: 'license' } });

    return json({
      ok: true,
      status: 'pending',
      message: 'PIX gerado! Pague para ficar em dia e liberar a confirmação dos jogos.',
      month: due.month,
      year: due.year,
      payment: publicMonthlyPayment(row)
    });
  } finally {
    await endPayment(lockKey);
  }
};
