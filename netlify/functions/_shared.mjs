/* Código compartilhado pelas funções de assinatura do Racha do Loló. */
import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';

const PRODUCTION_ORIGIN = 'https://rachadololo.netlify.app';
const MIRROR_ORIGIN = 'https://luzeus27.github.io';

/* Origem autorizada nesta invocação. Preenchida por setCorsOrigin() no início
   de cada função. O header Origin NUNCA é usado para montar URLs de pagamento
   nem para decidir para onde o Mercado Pago deve redirecionar o usuário. */
let requestOrigin = '';

export function setCorsOrigin(req) {
  const origin = String(req?.headers?.get?.('origin') || '').trim().replace(/\/+$/, '');
  const extra = String(process.env.ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  const allowed = [PRODUCTION_ORIGIN, MIRROR_ORIGIN, ...extra];
  const loopback = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  requestOrigin = origin && (allowed.includes(origin) || loopback) ? origin : '';
}

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': requestOrigin || PRODUCTION_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
    ...extra
  };
}

export function json(body, status = 200, extra = {}) {
  /* Respostas 204 não podem ter corpo (usadas no preflight CORS). */
  if (status === 204) {
    return new Response(null, { status: 204, headers: corsHeaders(extra) });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(),
      ...extra
    }
  });
}

export const STORE_NAME = 'racha-licencas';

export function licenses() {
  return getStore({ name: STORE_NAME, consistency: 'strong' });
}

/* Usa apenas variáveis de ambiente confiáveis do servidor (SITE_URL/URL).
   O Origin vem do navegador e pode ser forjado — nunca é aceito aqui. */
