/* Regras compartilhadas dos pagamentos do link individual (diária e mensalidade).
   Nada aqui é enviado ao navegador: este módulo só trata o registro privado
   guardado no Netlify Blobs. */
export const VIEW_TOKEN = /^VW-[A-F0-9]{16}$/;
export const PLAYER_TOKEN = /^VP-[A-F0-9]{16}$/;
export const MAX_BODY = 16 * 1024;
export const MAX_GAMES = 500;
export const MAX_PLAYERS = 200;
export const MAX_PAYMENTS = 2000;
export const PAYMENT_ID = /^DP-[A-F0-9]{16}$/;
export const MONTHLY_PAYMENT_ID = /^MS-[A-F0-9]{16}$/;

export function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function dict() {
  return Object.create(null);
}

export function text(value, max = 60) {
  return String(value ?? '').slice(0, max);
}

/* Datas dos jogos são locais (Brasília), não UTC. Manter a conversão aqui
   evita avisos e avaliações no dia errado. */
const TZ = 'America/Sao_Paulo';
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function partsInTZ(ts) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(ts));
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return {
    year: get('year'), month: get('month'), day: get('day'),
    hour: get('hour'), minute: get('minute'), second: get('second')
  };
}

export function todayBR(nowMs = Date.now()) {
  const p = partsInTZ(nowMs);
  return [p.year, String(p.month).padStart(2, '0'), String(p.day).padStart(2, '0')].join('-');
}

export function hoursUntilLocal(date, nowMs = Date.now()) {
  const match = DATE_ONLY.exec(String(date || ''));
  if (!match) return null;
  const y = Number(match[1]), mo = Number(match[2]), d = Number(match[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const midday = Date.UTC(y, mo - 1, d, 12);
  const local = partsInTZ(midday);
  const offset = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) - midday;
  let target = Date.UTC(y, mo - 1, d) - offset;
  const check = partsInTZ(target);
  target -= Date.UTC(check.year, check.month - 1, check.day, check.hour, check.minute, check.second) - target;
  return (target - nowMs) / 3600000;
}

/* Nota só vale para jogo já realizado. Sem data confiável, não libera. */
export function gamePlayed(game, nowMs = Date.now()) {
  const date = text(game?.date, 20);
  return DATE_ONLY.test(date) && date < todayBR(nowMs);
}

export function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/* BR Code do PIX manual: a chave é a do administrador, cadastrada em
   Configurações e publicada no retrato. Não envolve Mercado Pago. */
function emv(id, value) {
  const v = String(value ?? '');
  const size = Buffer.byteLength(v, 'utf8');
  if (size > 99) return '';
  return id + String(size).padStart(2, '0') + v;
}

/* BR Code usa ASCII. A chave consiste de até 77 caracteres para o campo 26
   caber dentro dos 99 bytes permitidos pelo padrão EMV. */
function emvAscii(value, max) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '').slice(0, max);
}

function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

export function manualPixCode(settings, amount, txid) {
  const key = emvAscii(settings?.pixKey, 77).trim();
  if (!key) return '';
  const norm = (v, max) => emvAscii(v, max);
  const value = number(amount);
  const payload =
    emv('00', '01') +
    emv('26', emv('00', 'BR.GOV.BCB.PIX') + emv('01', key)) +
    emv('52', '0000') +
    emv('53', '986') +
    (value > 0 ? emv('54', value.toFixed(2)) : '') +
    emv('58', 'BR') +
    emv('59', norm(settings?.pixMerchant || 'RACHA DO LOLO', 25)) +
    emv('60', norm(settings?.pixCity || 'SAO PAULO', 15)) +
    emv('62', emv('05', text(txid || 'RL', 25))) +
    '6304';
  return payload + crc16(payload).toString(16).toUpperCase().padStart(4, '0');
}

export async function readJson(req, maxBytes = MAX_BODY) {
  const declared = Number(req?.headers?.get?.('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) return { body: {}, tooLarge: true };
  let raw = '';
  try { raw = await req.text(); } catch (e) { return { body: {}, tooLarge: false }; }
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) return { body: {}, tooLarge: true };
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return { body: isObject(parsed) ? parsed : {}, tooLarge: false };
  } catch (e) { return { body: {}, tooLarge: false }; }
}

