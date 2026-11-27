/* Recebe as notificações do Mercado Pago, atualiza a licença no Netlify Blobs
   e as cobranças dos jogadores quando o administrador escolheu esse modo. */
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { cleanLicenseKey, json, licenses, mpFetch, mpTokenFor, normalizeStatus, paymentModeFor, setCorsOrigin, clearStaleCancel, rateLimit } from './_shared.mjs';
import {
  VIEW_TOKEN, PAYMENT_ID, MONTHLY_PAYMENT_ID, cleanWaitlist, copyAutoPayments, copyCredits, copyDailyPayments,
  copyMonthlyPayments, copyReservations, copyResponses, copyWaitlist,
  hasSlot, isObject, text, unpaidMonths
} from './_daily.mjs';

/* Cada cobrança de jogador avisa com ?cliente=RL-...; assim a consulta ao MP
   usa o token da conta daquele administrador, não o token da assinatura do app. */
async function tokenForNotification(url) {
  const cliente = cleanLicenseKey(url.searchParams.get('cliente') || '');
  const owned = cliente ? await mpTokenFor(cliente) : '';
  if (owned) return { token: owned, cliente };
  return { token: String(process.env.MP_ACCESS_TOKEN || '').trim(), cliente };
}

/* Falha na listagem do Blobs não pode virar 500 genérico nem derrubar o
   processamento das notificações seguintes. */
async function listAll(store) {
  try {
    const result = await store.list();
    return Array.isArray(result && result.blobs) ? result.blobs : [];
  } catch (e) {
    return [];
  }
}

async function findByMpPaymentId(store, mpId) {
  if (!mpId) return null;
  const blobs = await listAll(store);
  for (const blob of blobs) {
    const record = await store.get(blob.key, { type: 'json', consistency: 'strong' });
    if (!record) continue;
    const rows = [
      ...Object.values(copyDailyPayments(record.dailyPayments)),
      ...Object.values(copyMonthlyPayments(record.monthlyPayments))
    ];
    const found = rows.find((row) => row.mpPaymentId && String(row.mpPaymentId) === String(mpId));
    if (found) return { record, viewToken: blob.key };
  }
  return null;
}

function parseSignature(header) {
  const result = {};
  String(header || '').split(',').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > 0) result[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  });
  return { ts: result.ts || '', v1: result.v1 || '' };
}