export function siteUrl(req) {
  const configured = process.env.SITE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (configured) return String(configured).replace(/\/+$/, '');
  return new URL(req.url).origin;
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/* Dois planos: Básico e PRO (antigo Intermediário), mensal ou anual.
   MP_PRICE_MONTHLY/YEARLY continuam valendo para o Básico (R$ 9,90/R$ 99).
   MP_PRICE_INTERMEDIATE_* controla o PRO; o nome da variável foi mantido
   para não exigir alteração nas variáveis já configuradas. */
export function plans() {
  return {
    monthly: {
      amount: envNumber('MP_PRICE_MONTHLY', 9.9), frequency: 1,
      label: 'Básico mensal', tier: 'basic', cycle: 'monthly'
    },
    yearly: {
      amount: envNumber('MP_PRICE_YEARLY', 99), frequency: 12,
      label: 'Básico anual', tier: 'basic', cycle: 'yearly'
    },
    intermediate_monthly: {
      amount: envNumber('MP_PRICE_INTERMEDIATE_MONTHLY', 19.9), frequency: 1,
      label: 'PRO mensal', tier: 'intermediate', cycle: 'monthly'
    },
    intermediate_yearly: {
      amount: envNumber('MP_PRICE_INTERMEDIATE_YEARLY', 199), frequency: 12,
      label: 'PRO anual', tier: 'intermediate', cycle: 'yearly'
    }
  };
}

/* Nível gravado na licença. O vitalício e o PRO (antigo Intermediário) liberam
   os recursos de ADM: o jogador confirma a presença, mas quem baixa o pagamento
   é o administrador no PIX manual ou o webhook no Mercado Pago. */
export function planTier(plan) {
  const value = String(plan || 'monthly');
  return value === 'lifetime' || value.startsWith('intermediate_') ? 'intermediate' : 'basic';
}

/* Padrão do modelo de cobrança: PIX manual com a chave do administrador.
   Cada cliente pode escolher o Mercado Pago no app; a escolha fica no retrato
   publicado (paymentMode). Esta variável continua como alternativa global. */
export function playerPaymentsMode() {
  return String(process.env.PLAYER_PAYMENTS || '').trim().toLowerCase() === 'mp' ? 'mp' : 'manual';
}

/* Taxa do cartão no checkout online. A variável MP_CARD_FEE aceita 4.98 ou
   0.0498. O padrão 4,98% é o de crédito à vista com recebimento na hora;
   ajuste no painel da Netlify se a sua conta tiver outro prazo. */
export function cardFeeRate() {
  const raw = Number(process.env.MP_CARD_FEE);
  if (!Number.isFinite(raw) || raw <= 0) return 0.0498;
  /* Arredonda a conversão de porcentagem (4.98 → 0.0498) para não arrastar
     casas decimais binárias para o cálculo do valor cobrado. */
  const rate = raw > 1 ? Math.round(raw / 100 * 1e6) / 1e6 : raw;
  return Math.min(0.3, rate);
}

/* Para o racha receber o valor cheio, a taxa incide sobre o valor JÁ
   acrescido: cobrar = líquido / (1 - taxa). Somar a taxa deixaria o racha
   com alguns centavos a menos. */
export function cardGross(net) {
  /* Arredonda para cima: assim o valor que sobra após a taxa nunca fica
     abaixo da mensalidade (um centavo a menos por pagamento se acumula). */
  const value = Math.ceil((Number(net) || 0) / (1 - cardFeeRate()) * 100) / 100;
  return value > 0 ? value : 0;
}

export function maskEmail(email) {
  const value = String(email || '');
  const at = value.indexOf('@');
  if (at <= 1) return value ? '***' : '';
  return value[0] + '***' + value.slice(at);
}

export function cleanLicenseKey(value) {
  const key = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  return /^[A-Z0-9-]{8,40}$/.test(key) ? key : '';
}

/* Identificador anônimo do aparelho, gerado no navegador. Não contém dados pessoais. */
export function cleanDevice(value) {
  const id = String(value || '').trim().toUpperCase();
  return /^DEV-[A-F0-9]{24}$/.test(id) ? id : '';
}

/* Licenças antigas (sem vínculo) continuam válidas até a primeira consulta. */
export function deviceAllowed(record, device) {
  const allowed = Array.isArray(record?.devices) ? record.devices : [];
  if (!allowed.length) return true;
  return !!device && allowed.includes(device);
}

export function normalizeStatus(status) {
  const s = String(status || '').toLowerCase();
  if (['authorized', 'active', 'active_pending_cancel'].includes(s)) return 'active';
  if (['cancelled', 'canceled', 'rejected', 'expired', 'paused', 'inactive'].includes(s)) return 'inactive';
  return 'pending';
}

export function validUntil(expiresAt) {
  if (!expiresAt) return true;
  const time = Date.parse(expiresAt);
  if (!Number.isFinite(time)) return true;
  const graceDays = envNumber('LICENSE_GRACE_DAYS', 3);
  return time + graceDays * 24 * 60 * 60 * 1000 > Date.now();
}

/* Se o titular reassinar depois de cancelar, o Mercado Pago devolve um novo
   período. Só nesse caso o pedido de cancelamento antigo deve ser limpo. */
export function clearStaleCancel(record, sub) {
  if (!record?.cancelRequestedAt) return {};
  const nextPayment = Date.parse(String(sub?.next_payment_date || sub?.next_payment_at || ''));
  const requested = Date.parse(String(record.cancelRequestedAt));
  if (Number.isFinite(nextPayment) && Number.isFinite(requested) && nextPayment > requested) {
    return { cancelRequestedAt: null };
  }
  return {};
}

/* Limite de requisições por IP (e, opcionalmente, por chave/email).
   Usa um store separado das licenças e expira as contagens automaticamente.
   Falha fechada: se o Blobs não responder, a requisição é recusada. Em rotas
   de pagamento/licença, permitir o excesso seria abrir uma brecha justamente
   durante uma instabilidade. */
export async function rateLimit(req, action, { max = 30, windowMs = 60000, key = '' } = {}) {
  const headers = req?.headers;
  const forwarded = String(headers?.get?.('x-forwarded-for') || '').split(',')[0];
  const ip = String(
    headers?.get?.('x-nf-client-connection-ip') ||
    headers?.get?.('cf-connecting-ip') ||
    forwarded ||
    headers?.get?.('x-real-ip') ||
    'desconhecido'
  ).trim();
  const hash = createHash('sha256')
    .update(ip + '|' + action + '|' + String(key || ''))
    .digest('hex')
    .slice(0, 24);
  const window = Math.floor(Date.now() / windowMs);
  const id = `rl:${action}:${hash}:${window}`;
  try {
    const store = getStore({ name: 'racha-rate', consistency: 'strong' });
    const current = await store.get(id, { type: 'json', consistency: 'strong' });
    const count = Number(current?.count || 0) + 1;
    await store.setJSON(id, { count, at: Date.now() }, { expireTtl: Math.ceil(windowMs / 1000) + 120 });
    return {
      ok: count <= max,
      remaining: Math.max(0, max - count),
      retryAfter: Math.ceil(windowMs / 1000)
    };
  } catch (e) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil(windowMs / 1000), unavailable: true };
  }
}

/* Evita que dois toques (ou duas abas) criem dois pagamentos reais antes de
   a reserva aparecer no retrato publicado. A gravação condicional do Blobs é
   atômica; se o provedor não oferecer a opção, o limite de requisições e a
   reconciliação pelo webhook continuam valendo. */
const PAYMENT_LOCK_STORE = 'racha-cobrancas-lock';

export function paymentLockKey(parts) {
  return 'cob:' + createHash('sha256').update(parts.map((p) => String(p ?? '')).join('|')).digest('hex').slice(0, 32);
}

export async function beginPayment(key, paymentId, ttlSeconds = 180) {
  try {
    const store = getStore({ name: PAYMENT_LOCK_STORE, consistency: 'strong' });
    const result = await store.setJSON(key, {
      paymentId: String(paymentId),
      at: new Date().toISOString()
    }, { onlyIfNew: true, expireTtl: ttlSeconds });
    return !result || result.modified !== false;
  } catch (e) {
    return true;
  }
}

export async function endPayment(key) {
  try {
    await getStore({ name: PAYMENT_LOCK_STORE, consistency: 'strong' }).delete(key);
  } catch (e) { /* a expiração automática também libera a chave */ }
}

