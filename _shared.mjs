/* Código compartilhado pelas funções de assinatura do Racha do Loló. */
import { getStore } from '@netlify/blobs';

const PRODUCTION_ORIGIN = 'https://teal-griffin-a37fbe.netlify.app';
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

export function plans() {
  return {
    monthly: { amount: envNumber('MP_PRICE_MONTHLY', 9), frequency: 1, label: 'Mensal' },
    yearly: { amount: envNumber('MP_PRICE_YEARLY', 90), frequency: 12, label: 'Anual' }
  };
}

export function maskEmail(email) {
  const value = String(email || '');
  const at = value.indexOf('@');
  if (at <= 1) return value ? '***' : '';
  return value[0] + '***' + value.slice(at);
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

export async function mpFetch(path, { token, method = 'GET', body } = {}) {
  try {
    const res = await fetch('https://api.mercadopago.com' + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
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