function signatureIsValid(secret, { ts, v1 }, dataId, requestId) {
  if (!secret || !ts || !v1) return false;

  let tsMs = Number(ts);
  if (!Number.isFinite(tsMs)) return false;
  if (tsMs < 1e12) tsMs *= 1000;
  if (Math.abs(Date.now() - tsMs) > 10 * 60 * 1000) return false;

  const manifest = [
    dataId ? 'id:' + String(dataId).toLowerCase() + ';' : '',
    requestId ? 'request-id:' + requestId + ';' : '',
    'ts:' + ts + ';'
  ].join('');

  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  const received = String(v1).toLowerCase();
  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

/* Reentrega do mesmo aviso não pode poluir o histórico nem repetir baixas.
   O x-request-id faz parte da assinatura enviada pelo Mercado Pago. */
function eventKey(requestId) {
  return 'evt:' + createHash('sha256').update(String(requestId)).digest('hex').slice(0, 32);
}

async function claimEvent(requestId, topic, dataId) {
  if (!requestId) return true;
  const key = eventKey(requestId);
  const store = getStore({ name: 'racha-webhook-eventos', consistency: 'strong' });
  try {
    /* Gravação condicional atômica: duas entregas simultâneas não passam juntas. */
    const result = await store.setJSON(key, {
      at: new Date().toISOString(),
      requestId: String(requestId).slice(0, 120),
      topic: String(topic || '').slice(0, 40),
      dataId: String(dataId || '').slice(0, 40)
    }, { onlyIfNew: true, expireTtl: 24 * 60 * 60 });
    return !result || result.modified !== false;
  } catch (e) {
    /* Deduplicação é defesa em profundidade: se o Blobs falhar, seguimos e a
       reconfulta no Mercado Pago continua protegendo a baixa. */
    return true;
  }
}

/* Se a consulta ao Mercado Pago falhar, o evento NÃO pode ficar marcado como
   consumido: o MP precisa reentregar para não perder a baixa. */
async function releaseEvent(requestId) {
  if (!requestId) return;
  try {
    await getStore({ name: 'racha-webhook-eventos', consistency: 'strong' }).delete(eventKey(requestId));
  } catch (e) { /* a expiração automática também libera a chave */ }
}

/* O parâmetro ?cliente= só pode ser usado quando o registro pertence a ele. */
function ownerMatches(cliente, record) {
  return !cliente || String(record?.ownerKey || '') === cliente;
}

async function findBySubscription(store, subscriptionId) {
  if (!subscriptionId) return null;
  const blobs = await listAll(store);
  for (const blob of blobs) {
    const record = await store.get(blob.key, { type: 'json', consistency: 'strong' });
    if (record && String(record.subscriptionId || '') === String(subscriptionId)) return record;
  }
  return null;
}

async function save(store, key, patch, event) {
  const current = (await store.get(key, { type: 'json', consistency: 'strong' })) || {};
  const clean = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  /* Um aviso tardio não pode reativar assinatura cancelada. Quando a reassinatura
     limpou o pedido de cancelamento no mesmo patch, o status novo deve valer. */
  if (current.cancelRequestedAt && clean.cancelRequestedAt === undefined && clean.status === 'active') {
    delete clean.status;
  }
  const next = {
    ...current,
    ...clean,
    key,
    updatedAt: new Date().toISOString(),
    history: [...(current.history || []), { at: new Date().toISOString(), event }].slice(-20)
  };
  await store.setJSON(key, next);
  return next;
}

function dailyHistory(row, event, at) {
  return {
    ...row,
    history: [...(Array.isArray(row.history) ? row.history : []), { at, event }].slice(-12)
  };
}

function removeConfirmation(responses, gameId, playerId) {
  if (isObject(responses[gameId]) && responses[gameId][playerId] === 'yes') {
    delete responses[gameId][playerId];
  }
}

/* external_reference das diárias: DIARIA|VW-XXXXXXXXXXXXXXXX|DP-XXXXXXXXXXXXXXXX */
async function handleDailyPayment(payment, id, token, now, cliente = '') {
  const ref = String(payment?.external_reference || '');
  const parts = ref.split('|');
  if (parts[0] !== 'DIARIA' || parts.length < 3) return null;

  const viewToken = String(parts[1] || '').trim().toUpperCase();
  const paymentId = text(parts[2], 40);
  if (!VIEW_TOKEN.test(viewToken) || !PAYMENT_ID.test(paymentId)) return { ignored: 'referência inválida' };

  const store = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });
  const record = await store.get(viewToken, { type: 'json', consistency: 'strong' });
  if (!record) return { ignored: 'link não encontrado' };
  if (!ownerMatches(cliente, record)) return { ignored: 'cliente divergente' };
  if (await paymentModeFor(record) !== 'mp') return { ignored: 'pagamento de jogador desativado' };

  const payments = copyDailyPayments(record.dailyPayments);
  const entry = payments[paymentId];
  if (!entry) return { ignored: 'pagamento de diária não encontrado' };
  const mpId = String(id || payment.id || '');
  if (entry.mpPaymentId && entry.mpPaymentId !== mpId) return { ignored: 'id do pagamento divergente' };

  const status = String(payment.status || '').toLowerCase();
  const responses = copyResponses(record.responses);
  const waitlist = copyWaitlist(record.waitlist);
  const reservations = copyReservations(record.reservations);
  const credits = copyCredits(record.dailyCredits);
  reservations[entry.gameId] = (reservations[entry.gameId] || []).filter((r) => r.paymentId !== paymentId);

  const paid = Number(payment.transaction_amount);
  const mismatch = Number.isFinite(paid) && Math.abs(paid - Number(entry.amount)) > 0.01;

  if (status === 'approved' && !mismatch) {
    if (['cancelled', 'refunded', 'credited', 'manual', 'expired'].includes(entry.status)) {
      /* Pagamento aprovado depois que o administrador cancelou o jogo:
         devolve o dinheiro em vez de confirmar uma vaga cancelada. */
      const refund = await mpFetch('/v1/payments/' + encodeURIComponent(mpId) + '/refund', {
        token, method: 'POST', body: { reason: 'other' }
      });
      entry.status = refund.ok ? 'refunded' : 'manual';
      entry.refundReason = 'jogo_cancelado';
      removeConfirmation(responses, entry.gameId, entry.playerId);
    } else if (hasSlot(record, entry.gameId, entry.playerId, Date.now())) {
      entry.status = 'confirmed';
      entry.paidAt = payment.date_approved || payment.date_created || now;
      entry.refundReason = '';
      if (!isObject(responses[entry.gameId])) responses[entry.gameId] = Object.create(null);
      responses[entry.gameId][entry.playerId] = 'yes';
      waitlist[entry.gameId] = (waitlist[entry.gameId] || []).filter((pid) => pid !== entry.playerId);
    } else {
      const refund = await mpFetch('/v1/payments/' + encodeURIComponent(mpId) + '/refund', {
        token, method: 'POST', body: { reason: 'other' }
      });
      entry.status = refund.ok ? 'refunded' : 'manual';
      entry.refundReason = 'sem_vaga';
      removeConfirmation(responses, entry.gameId, entry.playerId);
    }
  } else if (status === 'refunded' || status === 'chargeback') {
    /* Se o admin tinha dado crédito e o MP estornou depois, o crédito precisa
       ser descontado: não pode sobrar crédito e dinheiro devolvido ao mesmo tempo. */
    const hadCredit = entry.creditReversed !== true && entry.refundReason === 'credito';
    entry.status = 'refunded';
    entry.refundReason = status;
    if (hadCredit) {
      const available = Math.max(0, Number(credits[entry.playerId] || 0) - Number(entry.amount || 0));
      const remaining = Math.round(available * 100) / 100;
      if (remaining > 0) credits[entry.playerId] = remaining;
      else delete credits[entry.playerId];
      entry.creditReversed = true;
    }
    removeConfirmation(responses, entry.gameId, entry.playerId);
  } else if (['rejected', 'cancelled', 'expired'].includes(status)) {
    entry.status = status === 'rejected' ? 'failed' : status;
    removeConfirmation(responses, entry.gameId, entry.playerId);
  } else if (mismatch) {
    entry.status = 'manual';
    entry.refundReason = 'valor_divergente';
  }

  payments[paymentId] = dailyHistory(entry, 'webhook:' + status, now);
  await store.setJSON(viewToken, {
    ...record,
    responses,
    waitlist: cleanWaitlist(responses, waitlist),
    dailyPayments: payments,
    dailyCredits: credits,
    reservations,
    updatedAt: now
  }, { metadata: { owner: 'license' } });

  return { viewToken, status: entry.status };
}