/* Link privado do grupo pode ser revogado ou expirar. */
export function viewUnavailable(record) {
  if (!record) return '';
  if (record.revokedAt) return 'Link revogado. Peça um novo ao administrador.';
  if (record.expiresAt && Date.parse(String(record.expiresAt)) <= Date.now()) {
    return 'Link expirado. Peça um novo ao administrador.';
  }
  return '';
}

/* O Mercado Pago exige X-Idempotency-Key ao criar pagamentos, preferências e
   assinaturas. A chave é derivada da referência externa (única por cobrança),
   para que uma nova tentativa não gere uma segunda cobrança real. */
const IDEMPOTENT_MP_PATH = /^\/(v1\/payments|v1\/orders|preapproval|checkout\/preferences)(\?|$)/;

export async function mpFetch(path, { token, method = 'GET', body } = {}) {
  try {
    const headers = {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };
    if (method === 'POST' && IDEMPOTENT_MP_PATH.test(path)) {
      const reference = (body && typeof body === 'object' && body.external_reference)
        ? String(body.external_reference)
        : path + '|' + (body === undefined ? '' : JSON.stringify(body));
      headers['X-Idempotency-Key'] = createHash('sha256').update(reference).digest('hex').slice(0, 48);
    }
    const res = await fetch('https://api.mercadopago.com' + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err.message || String(err) };
  }
}

/* ---------- Conta Mercado Pago vinculada pelo administrador ---------- */

export function mpOAuthConfig() {
  const clientId = String(process.env.MP_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.MP_CLIENT_SECRET || '').trim();
  return { clientId, clientSecret, configured: !!(clientId && clientSecret) };
}

/* A troca code -> token e a renovação acontecem SOMENTE no servidor.
   O client_secret nunca é enviado ao navegador. */
export async function oauthToken(payload) {
  const { clientId, clientSecret, configured } = mpOAuthConfig();
  if (!configured) {
    return { ok: false, status: 0, data: null, error: 'Vínculo com Mercado Pago não configurado no servidor.' };
  }
  try {
    const res = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...payload })
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err.message || String(err) };
  }
}

export async function mpConnectionFor(ownerKey) {
  if (!ownerKey) return null;
  try {
    const license = await licenses().get(ownerKey, { type: 'json', consistency: 'strong' });
    const connection = license?.mpConnection;
    if (!connection || !connection.accessToken) return null;
    return { ...connection, license };
  } catch (e) {
    return null;
  }
}

/* Token do administrador desta licença. Se faltar, usa o token global antigo.
   Renova sozinho quando faltam menos de 7 dias para vencer (o token dura 180). */
export async function mpTokenFor(ownerKey) {
  const connection = await mpConnectionFor(ownerKey);
  if (!connection) return String(process.env.MP_ACCESS_TOKEN || '').trim();

  const expires = Date.parse(String(connection.expiresAt || ''));
  if (!Number.isFinite(expires) || expires - Date.now() > 7 * 24 * 60 * 60 * 1000) {
    return connection.accessToken;
  }
  if (!connection.refreshToken) return '';

  const refreshed = await oauthToken({ grant_type: 'refresh_token', refresh_token: connection.refreshToken });
  if (!refreshed.ok || !refreshed.data?.access_token) return '';

  const seconds = Number(refreshed.data.expires_in) || 15552000;
  const next = {
    ...connection,
    accessToken: refreshed.data.access_token,
    refreshToken: refreshed.data.refresh_token || connection.refreshToken,
    publicKey: refreshed.data.public_key || connection.publicKey,
    userId: refreshed.data.user_id || connection.userId,
    expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
    renewedAt: new Date().toISOString()
  };
  const { license, ...cleanConnection } = next;
  await licenses().setJSON(ownerKey, {
    ...license,
    mpConnection: cleanConnection,
    updatedAt: new Date().toISOString()
  });
  return next.accessToken;
}

/* Modo efetivo deste link: a escolha do administrador só vale se a conta MP
   estiver realmente vinculada na licença dele. */
export async function paymentModeFor(record) {
  if (String(record?.paymentMode || '').toLowerCase() === 'mp') {
    if (await mpConnectionFor(String(record?.ownerKey || ''))) return 'mp';
  }
  return playerPaymentsMode();
}

/* O painel recebe só o que pode ser mostrado: nunca token, refresh ou secret. */
export function mpStatusFor(license) {
  const connection = license?.mpConnection;
  const status = {
    connected: !!(connection && connection.accessToken),
    configured: mpOAuthConfig().configured
  };
  if (!status.connected) return status;
  return {
    ...status,
    email: maskEmail(String(connection.email || '')),
    userId: String(connection.userId || '').slice(0, 30),
    expiresAt: String(connection.expiresAt || ''),
    connectedAt: String(connection.connectedAt || ''),
    expired: !!(connection.expiresAt && Date.parse(String(connection.expiresAt)) <= Date.now())
  };
}
