/* Código compartilhado pelas funções de assinatura do Racha do Loló. */
import { getStore } from '@netlify/blobs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS,
      ...extra
    }
  });
}

export const STORE_NAME = 'racha-licencas';

export function licenses() {
  return getStore({ name: STORE_NAME, consistency: 'strong' });
}

export function siteUrl(req) {
  const configured = process.env.SITE_URL || process.env.URL;
  if (configured) return String(configured).replace(/\/+$/, '');
  const origin = req.headers.get('origin');
  if (origin && /^https?:\/\//i.test(origin)) return origin.replace(/\/+$/, '');
  return new URL(req.url).origin;
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function plans() {
  return {
    monthly: { amount: envNumber('MP_PRICE_MONTHLY', 19.9), frequency: 1, label: 'Mensal' },
    yearly: { amount: envNumber('MP_PRICE_YEARLY', 199), frequency: 12, label: 'Anual' }
  };
}

export function maskEmail(email) {
  const value = String(email || '');
  const at = value.indexOf('@');
  if (at <= 1) return value ? '***' : '';
  return value[0] + '***' + value.slice(at);
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
  return time + 3 * 24 * 60 * 60 * 1000 > Date.now();
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