/* external_reference: MENSALIDADE|VW|MS (Pix) ou MENSALIDADE-CARD|VW|MS (cartão) */
async function handleMonthlyPayment(payment, id, token, now, cliente = '') {
  const ref = String(payment?.external_reference || '');
  const parts = ref.split('|');
  if ((parts[0] !== 'MENSALIDADE' && parts[0] !== 'MENSALIDADE-CARD') || parts.length < 3) return null;

  const viewToken = String(parts[1] || '').trim().toUpperCase();
  const paymentId = text(parts[2], 40);
  if (!VIEW_TOKEN.test(viewToken) || !MONTHLY_PAYMENT_ID.test(paymentId)) return { ignored: 'referência inválida' };

  const store = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });
  const record = await store.get(viewToken, { type: 'json', consistency: 'strong' });
  if (!record) return { ignored: 'link não encontrado' };
  if (!ownerMatches(cliente, record)) return { ignored: 'cliente divergente' };
  if (await paymentModeFor(record) !== 'mp') return { ignored: 'pagamento de jogador desativado' };

  const payments = copyMonthlyPayments(record.monthlyPayments);
  const entry = payments[paymentId];
  if (!entry) return { ignored: 'pagamento de mensalidade não encontrado' };
  const mpId = String(id || payment.id || '');
  if (entry.mpPaymentId && entry.mpPaymentId !== mpId) return { ignored: 'id do pagamento divergente' };

  const status = String(payment.status || '').toLowerCase();
  const paid = Number(payment.transaction_amount);
  /* No cartão o valor cobrado é o bruto (líquido + taxa); no Pix é o líquido. */
  const expected = Number(entry.grossAmount) > 0 ? Number(entry.grossAmount) : Number(entry.amount);
  const mismatch = Number.isFinite(paid) && Math.abs(paid - expected) > 0.01;

  if (status === 'approved' && !mismatch) {
    /* Se o código já foi encerrado, devolve em vez de dar baixa em dívida antiga. */
    if (['cancelled', 'refunded', 'credited', 'manual', 'expired'].includes(entry.status)) {
      const refund = await mpFetch('/v1/payments/' + encodeURIComponent(mpId) + '/refund', {
        token, method: 'POST', body: { reason: 'other' }
      });
      entry.status = refund.ok ? 'refunded' : 'manual';
      entry.refundReason = 'cobranca_encerrada';
    } else {
      entry.status = 'confirmed';
      entry.paidAt = payment.date_approved || payment.date_created || now;
      entry.refundReason = '';
    }
  } else if (status === 'refunded' || status === 'chargeback') {
    entry.status = 'refunded';
    entry.refundReason = status;
  } else if (['rejected', 'cancelled', 'expired'].includes(status)) {
    entry.status = status === 'rejected' ? 'failed' : status;
  } else if (mismatch) {
    entry.status = 'manual';
    entry.refundReason = 'valor_divergente';
  }

  payments[paymentId] = dailyHistory(entry, 'webhook:' + status, now);
  await store.setJSON(viewToken, {
    ...record,
    monthlyPayments: payments,
    updatedAt: now
  }, { metadata: { owner: 'license' } });

  return { viewToken, status: entry.status, month: entry.month, year: entry.year };
}

