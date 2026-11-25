/* Visão individual de um jogador, liberada apenas pelo par de tokens VW + VP.
   Nunca devolve tokens de outros jogadores nem dados de contato. */
import { getStore } from '@netlify/blobs';
import { cardFeeRate, cardGross, json, paymentModeFor, setCorsOrigin, viewUnavailable } from './_shared.mjs';
import { copyAutoPayments, copyCredits, latestMonthlyPayment, latestPayment, manualPixCode, playerRole, unpaidMonths } from './_daily.mjs';

const VIEW_TOKEN = /^VW-[A-F0-9]{16}$/;
const PLAYER_TOKEN = /^VP-[A-F0-9]{16}$/;

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max = 120) {
  return String(value ?? '').slice(0, max);
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function todayISO() {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = (type) => (parts.find((p) => p.type === type) || {}).value || '';
    if (get('year') && get('month') && get('day')) return `${get('year')}-${get('month')}-${get('day')}`;
  } catch (e) { /* usa a data local do servidor como fallback */ }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function findPlayerId(playerTokens, playerToken) {
  const tokens = isObject(playerTokens) ? playerTokens : {};
  for (const [id, value] of Object.entries(tokens)) {
    if (String(value) === playerToken) return text(id, 60);
  }
  return '';
}

function label(game) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(game.date || '');
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const year = String(Math.max(0, Math.floor(number(game.year)))).padStart(4, '0');
  const month = String(Math.max(1, Math.floor(number(game.month)) || 1)).padStart(2, '0');
  return `01/${month}/${year}`;
}

function copyGames(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 500).map((g) => ({
    id: text(g && g.id, 60),
    date: text(g && g.date, 20),
    month: number(g && g.month),
    year: number(g && g.year),
    done: !!(g && g.done === true),
    name: text(g && g.name, 90),
    time: text(g && g.time, 10)
  })).filter((g) => !!g.id);
}

function answersFor(raw, gameId, playerId) {
  const games = isObject(raw) ? raw : {};
  const answers = isObject(games[gameId]) ? games[gameId] : {};
  const status = String(answers[playerId] || '');
  return status === 'yes' || status === 'no' ? status : null;
}

function waitlisted(raw, gameId, playerId) {
  const games = isObject(raw) ? raw : {};
  return Array.isArray(games[gameId]) && games[gameId].slice(0, 200).includes(playerId);
}

/* Cada pendência leva junto o PIX manual do administrador (como alternativa)
   e, quando existe, a cobrança/pagamento gerado no Mercado Pago. */
