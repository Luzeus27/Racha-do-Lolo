/* Confirmação manual do administrador: marca presença e/ou pagamento no link
   compartilhado sem depender do PIX. Toda ação fica registrada no registro
   privado do link para consulta depois. */
import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import {
  json, licenses, cleanDevice, deviceAllowed, normalizeStatus, validUntil,
  setCorsOrigin, rateLimit, viewUnavailable
} from './_shared.mjs';
import {
  VIEW_TOKEN, cleanWaitlist, copyDailyPayments, copyMonthlyPayments,
  copyReservations, copyResponses, copyWaitlist, gameById, hasSlot, isObject,
  playerRole, readJson, text, unpaidMonths
} from './_daily.mjs';

function cleanKey(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function addHistory(row, event, at) {
  row.history = [...(Array.isArray(row.history) ? row.history : []), { at, event }].slice(-12);
  return row;
}

/* Encerra cobranças pendentes (Pix ou cartão) para não pagar duas vezes após a baixa manual. */
function closePending(rows, match, at) {
  Object.values(rows)
    .filter((row) => row.status === 'pending' && match(row))
    .forEach((row) => {
      row.status = 'manual';
      row.refundReason = 'baixa_manual_admin';
      addHistory(row, 'cobranca_encerrada_pelo_admin', at);
    });
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const limit = await rateLimit(req, 'admin-confirm', { max: 20, windowMs: 60000 });
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
  const playerId = text(body.playerId, 60);
  const gameId = text(body.gameId, 60);
  const presence = body.presence === true;
  const payment = body.payment === true;

  if (!/^[A-Z0-9-]{8,40}$/.test(key) || !device || !VIEW_TOKEN.test(token)) {
    return json({ error: 'Dados inválidos.' }, 400);
  }
  if (!playerId) return json({ error: 'Escolha o jogador.' }, 400);
  if (!presence && !payment) return json({ error: 'Marque a presença ou o pagamento.' }, 400);
  if (presence && !gameId) return json({ error: 'Escolha o jogo para confirmar a presença.' }, 400);

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
  const unavailable = viewUnavailable(view);
  if (unavailable) return json({ error: unavailable, expired: true }, 410);

  const tokens = isObject(view.playerTokens) ? view.playerTokens : {};
  if (!Object.prototype.hasOwnProperty.call(tokens, playerId)) {
    return json({ error: 'Jogador não encontrado neste link.' }, 404);
  }
  if (gameId && !gameById(view, gameId)) {
    return json({ error: 'Jogo não encontrado neste link.' }, 404);
  }

  const role = playerRole(view, playerId);
  if (presence && gameId && !hasSlot(view, gameId, playerId)) {
    return json({ error: 'Não há vaga livre neste jogo. Use a fila de espera.' }, 409);
  }
  const responses = copyResponses(view.responses);
  const waitlist = copyWaitlist(view.waitlist);
  const reservations = copyReservations(view.reservations);
  const dailyPayments = copyDailyPayments(view.dailyPayments);
  const monthlyPayments = copyMonthlyPayments(view.monthlyPayments);
  const now = new Date().toISOString();
  const acts = [];

  if (presence) {
    if (!isObject(responses[gameId])) responses[gameId] = Object.create(null);
    responses[gameId][playerId] = 'yes';
    waitlist[gameId] = (waitlist[gameId] || []).filter((id) => id !== playerId);
    reservations[gameId] = (reservations[gameId] || []).filter((r) => r.playerId !== playerId);
    if (role === 'daily' && gameId) {
      closePending(dailyPayments, (row) => row.playerId === playerId && row.gameId === gameId, now);
      reservations[gameId] = (reservations[gameId] || []).filter((r) => r.playerId !== playerId);
    }
    acts.push('presenca');
  }

  if (payment && role === 'monthly') {
    const due = unpaidMonths(view, playerId)[0];
    if (due) {
      const paymentId = 'MS-' + randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
      monthlyPayments[paymentId] = {
        paymentId,
        playerId,
        month: due.month,
        year: due.year,
        amount: due.amount,
        status: 'confirmed',
        externalReference: 'MANUAL-MENSALIDADE|' + token,
        mpPaymentId: '',
        qrCode: '',
        qrBase64: '',
        createdAt: now,
        expiresAt: '',
        paidAt: now,
        refundReason: 'baixa_manual_admin',
        history: [{ at: now, event: 'confirmado_pelo_admin' }]
      };
      closePending(monthlyPayments, (row) => row.playerId === playerId &&
        row.month === due.month && row.year === due.year, now);
      acts.push('mensalidade ' + String(due.month).padStart(2, '0') + '/' + due.year);
    } else {
      acts.push('mensalidade_ja_em_dia');
    }
  }

  if (payment && role === 'daily') {
    if (!gameId) return json({ error: 'Escolha o jogo para marcar a diária.' }, 400);
    const amount = Number(view.snapshot?.settings?.dayFee);
    if (!Number.isFinite(amount) || amount <= 0) {
      return json({ error: 'Valor da diária não configurado.' }, 503);
    }
    const paymentId = 'DP-' + randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
    dailyPayments[paymentId] = {
      paymentId,
      gameId,
      playerId,
      amount,
      status: 'confirmed',
      externalReference: 'MANUAL-DIARIA|' + token,
      mpPaymentId: '',
      qrCode: '',
      qrBase64: '',
      createdAt: now,
      expiresAt: '',
      paidAt: now,
      usedCredit: false,
      refundReason: 'baixa_manual_admin',
      history: [{ at: now, event: 'confirmado_pelo_admin' }]
    };
    closePending(dailyPayments, (row) => row.playerId === playerId && row.gameId === gameId, now);
    reservations[gameId] = (reservations[gameId] || []).filter((r) => r.playerId !== playerId);
    acts.push('diaria');
  }

  const log = Array.isArray(view.manualLog) ? view.manualLog.slice(-29) : [];
  log.push({ at: now, licenseKey: key, playerId, gameId: gameId || '', acts });

  await store.setJSON(token, {
    ...view,
    responses,
    waitlist: cleanWaitlist(responses, waitlist),
    reservations,
    dailyPayments,
    monthlyPayments,
    manualLog: log,
    updatedAt: now
  }, { metadata: { owner: 'license' } });

  return json({
    ok: true,
    acts,
    message: 'Confirmação manual aplicada. O jogador verá a atualização em instantes.'
  });
};