/* external_reference da cobrança automática: MENSALIDADE-AUTO|VW|ID_DO_JOGADOR */
async function handleAutoPreapproval(sub, now, cliente = '') {
  const ref = String(sub?.external_reference || '');
  const parts = ref.split('|');
  if (parts[0] !== 'MENSALIDADE-AUTO' || parts.length < 3) return null;

  const viewToken = String(parts[1] || '').trim().toUpperCase();
  const playerId = text(parts[2], 60);
  if (!VIEW_TOKEN.test(viewToken) || !playerId) return { ignored: 'referência inválida' };

  const store = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });
  const record = await store.get(viewToken, { type: 'json', consistency: 'strong' });
  if (!record) return { ignored: 'link não encontrado' };
  if (!ownerMatches(cliente, record)) return { ignored: 'cliente divergente' };
  if (await paymentModeFor(record) !== 'mp') return { ignored: 'pagamento de jogador desativado' };

  const autos = copyAutoPayments(record.autoPayments);
  const row = autos[playerId];
  if (!row || row.preapprovalId !== String(sub.id || '')) return { ignored: 'assinatura não vinculada' };

  const status = normalizeStatus(sub.status);
  if (status === 'active') {
    row.status = 'active';
    row.activatedAt = row.activatedAt || now;
    row.cancelledAt = '';
  } else if (status === 'inactive') {
    row.status = 'cancelled';
    row.cancelledAt = row.cancelledAt || now;
  }
  row.history = [...(row.history || []), { at: now, event: 'preapproval:' + String(sub.status || '') }].slice(-12);
  autos[playerId] = row;

  await store.setJSON(viewToken, {
    ...record,
    autoPayments: autos,
    updatedAt: now
  }, { metadata: { owner: 'license' } });

  return { viewToken, auto: row.status };
}

async function findAutoBySubscription(viewStore, subscriptionId) {
  if (!subscriptionId) return null;
  const blobs = await listAll(viewStore);
  for (const blob of blobs) {
    const record = await viewStore.get(blob.key, { type: 'json', consistency: 'strong' });
    if (!record) continue;
    const autos = copyAutoPayments(record.autoPayments);
    const row = Object.values(autos).find((r) => r.preapprovalId === String(subscriptionId));
    if (row) return { record, viewToken: blob.key, row, autos };
  }
  return null;
}