function duesWithPayment(record, playerId, list) {
  return list.map((d) => {
    const row = latestMonthlyPayment(record, playerId, d.month, d.year);
    const oldCode = typeof d.pix === 'string' && d.pix.startsWith('000201') ? d.pix.slice(0, 800) : '';
    const txid = text(d.txid, 80) || 'RL' + d.year + String(d.month).padStart(2, '0') + text(playerId, 4).toUpperCase();
    return {
      month: d.month,
      year: d.year,
      amount: d.amount,
      paid: false,
      pix: manualPixCode(record.snapshot?.settings, d.amount, txid) || oldCode,
      txid,
      payment: row ? {
        status: row.status,
        amount: row.amount,
        method: row.method || '',
        grossAmount: row.grossAmount || 0,
        feeAmount: row.feeAmount || 0,
        checkoutUrl: row.checkoutUrl || '',
        qrCode: row.qrCode,
        qrBase64: row.qrBase64,
        expiresAt: row.expiresAt,
        paidAt: row.paidAt,
        paymentId: row.paymentId
      } : null
    };
  });
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'GET') return json({ error: 'Método não permitido.' }, 405);

  const params = new URL(req.url).searchParams;
  const v = String(params.get('v') || '').trim().toUpperCase();
  const p = String(params.get('p') || '').trim().toUpperCase();
  if (!VIEW_TOKEN.test(v) || !PLAYER_TOKEN.test(p)) return json({ error: 'Link inválido.' }, 400);

  const store = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });
  const record = await store.get(v, { type: 'json', consistency: 'strong' });
  if (!record) return json({ error: 'Link inválido ou removido.' }, 404);
  const unavailable = viewUnavailable(record);
  if (unavailable) return json({ error: unavailable, expired: true }, 410);

  const playerId = findPlayerId(record.playerTokens, p);
  if (!playerId) return json({ error: 'Link de jogador inválido.' }, 403);

  const snapshot = isObject(record.snapshot) ? record.snapshot : {};
  const players = Array.isArray(snapshot.players) ? snapshot.players : [];
  const mine = players.find((player) => isObject(player) && text(player.id, 60) === playerId);
  if (!mine) return json({ error: 'Jogador não encontrado neste link.' }, 403);

  const kind = playerRole(record, playerId);
  const dailyEnabled = snapshot.settings?.dailyPaymentEnabled !== false;
  const dailyAmount = number(snapshot.settings?.dayFee);
  const monthlyFee = number(snapshot.settings?.monthlyFee);
  const credit = copyCredits(record.dailyCredits)[playerId] || 0;
  const unpaid = unpaidMonths(record, playerId);
  const monthlyPending = kind === 'monthly' && unpaid.length > 0;
  const monthlyDue = monthlyPending ? unpaid[0] : null;

  const today = todayISO();
  const games = copyGames(snapshot.games);
  const upcoming = games.filter((g) => g.date && g.date >= today);
  const pool = upcoming.length ? upcoming : games;
  const nextGames = pool.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);

  const confirmations = isObject(snapshot.confirmations) ? snapshot.confirmations : {};
  /* O PIX manual continua disponível como alternativa; o Mercado Pago só
     aparece quando o administrador escolheu e vinculou a conta dele. */
  const mpMode = (await paymentModeFor(record)) === 'mp';
  const gamesOut = nextGames.map((g) => {
    let confirmed = answersFor(record.responses, g.id, playerId);
    if (confirmed === null && Array.isArray(confirmations[g.id]) &&
        confirmations[g.id].slice(0, 200).some((id) => text(id, 60) === playerId)) {
      confirmed = 'yes';
    }
    const requiresPayment = dailyEnabled && kind === 'daily';
    const row = requiresPayment ? latestPayment(record, g.id, playerId) : null;
    if (confirmed === null && row && row.status === 'confirmed') confirmed = 'yes';
    const payment = row ? {
      status: row.status,
      amount: row.amount,
      method: row.method || '',
      grossAmount: row.grossAmount || 0,
      feeAmount: row.feeAmount || 0,
      qrCode: row.qrCode,
      qrBase64: row.qrBase64,
      expiresAt: row.expiresAt,
      paidAt: row.paidAt,
      usedCredit: row.usedCredit,
      paymentId: row.paymentId
    } : null;
    return {
      id: g.id,
      date: g.date,
      confirmed,
      waitlisted: waitlisted(record.waitlist, g.id, playerId),
      requiresPayment,
      payment,
      manualPix: requiresPayment
        ? manualPixCode(record.snapshot?.settings, dailyAmount, 'DIARIA' + text(g.id, 8).toUpperCase() + text(playerId, 4).toUpperCase())
        : '',
      monthlyPending: !requiresPayment && monthlyPending,
      monthlyDue: !requiresPayment && monthlyDue
        ? { month: monthlyDue.month, year: monthlyDue.year, amount: monthlyDue.amount }
        : null
    };
  });

  const autoRow = copyAutoPayments(record.autoPayments)[playerId] || null;
  const cardNet = kind === 'monthly' ? Math.round((monthlyDue ? monthlyDue.amount : monthlyFee) * 100) / 100 : 0;
  const cardGrossAmount = cardNet > 0 ? cardGross(cardNet) : 0;
  const card = kind === 'monthly' && mpMode ? {
    feeRate: cardFeeRate(),
    net: cardNet,
    gross: cardGrossAmount,
    fee: Math.round((cardGrossAmount - cardNet) * 100) / 100
  } : null;
  const auto = autoRow && kind === 'monthly' && mpMode ? {
    status: autoRow.status,
    netAmount: autoRow.netAmount,
    grossAmount: autoRow.grossAmount,
    feeAmount: autoRow.feeAmount,
    initPoint: autoRow.initPoint,
    activatedAt: autoRow.activatedAt,
    cancelledAt: autoRow.cancelledAt,
    lastChargeAt: autoRow.lastChargeAt,
    lastChargeStatus: autoRow.lastChargeStatus
  } : null;

  const pastGames = games
    .filter((g) => g.done || (g.date && g.date < today))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8)
    .map((g) => ({
      id: g.id,
      label: label(g),
      date: g.date
    }));

  return json({
    ok: true,
    player: {
      id: playerId,
      name: text(mine.name, 90),
      position: text(mine.position, 30),
      kind,
      dailyAmount,
      monthlyFee,
      credit,
      photo: typeof mine.photo === 'string' && /^data:image\/(png|jpeg|webp);base64,/i.test(mine.photo)
        ? mine.photo.slice(0, 160000)
        : ''
    },
    games: gamesOut,
    pastGames,
    /* No modo Mercado Pago a baixa vem do webhook, nunca do clique do jogador. */
    autoCheckin: record.autoCheckin === true && !mpMode,
    paymentMode: mpMode ? 'mp' : 'manual',
    card,
    auto,
    dues: duesWithPayment(record, playerId, kind === 'monthly' ? unpaid : []),
    updatedAt: record.updatedAt || null
  });
};
