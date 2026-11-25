/* Administração das diárias pagas no link do grupo: resumo e cancelamento
   com escolha entre estorno e crédito para o próximo jogo. */
import { getStore } from '@netlify/blobs';
import {
  json, licenses, cleanDevice, deviceAllowed, normalizeStatus, validUntil,
  setCorsOrigin, rateLimit, mpFetch, mpTokenFor
} from './_shared.mjs';
import {
  VIEW_TOKEN, copyCredits, copyDailyPayments, copyMonthlyPayments, copyReservations,
  copyResponses, copyWaitlist, isObject, readJson, text
} from './_daily.mjs';

function cleanKey(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function label(game) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(game?.date || ''));
  const date = match ? `${match[3]}/${match[2]}/${match[1]}` : String(game?.date || 'sem data');
  const name = String(game?.name || '').trim();
  return name ? `${name} · ${date}` : date;
}

function logEntry(entry, event, at) {
  return {
    ...entry,
    history: [...(Array.isArray(entry.history) ? entry.history : []), { at, event }].slice(-12)
  };
}

function removeConfirmation(responses, gameId, playerId) {
  if (isObject(responses[gameId]) && responses[gameId][playerId] === 'yes') {
    delete responses[gameId][playerId];
  }
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const limit = await rateLimit(req, 'manage-daily', { max: 20, windowMs: 60000 });
  if (!limit.ok) {
    return json({ error: 'Muitas tentativas. Aguarde um minuto.' }, 429, {
      'Retry-After': String(limit.retryAfter)
    });
  }

  const { body, tooLarge } = await readJson(req);
  if (tooLarge) return json({ error: 'Requisição muito grande.' }, 413);

  const key = cleanKey(body.licenseKey);
  const device = cleanDevice(body.deviceId);
  const token = String(body.token || '').trim().toUpperCase();
  const gameId = text(body.gameId, 60);
  const action = String(body.action || 'summary').trim().toLowerCase();

  if (!/^[A-Z0-9-]{8,40}$/.test(key) || !device || !VIEW_TOKEN.test(token)) {
    return json({ error: 'Dados inválidos.' }, 400);
  }
  if (!['summary', 'cancel', 'ack-notices'].includes(action)) return json({ error: 'Ação inválida.' }, 400);
  if (action === 'cancel' && !gameId) return json({ error: 'Escolha o jogo.' }, 400);

  const license = await licenses().get(key, { type: 'json', consistency: 'strong' });
  if (!license || !deviceAllowed(license, device)) {
    return json({ error: 'Licença não encontrada ou vinculada a outro aparelho.' }, 403);
  }
  let active = normalizeStatus(license.status) === 'active' && validUntil(license.nextPaymentAt);
  if (license.cancelRequestedAt && license.nextPaymentAt) {
    const end = Date.parse(license.nextPaymentAt);
    if (Number.isFinite(end) && end <= Date.now()) active = false;
  }
  if (!active) return json({ error: 'Assinatura ativa é necessária.' }, 403);

  const store = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });
  const view = await store.get(token, { type: 'json', consistency: 'strong' });
  if (!view || view.ownerKey !== key) return json({ error: 'Link não encontrado para esta licença.' }, 404);

  const payments = copyDailyPayments(view.dailyPayments);
  const credits = copyCredits(view.dailyCredits);
  const now = new Date().toISOString();

  if (action === 'ack-notices') {
    await store.setJSON(token, {
      ...view,
      paymentNotices: [],
      updatedAt: now
    }, { metadata: { owner: 'license' } });
    return json({ ok: true, message: 'Avisos marcados como vistos.' });
  }

  if (action === 'summary') {
    const games = (Array.isArray(view.snapshot?.games) ? view.snapshot.games : [])
      .slice(0, 500)
      .map((game) => {
        const id = text(game?.id, 60);
        if (!id) return null;
        const rows = Object.values(payments).filter((row) => row.gameId === id);
        const count = (status) => rows.filter((row) => row.status === status).length;
        const paid = rows.filter((row) => row.status === 'confirmed' && !row.usedCredit);
        return {
          id,
          label: label(game),
          date: text(game?.date, 20),
          done: game?.done === true,
          paid: paid.length,
          paidAmount: Math.round(paid.reduce((sum, row) => sum + row.amount, 0) * 100) / 100,
          pending: count('pending'),
          credited: count('credited'),
          refunded: count('refunded'),
          cancelled: count('cancelled')
        };
      })
      .filter((row) => row && (row.paid || row.pending || row.credited || row.refunded || row.cancelled))
      .slice(0, 60);

    const monthlyRows = Object.values(copyMonthlyPayments(view.monthlyPayments));
    const monthlyPaid = monthlyRows.filter((row) => row.status === 'confirmed');
    const monthly = {
      paid: monthlyPaid.length,
      paidAmount: Math.round(monthlyPaid.reduce((sum, row) => sum + row.amount, 0) * 100) / 100,
      pending: monthlyRows.filter((row) => row.status === 'pending').length,
      refunded: monthlyRows.filter((row) => row.status === 'refunded').length
    };

    const names = new Map((Array.isArray(view.snapshot?.players) ? view.snapshot.players : [])
      .map((p) => [text(p?.id, 60), text(p?.name, 90)]));
    const notices = (Array.isArray(view.paymentNotices) ? view.paymentNotices.slice(-12).reverse() : [])
      .map((row) => ({
        id: text(row?.id, 40),
        at: text(row?.at, 40),
        playerId: text(row?.playerId, 60),
        playerName: names.get(text(row?.playerId, 60)) || text(row?.playerId, 60),
        gameId: text(row?.gameId, 60),
        kind: ['daily', 'monthly'].includes(row?.kind) ? row.kind : 'daily',
        month: Number(row?.month) || 0,
        year: Number(row?.year) || 0,
        amount: Number(row?.amount) || 0,
        status: row?.status === 'done' ? 'done' : 'pending'
      }));

    return json({
      ok: true,
      games,
      monthly,
      notices,
      autoCheckin: view.autoCheckin === true,
      totalCredit: Math.round(Object.values(credits).reduce((sum, value) => sum + value, 0) * 100) / 100,
      updatedAt: view.updatedAt || null
    });
  }

  const policy = String(body.policy || '').trim().toLowerCase();
  if (!['credit', 'refund'].includes(policy)) return json({ error: 'Escolha crédito ou estorno.' }, 400);
  const tokenMP = policy === 'refund' ? await mpTokenFor(String(view.ownerKey || '')) : '';
  if (policy === 'refund' && !tokenMP) return json({ error: 'Pagamentos não configurados.' }, 503);

  const responses = copyResponses(view.responses);
  const waitlist = copyWaitlist(view.waitlist);
  const reservations = copyReservations(view.reservations);
  let processed = 0;
  let failed = 0;
  let total = 0;

  const rows = Object.values(payments).filter((row) => row.gameId === gameId);
  for (const row of rows) {
    if (row.status === 'pending') {
      row.status = 'cancelled';
      row.history = logEntry(row, 'cancelado_sem_pagamento', now).history;
      continue;
    }
    if (row.status !== 'confirmed' || row.usedCredit) continue;

    if (policy === 'refund') {
      /* Pagamento marcado na mão não existe no Mercado Pago: a baixa é local. */
      if (!row.mpPaymentId) {
        row.status = 'refunded';
        row.refundReason = 'estorno_manual';
      } else {
        const refund = await mpFetch('/v1/payments/' + encodeURIComponent(row.mpPaymentId) + '/refund', {
          token: tokenMP, method: 'POST', body: { reason: 'other' }
        });
        if (!refund.ok) { failed += 1; continue; }
        row.status = 'refunded';
        row.refundReason = 'jogo_cancelado';
      }
    } else {
      const current = Number(credits[row.playerId] || 0);
      credits[row.playerId] = Math.round((current + row.amount) * 100) / 100;
      row.status = 'credited';
      row.refundReason = 'credito';
    }
    row.history = logEntry(row, 'cancelamento:' + policy, now).history;
    total += row.amount;
    processed += 1;
    removeConfirmation(responses, gameId, row.playerId);
    waitlist[gameId] = (waitlist[gameId] || []).filter((pid) => pid !== row.playerId);
  }
  reservations[gameId] = [];

  const previousCancellations = Array.isArray(view.dailyCancelLog) ? view.dailyCancelLog.slice(-19) : [];
  await store.setJSON(token, {
    ...view,
    responses,
    waitlist: Object.fromEntries(Object.entries(waitlist).filter(([, list]) => Array.isArray(list) && list.length)),
    dailyPayments: payments,
    dailyCredits: credits,
    reservations,
    dailyCancelLog: [...previousCancellations, {
      at: now, gameId, policy, processed, failed,
      amount: Math.round(total * 100) / 100, licenseKey: key
    }],
    updatedAt: now
  }, { metadata: { owner: 'license' } });

  return json({
    ok: true,
    processed,
    failed,
    amount: Math.round(total * 100) / 100,
    policy,
    message: failed
      ? `${processed} pagamento(s) resolvido(s). ${failed} não pôde(m) ser estornado(s): confira no Mercado Pago.`
      : policy === 'credit'
        ? `${processed} diária(s) viraram crédito para o próximo jogo.`
        : `${processed} diária(s) estornada(s).`
  });
};
