/* Resposta do jogador a um jogo do link compartilhado. O token VP é enviado
   apenas no link individual; aqui ele é trocado pelo id do jogador. */
import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { json, paymentModeFor, setCorsOrigin, rateLimit, viewUnavailable } from './_shared.mjs';
import {
  activeReservations, copyCredits, copyDailyPayments, copyMonthlyPayments,
  copyReservations, playerRole, unpaidMonths, gameById
} from './_daily.mjs';

const MAX_BODY = 16 * 1024;
const VIEW_TOKEN = /^VW-[A-F0-9]{16}$/;
const PLAYER_TOKEN = /^VP-[A-F0-9]{16}$/;
const MAX_GAMES = 500;
const MAX_PLAYERS = 200;

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function dict() {
  return Object.create(null);
}

function text(value, max = 60) {
  return String(value ?? '').slice(0, max);
}

async function readJson(req) {
  const header = req.headers && typeof req.headers.get === 'function' ? req.headers.get('content-length') : null;
  const declared = Number(header);
  if (Number.isFinite(declared) && declared > MAX_BODY) return { body: {}, tooLarge: true };
  let raw = '';
  try { raw = await req.text(); } catch (e) { return { body: {}, tooLarge: false }; }
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY) return { body: {}, tooLarge: true };
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return { body: isObject(parsed) ? parsed : {}, tooLarge: false };
  } catch (e) { return { body: {}, tooLarge: false }; }
}

function confirmedIn(record, gameId, playerId) {
  const responses = isObject(record?.responses) ? record.responses : {};
  const answers = isObject(responses[gameId]) ? responses[gameId] : {};
  return answers[playerId] === 'yes';
}

/* Avisos para o administrador. `pending` = Básico (ele dá a baixa);
   `done` = PRO ADM (o check-in já foi liberado pelo jogador). */
function newNotice(entry) {
  return {
    id: 'NT-' + randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase(),
    at: new Date().toISOString(),
    ...entry
  };
}

function saveNotice(record, notice) {
  const list = Array.isArray(record.paymentNotices) ? record.paymentNotices.slice(-29) : [];
  list.push(notice);
  return { ...record, paymentNotices: list };
}

function findDue(list, month, year) {
  const rows = Array.isArray(list) ? list : [];
  const wantedMonth = Number(month);
  const wantedYear = Number(year);
  if (Number.isFinite(wantedMonth) && Number.isFinite(wantedYear) && wantedMonth > 0 && wantedYear > 0) {
    const found = rows.find((row) => Number(row.month) === wantedMonth && Number(row.year) === wantedYear);
    if (found) return found;
  }
  return rows[0] || null;
}

function findPlayerId(playerTokens, playerToken) {
  const tokens = isObject(playerTokens) ? playerTokens : {};
  for (const [id, value] of Object.entries(tokens)) {
    if (String(value) === playerToken) return text(id, 60);
  }
  return '';
}

function copyResponses(raw) {
  const out = dict();
  const src = isObject(raw) ? raw : {};
  Object.keys(src).slice(0, MAX_GAMES).forEach((gameKey) => {
    const gameId = text(gameKey, 60);
    if (!gameId) return;
    const answers = isObject(src[gameKey]) ? src[gameKey] : {};
    const clean = dict();
    Object.keys(answers).slice(0, MAX_PLAYERS).forEach((playerKey) => {
      const playerId = text(playerKey, 60);
      const status = String(answers[playerKey]);
      if (playerId && (status === 'yes' || status === 'no')) clean[playerId] = status;
    });
    out[gameId] = clean;
  });
  return out;
}