export function findPlayerId(playerTokens, playerToken) {
  const tokens = isObject(playerTokens) ? playerTokens : {};
  for (const [id, value] of Object.entries(tokens)) {
    if (String(value) === playerToken) return text(id, 60);
  }
  return '';
}

export function copyResponses(raw) {
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

export function copyWaitlist(raw) {
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
export function cleanWaitlist(responses, waitlist) {
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

export function copyReservations(raw) {
  const out = dict();
  const src = isObject(raw) ? raw : {};
  Object.keys(src).slice(0, MAX_GAMES).forEach((gameKey) => {
    const gameId = text(gameKey, 60);
    if (!gameId) return;
    const seen = new Set();
    out[gameId] = (Array.isArray(src[gameKey]) ? src[gameKey] : []).slice(0, MAX_PLAYERS)
      .map((value) => (isObject(value) ? value : {}))
      .filter((row) => {
        const paymentId = text(row.paymentId, 40);
        if (!paymentId || seen.has(paymentId)) return false;
        seen.add(paymentId);
        return true;
      })
      .map((row) => ({
        paymentId: text(row.paymentId, 40),
        playerId: text(row.playerId, 60),
        createdAt: text(row.createdAt, 40),
        expiresAt: text(row.expiresAt, 40)
      }));
  });
  return out;
}

export function activeReservations(record, now = Date.now()) {
  const out = dict();
  const src = isObject(record?.reservations) ? record.reservations : {};
  Object.keys(src).slice(0, MAX_GAMES).forEach((gameKey) => {
    const gameId = text(gameKey, 60);
    if (!gameId) return;
    out[gameId] = (Array.isArray(src[gameKey]) ? src[gameKey] : [])
      .filter((row) => isObject(row) && row.paymentId && Date.parse(String(row.expiresAt || '')) > now)
      .map((row) => ({
        paymentId: text(row.paymentId, 40),
        playerId: text(row.playerId, 60),
        expiresAt: text(row.expiresAt, 40)
      }));
  });
  return out;
}

export function confirmedIds(record, gameId) {
  const responses = isObject(record?.responses) ? record.responses : {};
  const answers = isObject(responses[gameId]) ? responses[gameId] : {};
  return Object.keys(answers).slice(0, MAX_PLAYERS)
    .filter((id) => answers[id] === 'yes')
    .map((id) => text(id, 60));
}

/* Reservas de PIX recente também ocupam vaga: o jogador não pode abrir o
   código e, enquanto ele está válido, outro confirmar a última posição. */
export function hasSlot(record, gameId, playerId, now = Date.now()) {
  const rawMax = Number(record?.snapshot?.settings?.maxPlayers);
  const maxPlayers = Number.isFinite(rawMax) && rawMax > 0 ? Math.floor(rawMax) : 0;
  if (!maxPlayers) return true;
  const taken = new Set(confirmedIds(record, gameId));
  taken.delete(playerId);
  const reserved = activeReservations(record, now)[gameId] || [];
  reserved.forEach((row) => {
    if (row.playerId && row.playerId !== playerId && !taken.has(row.playerId)) taken.add(row.playerId);
  });
  return taken.size < maxPlayers;
}

export function copyDailyPayments(raw) {
  const out = dict();
  const src = isObject(raw) ? raw : {};
  const allowed = ['pending', 'confirmed', 'refunded', 'credited', 'cancelled', 'failed', 'expired', 'manual'];
  Object.keys(src).slice(0, MAX_PAYMENTS).forEach((key) => {
    const paymentId = text(key, 40);
    if (!paymentId) return;
    const row = isObject(src[key]) ? src[key] : {};
    const qrBase64 = typeof row.qrBase64 === 'string' && /^[A-Za-z0-9+/=]+$/.test(row.qrBase64)
      ? row.qrBase64.slice(0, 200000)
      : '';
    out[paymentId] = {
      paymentId,
      gameId: text(row.gameId, 60),
      playerId: text(row.playerId, 60),
      amount: number(row.amount),
      status: allowed.includes(row.status) ? row.status : 'pending',
      externalReference: text(row.externalReference, 120),
      mpPaymentId: text(row.mpPaymentId, 40),
      qrCode: typeof row.qrCode === 'string' ? row.qrCode.slice(0, 2000) : '',
      qrBase64,
      createdAt: text(row.createdAt, 40),
      expiresAt: text(row.expiresAt, 40),
      paidAt: text(row.paidAt, 40),
      usedCredit: row.usedCredit === true,
      refundReason: text(row.refundReason, 40),
      history: (Array.isArray(row.history) ? row.history : []).slice(-12).map((h) => ({
        at: text(h?.at, 40),
        event: text(h?.event, 60)
      }))
    };
  });
  return out;
}

export function latestPayment(record, gameId, playerId) {
  const payments = copyDailyPayments(record?.dailyPayments);
  return Object.values(payments)
    .filter((row) => row.gameId === gameId && row.playerId === playerId)
    .sort((a, b) => String(b.createdAt || b.expiresAt).localeCompare(String(a.createdAt || a.expiresAt)))[0] || null;
}

export function copyCredits(raw) {
  const out = dict();
  const src = isObject(raw) ? raw : {};
  Object.keys(src).slice(0, MAX_PLAYERS).forEach((key) => {
    const playerId = text(key, 60);
    const amount = number(src[key]);
    if (playerId && amount > 0) out[playerId] = Math.min(100000, amount);
  });
  return out;
}

export function playerRole(record, playerId) {
  const roles = isObject(record?.playerRoles) ? record.playerRoles : {};
  const role = String(roles[playerId] || '').toLowerCase();
  if (role === 'daily' || role === 'monthly') return role;
  const players = Array.isArray(record?.snapshot?.players) ? record.snapshot.players : [];
  const mine = players.find((p) => isObject(p) && text(p.id, 60) === playerId);
  return String(mine?.type || '').toLowerCase() === 'diarista' ? 'daily' : 'monthly';
}

/* Mensalidade do jogador: cargo começa no valor base e nunca fica abaixo dele. */
const ROLE_FEE_KEYS = {
  'presidente': 'feePresidente',
  'vice-presidente': 'feeVice',
  'diretor': 'feeDiretor',
  'conselheiro': 'feeConselheiro'
};

export function playerMonthlyFee(record, playerId) {
  const settings = isObject(record?.snapshot?.settings) ? record.snapshot.settings : {};
  const base = number(settings.monthlyFee);
  const players = Array.isArray(record?.snapshot?.players) ? record.snapshot.players : [];
  const mine = players.find((p) => isObject(p) && text(p.id, 60) === playerId);
  const key = ROLE_FEE_KEYS[String(mine?.type || '').toLowerCase()];
  const extra = key ? number(settings[key]) : 0;
  return Math.round(Math.max(base, extra) * 100) / 100;
}

export function gameById(record, gameId) {
  const games = Array.isArray(record?.snapshot?.games) ? record.snapshot.games : [];
  return games.find((g) => isObject(g) && g.canceled !== true && text(g.id, 60) === gameId) || null;
}

/* ---------- mensalidade paga no link individual ---------- */

export function copyMonthlyPayments(raw) {
  const out = dict();
  const src = isObject(raw) ? raw : {};
  const allowed = ['pending', 'confirmed', 'refunded', 'credited', 'cancelled', 'failed', 'expired', 'manual'];
  Object.keys(src).slice(0, MAX_PAYMENTS).forEach((key) => {
    const paymentId = text(key, 40);
    if (!paymentId) return;
    const row = isObject(src[key]) ? src[key] : {};
    const qrBase64 = typeof row.qrBase64 === 'string' && /^[A-Za-z0-9+/=]+$/.test(row.qrBase64)
      ? row.qrBase64.slice(0, 200000)
      : '';
    out[paymentId] = {
      paymentId,
      playerId: text(row.playerId, 60),
      month: Math.floor(number(row.month)),
      year: Math.floor(number(row.year)),
      amount: number(row.amount),
      status: allowed.includes(row.status) ? row.status : 'pending',
      externalReference: text(row.externalReference, 120),
      mpPaymentId: text(row.mpPaymentId, 40),
      method: ['pix', 'card', 'auto', 'manual'].includes(row.method) ? row.method : 'pix',
      grossAmount: number(row.grossAmount),
      feeAmount: number(row.feeAmount),
      preferenceId: text(row.preferenceId, 60),
      checkoutUrl: typeof row.checkoutUrl === 'string' && /^https:\/\//.test(row.checkoutUrl)
        ? row.checkoutUrl.slice(0, 600) : '',
      qrCode: typeof row.qrCode === 'string' ? row.qrCode.slice(0, 2000) : '',
      qrBase64,
      createdAt: text(row.createdAt, 40),
      expiresAt: text(row.expiresAt, 40),
      paidAt: text(row.paidAt, 40),
      refundReason: text(row.refundReason, 40),
      history: (Array.isArray(row.history) ? row.history : []).slice(-12).map((h) => ({
        at: text(h?.at, 40),
        event: text(h?.event, 60)
      }))
    };
  });
  return out;
}

/* Cobrança automática de mensalidade: uma assinatura por jogador. */
export function copyAutoPayments(raw) {
  const out = dict();
  const src = isObject(raw) ? raw : {};
  Object.keys(src).slice(0, MAX_PLAYERS).forEach((key) => {
    const playerId = text(key, 60);
    if (!playerId) return;
    const row = isObject(src[key]) ? src[key] : {};
    const status = ['pending', 'active', 'cancelled'].includes(row.status) ? row.status : 'pending';
    out[playerId] = {
      playerId,
      status,
      preapprovalId: text(row.preapprovalId, 60),
      externalReference: text(row.externalReference, 120),
      netAmount: number(row.netAmount),
      grossAmount: number(row.grossAmount),
      feeAmount: number(row.feeAmount),
      initPoint: typeof row.initPoint === 'string' && /^https:\/\//.test(row.initPoint)
        ? row.initPoint.slice(0, 600) : '',
      createdAt: text(row.createdAt, 40),
      activatedAt: text(row.activatedAt, 40),
      cancelledAt: text(row.cancelledAt, 40),
      lastChargeAt: text(row.lastChargeAt, 40),
      lastChargeStatus: text(row.lastChargeStatus, 40),
      history: (Array.isArray(row.history) ? row.history : []).slice(-12).map((h) => ({
        at: text(h?.at, 40),
        event: text(h?.event, 60)
      }))
    };
  });
  return out;
}

export function monthlyKey(playerId, month, year) {
  return text(playerId, 60) + '|' + Math.floor(number(month)) + '|' + Math.floor(number(year));
}

export function paidMonthlyKeys(record) {
  const out = new Set();
  Object.values(copyMonthlyPayments(record?.monthlyPayments)).forEach((row) => {
    if (row.status === 'confirmed' && row.month > 0 && row.year > 0) {
      out.add(monthlyKey(row.playerId, row.month, row.year));
    }
  });
  return out;
}

export function latestMonthlyPayment(record, playerId, month, year) {
  return Object.values(copyMonthlyPayments(record?.monthlyPayments))
    .filter((row) => row.playerId === playerId && row.month === Math.floor(number(month)) && row.year === Math.floor(number(year)))
    .sort((a, b) => String(b.createdAt || b.expiresAt).localeCompare(String(a.createdAt || a.expiresAt)))[0] || null;
}

/* Pendências do retrato publicado menos as que já foram pagas pelo app.
   É isto que impede o mensalista de confirmar enquanto estiver devendo. */
export function unpaidMonths(record, playerId) {
  const dues = isObject(record?.snapshot?.dues) ? record.snapshot.dues : {};
  const list = Array.isArray(dues[playerId]) ? dues[playerId] : [];
  const paid = paidMonthlyKeys(record);
  return list.slice(0, 36).filter((d) => isObject(d) && d.paid === false)
    .map((d) => ({
      month: Math.floor(number(d.month)),
      year: Math.floor(number(d.year)),
      amount: number(d.amount),
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(d.dueDate || '')) ? String(d.dueDate) : '',
      paidAt: text(d.paidAt, 40),
      pix: typeof d.pix === 'string' ? d.pix.slice(0, 800) : '',
      txid: text(d.txid, 80)
    }))
    .filter((d) => d.month > 0 && d.year > 0 && !paid.has(monthlyKey(playerId, d.month, d.year)));
}

export function publicMonthlyPayment(row) {
  if (!row) return null;
  return {
    status: row.status,
    amount: row.amount,
    grossAmount: row.grossAmount,
    method: row.method,
    checkoutUrl: row.checkoutUrl,
    qrCode: row.qrCode,
    qrBase64: row.qrBase64,
    expiresAt: row.expiresAt,
    paidAt: row.paidAt,
    paymentId: row.paymentId
  };
}