/* Cada cobrança mensal aprovada baixa a pendência mais antiga do jogador. */
async function handleAutoCharge(charge, id, token, now, cliente = '') {
  const subId = String(charge?.preapproval_id || charge?.preapproval?.id || '');
  const viewStore = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });
  const found = await findAutoBySubscription(viewStore, subId);
  if (!found) return null;

  const { record, viewToken, row, autos } = found;
  if (!ownerMatches(cliente, record)) return null;
  if (await paymentModeFor(record) !== 'mp') return null;
  const status = String(charge.status || '').toLowerCase();
  const mpId = String(charge.payment_id || charge.id || id || '');
  row.lastChargeAt = charge.date_created || now;
  row.lastChargeStatus = status;
  row.history = [...(row.history || []), { at: now, event: 'cobranca:' + status }].slice(-12);

  const payments = copyMonthlyPayments(record.monthlyPayments);
  const already = Object.values(payments).some((p) => p.mpPaymentId && p.mpPaymentId === mpId);

  if (status === 'approved' && !already) {
    const unpaid = unpaidMonths(record, row.playerId);
    const paid = Number(charge.transaction_amount);
    const expected = Number(row.grossAmount);
    const mismatch = Number.isFinite(paid) && expected > 0 && Math.abs(paid - expected) > 0.01;
    if (mismatch) {
      row.history = [...row.history, { at: now, event: 'valor_divergente' }].slice(-12);
    } else if (unpaid.length) {
      const due = unpaid[0];
      const paymentId = 'MS-' + randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
      payments[paymentId] = {
        paymentId,
        playerId: row.playerId,
        month: due.month,
        year: due.year,
        amount: row.netAmount || due.amount,
        grossAmount: paid,
        feeAmount: Math.round((paid - (row.netAmount || due.amount)) * 100) / 100,
        method: 'auto',
        status: 'confirmed',
        externalReference: row.externalReference,
        mpPaymentId: mpId,
        preferenceId: '',
        checkoutUrl: '',
        qrCode: '',
        qrBase64: '',
        createdAt: now,
        expiresAt: '',
        paidAt: charge.date_created || now,
        refundReason: '',
        history: [{ at: now, event: 'cobranca_automatica_aprovada' }]
      };
      row.history = [...row.history, { at: now, event: 'baixa:' + due.month + '/' + due.year }].slice(-12);
    } else {
      /* Já pagou tudo: devolve em vez de cobrar uma dívida que não existe. */
      const refund = await mpFetch('/v1/payments/' + encodeURIComponent(mpId) + '/refund', {
        token, method: 'POST', body: { reason: 'other' }
      });
      row.history = [...row.history, {
        at: now, event: refund.ok ? 'estornado_sem_divida' : 'sem_divida_estorno_pendente'
      }].slice(-12);
    }
  }

  autos[row.playerId] = row;
  await viewStore.setJSON(viewToken, {
    ...record,
    monthlyPayments: payments,
    autoPayments: autos,
    updatedAt: now
  }, { metadata: { owner: 'license' } });

  return { viewToken, auto: row.status, status };
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  /* O Mercado Pago avisa por POST e também por GET com os dados na URL.
     Outros verbos não têm motivo para chegar a esta função. */
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ received: false, error: 'Método não permitido.' }, 405);
  }

  const url = new URL(req.url);
  const dataId = url.searchParams.get('data.id') || url.searchParams.get('data_id') || '';
  const requestId = req.headers.get('x-request-id') || '';
  const secret = process.env.MP_WEBHOOK_SECRET;
  /* Falha fechada: sem segredo configurado, nenhuma notificação é aceita. */
  if (!secret) return json({ received: false, error: 'Webhook sem segredo configurado.' }, 503);

  const signature = parseSignature(req.headers.get('x-signature'));
  if (!signatureIsValid(secret, signature, dataId, requestId)) {
    return json({ received: false, error: 'Assinatura inválida.' }, 401);
  }

  /* Nada de consulta ao Mercado Pago nem escrita no Blobs antes da assinatura:
     sem o segredo, um chamador não pode provocar renovação de token. */
  const limit = await rateLimit(req, 'webhook', { max: 300, windowMs: 60000 });
  if (!limit.ok) {
    return json({ received: false, error: 'Muitas notificações. Aguarde um instante.' }, 429, {
      'Retry-After': String(limit.retryAfter)
    });
  }

  const tokenInfo = await tokenForNotification(url);
  let token = tokenInfo.token;
  if (!token) return json({ received: false, error: 'Pagamentos não configurados.' }, 503);

  let payload = {};
  try { payload = await req.json(); } catch (e) { payload = {}; }

  const topic = String(
    url.searchParams.get('topic') ||
    url.searchParams.get('type') ||
    payload.type ||
    payload.topic ||
    ''
  ).toLowerCase();

  if (!(await claimEvent(requestId, topic, dataId))) {
    return json({ received: true, duplicate: true }, 200);
  }

  /* A assinatura do aplicativo é sempre consultada pela conta do desenvolvedor.
     O ?cliente= só seleciona conta para cobranças de jogadores. */
  if (topic === 'subscription_preapproval' || topic === 'subscription') {
    token = String(process.env.MP_ACCESS_TOKEN || '').trim();
    if (!token) return json({ received: false, error: 'Pagamentos não configurados.' }, 503);
  }

  const id = String(dataId || payload?.data?.id || '');
  if (!id) {
    await releaseEvent(requestId);
    return json({ received: true, ignored: 'sem id' }, 200);
  }

  const store = licenses();
  const viewStore = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });
  const now = new Date().toISOString();

  if (topic === 'subscription_preapproval' || topic === 'subscription') {
    let activeToken = token;
    const first = await mpFetch('/preapproval/' + encodeURIComponent(id), { token: activeToken });
    let result = first;
    let found = null;
    let owned = '';
    if (!result.ok && !tokenInfo.cliente) {
      found = await findAutoBySubscription(viewStore, id);
      if (found) {
        owned = await mpTokenFor(String(found.record.ownerKey || ''));
        if (owned) {
          activeToken = owned;
          result = await mpFetch('/preapproval/' + encodeURIComponent(id), { token: activeToken });
        }
      }
    }
    if (!result.ok || !result.data) {
      console.log('diag preapproval ' + JSON.stringify({ global: first.status, found: !!found, owned: !!owned, final: result.status, err: result.error || '' }));
      await releaseEvent(requestId);
      return json({ received: false, error: 'Não foi possível consultar a assinatura.' }, 502);
    }

    const sub = result.data;
    const ref = String(sub.external_reference || '');
    if (ref.startsWith('MENSALIDADE-AUTO|')) {
      const auto = await handleAutoPreapproval(sub, now, tokenInfo.cliente);
      return json({ received: true, ...auto }, 200);
    }
    const key = ref.trim().toUpperCase();
    if (!key) return json({ received: true, ignored: 'sem external_reference' }, 200);

    /* Reassinar depois de cancelar gera um novo período: libera o acesso. */
    const current = await store.get(key, { type: 'json', consistency: 'strong' });
    if (!ownerMatches(tokenInfo.cliente, current)) {
      return json({ received: true, ignored: 'cliente divergente' }, 200);
    }
    await save(store, key, {
      email: sub.payer_email || undefined,
      subscriptionId: String(sub.id || id),
      mpStatus: sub.status,
      status: normalizeStatus(sub.status),
      amount: sub.auto_recurring?.transaction_amount || undefined,
      nextPaymentAt: sub.next_payment_date || null,
      lastSyncAt: now,
      ...clearStaleCancel(current, sub)
    }, 'subscription:' + sub.status);

    return json({ received: true, key }, 200);
  }

  if (topic === 'subscription_authorized_payment' || topic === 'invoice') {
    let activeToken = token;
    let result = await mpFetch('/authorized_payments/' + encodeURIComponent(id), { token: activeToken });
    if (!result.ok && !tokenInfo.cliente) {
      const found = await findAutoBySubscription(viewStore, id);
      if (found) {
        const owned = await mpTokenFor(String(found.record.ownerKey || ''));
        if (owned) {
          activeToken = owned;
          result = await mpFetch('/authorized_payments/' + encodeURIComponent(id), { token: activeToken });
        }
      }
    }
    if (!result.ok || !result.data) {
      await releaseEvent(requestId);
      /* 502 pede reentrega: um 200 aqui faria o MP desistir de avisar e a
         cobrança aprovada nunca seria baixada. */
      return json({ received: false, error: 'Não foi possível consultar a cobrança.' }, 502);
    }

    const charge = result.data;
    const auto = await handleAutoCharge(charge, id, activeToken, now, tokenInfo.cliente);
    if (auto) return json({ received: true, ...auto }, 200);

    const subId = String(charge.preapproval_id || charge.preapproval?.id || '');
    const record = await findBySubscription(store, subId);
    if (!record) return json({ received: true, ignored: 'assinatura não vinculada' }, 200);
    if (!ownerMatches(tokenInfo.cliente, record)) {
      return json({ received: true, ignored: 'cliente divergente' }, 200);
    }

    await save(store, record.key, {
      lastPaymentAt: charge.date_created || now,
      lastPaymentStatus: charge.status || '',
      status: charge.status === 'approved' ? 'active' : record.status
    }, 'charge:' + (charge.status || 'unknown'));

    return json({ received: true, key: record.key }, 200);
  }

  if (topic === 'payment') {
    let activeToken = token;
    let result = await mpFetch('/v1/payments/' + encodeURIComponent(id), { token: activeToken });
    if (!result.ok && !tokenInfo.cliente) {
      const found = await findByMpPaymentId(viewStore, id);
      if (found) {
        const owned = await mpTokenFor(String(found.record.ownerKey || ''));
        if (owned) {
          activeToken = owned;
          result = await mpFetch('/v1/payments/' + encodeURIComponent(id), { token: activeToken });
        }
      }
    }
    if (!result.ok || !result.data) {
      await releaseEvent(requestId);
      return json({ received: false, error: 'Não foi possível consultar o pagamento.' }, 502);
    }

    const payment = result.data;
    const ref = String(payment.external_reference || '');
    if (ref.startsWith('DIARIA|')) {
      const daily = await handleDailyPayment(payment, id, activeToken, now, tokenInfo.cliente);
      return json({ received: true, ...daily }, 200);
    }
    if (ref.startsWith('MENSALIDADE|') || ref.startsWith('MENSALIDADE-CARD|')) {
      const monthly = await handleMonthlyPayment(payment, id, activeToken, now, tokenInfo.cliente);
      return json({ received: true, ...monthly }, 200);
    }

    const key = ref.trim().toUpperCase();
    const record = key ? await store.get(key, { type: 'json', consistency: 'strong' }) : null;
    if (!record) return json({ received: true, ignored: 'pagamento sem licença' }, 200);
    if (!ownerMatches(tokenInfo.cliente, record)) {
      return json({ received: true, ignored: 'cliente divergente' }, 200);
    }

    const status = String(payment.status || '').toLowerCase();
    /* Estorno e chargeback revogam o acesso; statuses intermediários não. */
    const revoked = status === 'refunded' || status === 'chargeback';
    const paid = Number(payment.transaction_amount);
    const expected = Number(record.amount);
    const mismatch = Number.isFinite(paid) && Number.isFinite(expected) && expected > 0 &&
      Math.abs(paid - expected) > 0.01;

    await save(store, key, {
      status: revoked ? 'inactive' : status === 'approved' ? 'active' : record.status,
      mpStatus: status || record.mpStatus,
      lastPaymentAt: payment.date_approved || payment.date_created || now,
      lastPaymentStatus: status || '',
      amountWarning: mismatch === true
    }, 'payment:' + status + (revoked ? ':revogado' : '') + (mismatch ? ':valor_divergente' : ''));

    return json({ received: true, key }, 200);
  }

  return json({ received: true, ignored: topic || 'desconhecido' }, 200);
};
