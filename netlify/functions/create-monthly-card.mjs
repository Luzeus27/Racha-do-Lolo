/* Cobrança avulsa da mensalidade no cartão de crédito.
   O jogador paga o valor líquido + a taxa do Mercado Pago; o webhook dá a baixa. */
import { createHash, randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { cardGross, cardFeeRate, json, mpFetch, mpTokenFor, paymentModeFor, siteUrl, setCorsOrigin, rateLimit, viewUnavailable } from './_shared.mjs';
import {
  VIEW_TOKEN, PLAYER_TOKEN, copyMonthlyPayments, findPlayerId,
  playerRole, publicMonthlyPayment, readJson, unpaidMonths
} from './_daily.mjs';

/* Uma sessão de checkout pode ficar aberta por até 24 h. */
const CHECKOUT_MS = 24 * 60 * 60 * 1000;

function newPaymentId() {
  return 'MS-' + randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
}

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

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const limit = await rateLimit(req, 'monthly-card', { max: 10, windowMs: 60000 });
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
    return json({ error: 'Pagamentos no cartão desativados. Use o PIX do administrador.' }, 410);
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

  /* Reaproveita um checkout ainda válido para não criar duas cobranças. */
  const pending = Object.values(payments)
    .filter((row) => row.playerId === playerId && row.month === due.month && row.year === due.year &&
      row.status === 'pending' && row.method === 'card' && row.checkoutUrl &&
      Date.parse(row.expiresAt) > nowMs)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (pending) {
    return json({
      ok: true,
      status: 'pending',
      message: 'Pagamento no cartão já iniciado. Continue de onde parou.',
      month: due.month,
      year: due.year,
      payment: publicMonthlyPayment(pending)
    });
  }

  Object.values(payments)
    .filter((row) => row.playerId === playerId && row.month === due.month && row.year === due.year &&
      row.status === 'pending' && row.method === 'card')
    .forEach((row) => {
      row.status = 'expired';
      row.history = autoHistory(row, 'checkout_expirado', now).history;
    });

  const token = await mpTokenFor(String(record.ownerKey || ''));
  if (!token) return json({ error: 'A conta Mercado Pago do administrador não está conectada.' }, 503);

  const net = Math.round(Number(due.amount) * 100) / 100;
  const gross = cardGross(net);
  const fee = Math.round((gross - net) * 100) / 100;
  const paymentId = newPaymentId();
  const expiresAt = new Date(nowMs + CHECKOUT_MS).toISOString();
  const externalReference = 'MENSALIDADE-CARD|' + v + '|' + paymentId;
  const label = String(due.month).padStart(2, '0') + '/' + due.year;
  const back = siteUrl(req) + '/jogador.html?v=' + encodeURIComponent(v) + '&p=' + encodeURIComponent(p);

  const result = await mpFetch('/checkout/preferences', {
    token,
    method: 'POST',
    body: {
      items: [{
        id: 'MENSALIDADE-' + paymentId,
        title: 'Mensalidade Racha do Loló — ' + label,
        description: 'Mensalidade do racha. Valor já inclui a taxa do cartão.',
        quantity: 1,
        currency_id: 'BRL',
        unit_price: gross
      }],
      external_reference: externalReference,
      notification_url: siteUrl(req) + '/.netlify/functions/mp-webhook?cliente=' + encodeURIComponent(String(record.ownerKey || '')),
      back_urls: {
        success: back + '&status=ok',
        pending: back + '&status=pending',
        failure: back + '&status=fail'
      },
      auto_return: 'approved',
      binary_mode: true,
      payment_methods: {
        installments: 1,
        excluded_payment_types: [
          { id: 'ticket' }, { id: 'atm' }, { id: 'bank_transfer' },
          { id: 'debit_card' }, { id: 'account_money' }, { id: 'digital_currency' }
        ]
      },
      payer: { email: payerEmail(v, playerId) }
    }
  });

  if (!result.ok || !result.data) {
    const detail = result.data?.message || 'Não foi possível iniciar o pagamento.';
    return json({ error: 'Mercado Pago: ' + detail }, 502);
  }

  const checkoutUrl = String(result.data.init_point || result.data.sandbox_init_point || '');
  if (!/^https:\/\//.test(checkoutUrl)) {
    return json({ error: 'O Mercado Pago não devolveu o link de pagamento. Tente novamente.' }, 502);
  }

  const row = autoHistory({
    paymentId,
    playerId,
    month: due.month,
    year: due.year,
    amount: net,
    grossAmount: gross,
    feeAmount: fee,
    method: 'card',
    status: 'pending',
    externalReference,
    mpPaymentId: '',
    preferenceId: String(result.data.id || ''),
    checkoutUrl: checkoutUrl.slice(0, 600),
    createdAt: now,
    expiresAt,
    paidAt: '',
    refundReason: ''
  }, 'checkout_cartao_gerado:' + cardFeeRate().toFixed(4), now);
  payments[paymentId] = row;

  await store.setJSON(v, {
    ...record,
    monthlyPayments: payments,
    updatedAt: now
  }, { metadata: { owner: 'license' } });

  return json({
    ok: true,
    status: 'pending',
    message: 'Abra o pagamento no Mercado Pago e pague no cartão.',
    month: due.month,
    year: due.year,
    amount: net,
    grossAmount: gross,
    feeAmount: fee,
    payment: publicMonthlyPayment(row)
  });
};
