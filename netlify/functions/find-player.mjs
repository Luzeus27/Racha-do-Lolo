/* Encontra o link individual de UM jogador a partir do link do grupo.
   O jogador escolhe o próprio nome e informa os últimos 4 dígitos do telefone
   cadastrado. O servidor devolve somente o token VP dele — nunca os outros. */
import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { json, siteUrl, setCorsOrigin, viewUnavailable, rateLimit } from './_shared.mjs';

const VIEW_TOKEN = /^VW-[A-F0-9]{16}$/;
const PLAYER_TOKEN = /^VP-[A-F0-9]{16}$/;
const MAX_BODY = 4096;
const MAX_FAILURES = 5;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const WRONG = 'Nome ou número incorreto. Confira e tente de novo.';

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max = 60) {
  return String(value ?? '').slice(0, max);
}

function normalizeInput(value) {
  let digits = String(value ?? '').replace(/\D/g, '').slice(0, 14);
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
  return digits;
}

function matches(contact, digits) {
  const saved = String(contact || '').replace(/\D/g, '');
  if (!saved || digits.length < 4) return false;
  if (digits.length === 4) return saved.endsWith(digits);
  return saved === digits;
}

function clientIp(req) {
  const headers = req?.headers;
  const forwarded = String(headers?.get?.('x-forwarded-for') || '').split(',')[0];
  return String(
    headers?.get?.('x-nf-client-connection-ip') ||
    headers?.get?.('cf-connecting-ip') ||
    forwarded ||
    headers?.get?.('x-real-ip') ||
    'desconhecido'
  ).trim();
}

function failureKey(req, v, id) {
  const hash = createHash('sha256').update(clientIp(req) + '|' + v + '|' + id).digest('hex').slice(0, 24);
  return 'ft:' + hash + ':' + Math.floor(Date.now() / FAIL_WINDOW_MS);
}

/* Bloqueio por jogador + IP: errar 5 vezes trava por 15 minutos.
   Em falha do Blobs, conta como bloqueio (falha fechada). */
async function failuresFor(req, v, id) {
  try {
    const store = getStore({ name: 'racha-tentativas', consistency: 'strong' });
    const current = await store.get(failureKey(req, v, id), { type: 'json', consistency: 'strong' });
    return Number(current?.count || 0);
  } catch (e) {
    return MAX_FAILURES;
  }
}

async function registerFailure(req, v, id) {
  const key = failureKey(req, v, id);
  const store = getStore({ name: 'racha-tentativas', consistency: 'strong' });
  try {
    const current = await store.get(key, { type: 'json', consistency: 'strong' });
    const count = Number(current?.count || 0) + 1;
    await store.setJSON(key, { count, at: Date.now() }, { expireTtl: Math.ceil(FAIL_WINDOW_MS / 1000) + 120 });
    return count;
  } catch (e) {
    return MAX_FAILURES + 1;
  }
}

async function clearFailures(req, v, id) {
  const key = failureKey(req, v, id);
  try {
    const store = getStore({ name: 'racha-tentativas', consistency: 'strong' });
    await store.setJSON(key, { count: 0, at: Date.now() }, { expireTtl: 120 });
  } catch (e) { /* se falhar, o limite global continua valendo */ }
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  let body = {};
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY) return json({ error: 'Dados muito grandes.' }, 413);
    body = raw ? JSON.parse(raw) : {};
  } catch (e) {
    return json({ error: 'Dados inválidos.' }, 400);
  }
  if (!isObject(body)) body = {};

  const v = text(body.v, 30).toUpperCase();
  const id = text(body.id, 60);
  const digits = normalizeInput(body.input);

  if (!VIEW_TOKEN.test(v) || !id || digits.length < 4) {
    return json({ error: 'Escolha seu nome e digite os últimos 4 números do seu telefone.' }, 400);
  }

  /* Limite por IP + link: impede ficar testando os 4 dígitos de todo mundo. */
  const limit = await rateLimit(req, 'find-player', { max: 12, windowMs: 60000, key: v });
  if (!limit.ok) {
    return json({ error: 'Muitas tentativas. Aguarde um minuto e tente de novo.' }, 429, {
      'Retry-After': String(limit.retryAfter)
    });
  }

  const store = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });
  const record = await store.get(v, { type: 'json', consistency: 'strong' });
  if (!record) return json({ error: 'Link inválido ou removido.' }, 404);
  const unavailable = viewUnavailable(record);
  if (unavailable) return json({ error: unavailable, expired: true }, 410);

  const tokens = isObject(record.playerTokens) ? record.playerTokens : {};
  const token = String(tokens[id] || '');
  /* O telefone fica só no registro privado (contacts), nunca no retrato público. */
  const contacts = isObject(record.contacts) ? record.contacts : {};
  const contact = contacts[id];

  /* Mesmo com os dígitos certos, quem já errou 5 vezes espera 15 minutos. */
  if (await failuresFor(req, v, id) >= MAX_FAILURES) {
    return json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' }, 429, {
      'Retry-After': String(Math.ceil(FAIL_WINDOW_MS / 1000))
    });
  }

  /* Mensagem igual para nome errado e número errado: não revela quem existe. */
  if (!PLAYER_TOKEN.test(token) || !contact) {
    const failures = await registerFailure(req, v, id);
    if (failures > MAX_FAILURES) {
      return json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' }, 429, {
        'Retry-After': String(Math.ceil(FAIL_WINDOW_MS / 1000))
      });
    }
    return json({ error: WRONG }, 403);
  }
  if (!matches(contact, digits)) {
    const failures = await registerFailure(req, v, id);
    if (failures > MAX_FAILURES) {
      return json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' }, 429, {
        'Retry-After': String(Math.ceil(FAIL_WINDOW_MS / 1000))
      });
    }
    return json({ error: WRONG }, 403);
  }
  await clearFailures(req, v, id);

  return json({
    ok: true,
    url: siteUrl(req) + '/jogador.html?v=' + encodeURIComponent(v) + '&p=' + encodeURIComponent(token)
  });
};