function copyWaitlist(raw) {
  const out = dict();
  const src = isObject(raw) ? raw : {};
  Object.keys(src).slice(0, MAX_GAMES).forEach((gameKey) => {
    const gameId = text(gameKey, 60);
    if (!gameId) return;
    const seen = new Set();
    out[gameId] = (Array.isArray(src[gameKey]) ? src[gameKey] : []).slice(0, MAX_PLAYERS)
      .map((v) => text(v, 60))
      .filter((id) => {
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
  });
  return out;
}

/* Quem confirmou sai da fila; ninguém fica nas duas listas ao mesmo tempo. */
function cleanWaitlist(responses, waitlist) {
  const out = dict();
  Object.entries(waitlist).slice(0, MAX_GAMES).forEach(([gameId, list]) => {
    if (!gameId) return;
    const answers = isObject(responses[gameId]) ? responses[gameId] : {};
    const kept = [];
    (Array.isArray(list) ? list : []).slice(0, MAX_PLAYERS).forEach((id) => {
      if (!id || answers[id] === 'yes' || kept.includes(id)) return;
      kept.push(id);
    });
    out[gameId] = kept;
  });
  return out;
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const limit = await rateLimit(req, 'view-respond', { max: 30, windowMs: 60000 });
  if (!limit.ok) {
    return json({ error: 'Muitas respostas em pouco tempo. Aguarde um minuto.' }, 429, {
      'Retry-After': String(limit.retryAfter)
    });
  }

  const { body, tooLarge } = await readJson(req);
  if (tooLarge) return json({ error: 'Requisição muito grande.' }, 413);

  const v = String(body.v || '').trim().toUpperCase();
  const p = String(body.p || '').trim().toUpperCase();
  const gameId = text(body.gameId, 60);
  const declared = String(body.response || '').trim().toLowerCase();
  /* Compatibilidade com celulares que ainda têm o botão antigo "Já paguei":
     ele vira apenas aviso ao administrador, nunca uma baixa de pagamento. */
  const response = declared === 'paid' ? 'notice' : declared;

  if (!VIEW_TOKEN.test(v) || !PLAYER_TOKEN.test(p)) return json({ error: 'Link inválido.' }, 400);
  if (!['yes', 'no', 'paid', 'notice'].includes(declared)) return json({ error: 'Resposta inválida.' }, 400);

  const store = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });
  const record = await store.get(v, { type: 'json', consistency: 'strong' });
  if (!record) return json({ error: 'Link inválido ou removido.' }, 404);
  const unavailable = viewUnavailable(record);
  if (unavailable) return json({ error: unavailable, expired: true }, 410);
  if (gameId && !gameById(record, gameId)) return json({ error: 'Jogo não identificado.' }, 404);

  const playerId = findPlayerId(record.playerTokens, p);
  if (!playerId) return json({ error: 'Link de jogador inválido.' }, 403);

  const role = playerRole(record, playerId);
  const mpMode = (await paymentModeFor(record)) === 'mp';
  /* Nenhuma resposta do jogador pode baixar pagamento: no Mercado Pago quem
     decide é o webhook; no PIX manual quem dá a baixa é o administrador. */
  if (response === 'notice' && role === 'daily' && !gameId) {
    return json({ error: 'Jogo não identificado.' }, 400);
  }

  /* O "Vou jogar" só confirma presença. Se houver mensalidade em aberto, o
     jogador recebe o PIX/link e avisa; a baixa continua com o administrador. */
  if (role === 'monthly' && response !== 'no') {
    const unpaid = unpaidMonths(record, playerId);
    const due = unpaid.length ? findDue(unpaid, body.month, body.year) : null;
    if (due) {
      if (response === 'notice') {
        const notice = newNotice({
          playerId, gameId, kind: 'monthly', month: due.month, year: due.year,
          amount: due.amount, status: 'pending'
        });
        await store.setJSON(v, saveNotice(record, notice), { metadata: { owner: 'license' } });
        return json({
          ok: true,
          status: 'notice',
          message: 'Aviso enviado ao administrador. Ele dará a baixa da sua mensalidade.'
        });
      }
      return json({
        ok: true,
        status: 'manual',
        month: due.month,
        year: due.year,
        amount: due.amount,
        message: mpMode
          ? 'Pague pelo Mercado Pago (ou pelo PIX do administrador) e toque em “Avisar que paguei”.'
          : 'Pague pelo PIX do administrador e toque em “Avisar que paguei”.'
      });
    }
  }

  if (response === 'notice') {
    const notice = newNotice({
      playerId, gameId, kind: role === 'daily' ? 'daily' : 'monthly',
      month: 0, year: 0, amount: 0, status: 'pending'
    });
    await store.setJSON(v, saveNotice(record, notice), { metadata: { owner: 'license' } });
    return json({ ok: true, status: 'notice', message: 'Aviso enviado ao administrador.' });
  }

  /* Diarista não confirma só apertando o botão: paga a diária antes.
     Crédito de jogo cancelado vale nos dois modos e só é consumido se a vaga
     for realmente garantida. No Mercado Pago a presença vem do webhook. */
  const dailyEnabled = record.snapshot?.settings?.dailyPaymentEnabled !== false;
  let dailyCredit = null;
  let dailyManual = false;
  if (dailyEnabled && response === 'yes' && role === 'daily') {
    const amount = Number(record.snapshot?.settings?.dayFee);
    const credits = copyCredits(record.dailyCredits);
    const alreadyPaid = Object.values(copyDailyPayments(record.dailyPayments))
      .some((row) => row.gameId === gameId && row.playerId === playerId && row.status === 'confirmed');
    const resolved = confirmedIn(record, gameId, playerId) || alreadyPaid;
    const hasCredit = Number.isFinite(amount) && amount > 0 &&
      (credits[playerId] || 0) + 0.001 >= amount;

    if (resolved) {
      /* Já resolvido: segue o fluxo normal sem cobrar de novo. */
    } else if (mpMode) {
      if (hasCredit) dailyCredit = { amount, credits };
      else return json({ ok: true, status: 'pay', message: 'Gere o PIX da diária para garantir sua vaga.' });
    } else if (hasCredit) {
      dailyCredit = { amount, credits };
    } else {
      dailyManual = true;
    }
  }

  /* Se o diarista desiste, um PIX ainda não pago deixa de ocupar a vaga. */
  let extraFields = {};
  if (dailyEnabled && response === 'no' && role === 'daily') {
    const payments = copyDailyPayments(record.dailyPayments);
    const reservations = copyReservations(record.reservations);
    const at = new Date().toISOString();
    let changed = false;
    Object.values(payments).forEach((row) => {
      if (row.gameId !== gameId || row.playerId !== playerId || row.status !== 'pending') return;
      row.status = 'cancelled';
      row.history = [...(row.history || []), { at, event: 'cancelado_pelo_jogador' }].slice(-12);
      changed = true;
    });
    reservations[gameId] = (reservations[gameId] || []).filter((r) => r.playerId !== playerId);
    if (changed) extraFields.dailyPayments = payments;
    extraFields.reservations = reservations;
  }

  const responses = copyResponses(record.responses);
  const waitlist = copyWaitlist(record.waitlist);
  if (!isObject(responses[gameId])) responses[gameId] = dict();
  const answers = responses[gameId];

  const confirmedBefore = Object.entries(answers).filter(([, status]) => status === 'yes').map(([id]) => id);
  const wasConfirmed = answers[playerId] === 'yes';
  const rawMax = Number(record.snapshot?.settings?.maxPlayers);
  const maxPlayers = Number.isFinite(rawMax) && rawMax > 0 ? Math.floor(rawMax) : 0;
  const taken = new Set(confirmedBefore.filter((id) => id !== playerId));
  (activeReservations(record)[gameId] || []).forEach((row) => {
    if (row.playerId && row.playerId !== playerId) taken.add(row.playerId);
  });

  let status;
  if (response === 'yes') {
    if (!gameId) {
      status = 'yes';
    } else if (maxPlayers > 0 && taken.size >= maxPlayers && !wasConfirmed) {
      const queue = Array.isArray(waitlist[gameId]) ? waitlist[gameId].slice(0, MAX_PLAYERS) : [];
      if (!queue.includes(playerId)) queue.push(playerId);
      waitlist[gameId] = queue.slice(0, MAX_PLAYERS);
      delete answers[playerId];
      status = 'wait';
    } else {
      answers[playerId] = 'yes';
      waitlist[gameId] = (waitlist[gameId] || []).filter((id) => id !== playerId);
      status = 'yes';
    }
  } else {
    answers[playerId] = 'no';
    waitlist[gameId] = (waitlist[gameId] || []).filter((id) => id !== playerId);
    status = 'no';
  }

  const cleanQueue = cleanWaitlist(responses, waitlist);
  const now = new Date().toISOString();
  let message = '';

  if (dailyCredit && status === 'yes') {
    const amount = dailyCredit.amount;
    const credits = dailyCredit.credits;
    const payments = copyDailyPayments(record.dailyPayments);
    const paymentId = 'DP-' + randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
    payments[paymentId] = {
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
      refundReason: '',
      history: [{ at: now, event: 'credito_utilizado' }]
    };
    credits[playerId] = Math.round(((credits[playerId] || 0) - amount) * 100) / 100;
    if (credits[playerId] <= 0) delete credits[playerId];
    extraFields.dailyPayments = payments;
    extraFields.dailyCredits = credits;
    message = 'Crédito usado. Presença confirmada!';
  } else if (dailyManual && status === 'yes') {
    /* A vaga foi reservada na fila, mas a presença só entra depois da baixa. */
    delete answers[playerId];
    status = 'manual';
    message = 'Pague a diária pelo PIX do administrador e toque em “Avisar que paguei”.';
  }

  const confirmed = Object.entries(answers).filter(([, value]) => value === 'yes').map(([id]) => id);
  await store.setJSON(v, { ...record, ...extraFields, responses, waitlist: cleanQueue, updatedAt: now }, { metadata: { owner: 'license' } });

  return json({
    ok: true,
    status,
    confirmed,
    waitlist: cleanQueue[gameId] || [],
    ...(message ? { message } : {})
  });
};
