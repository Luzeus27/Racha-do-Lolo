/* Vínculo da conta Mercado Pago do administrador em um clique.
   O navegador só recebe a URL de autorização; code, token e refresh ficam
   nesta função e no Blob da licença. Nada disso é enviado ao app. */
import { randomBytes } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import {
  cleanDevice, cleanLicenseKey, deviceAllowed, json, licenses, mpOAuthConfig,
  mpStatusFor, normalizeStatus, oauthToken, rateLimit, setCorsOrigin,
  siteUrl, validUntil
} from './_shared.mjs';

const CALLBACK_PATH = '/.netlify/functions/mp-connect';
const STATE_MS = 10 * 60 * 1000;
const STATE_PREFIX = 'mpc:';

function stateStore() {
  return getStore({ name: 'racha-rate', consistency: 'strong' });
}

function redirectToApp(req, flag) {
  return new Response(null, {
    status: 302,
    headers: { Location: siteUrl(req) + '/index.html#config&mp=' + flag, 'Cache-Control': 'no-store' }
  });
}

function redirectUri(req) {
  const configured = String(process.env.MP_REDIRECT_URI || '').trim();
  return (configured || siteUrl(req) + CALLBACK_PATH).replace(/\/+$/, '');
}

function licenseIsActive(record) {
  let active = normalizeStatus(record?.status) === 'active' && validUntil(record?.nextPaymentAt);
  if (record?.cancelRequestedAt && record?.nextPaymentAt) {
    const end = Date.parse(String(record.nextPaymentAt));
    if (Number.isFinite(end) && end <= Date.now()) active = false;
  }
  return active;
}

async function handlePost(req) {
  const limit = await rateLimit(req, 'mp-connect', { max: 12, windowMs: 60000 });
  if (!limit.ok) {
    return json({ error: 'Muitas tentativas em pouco tempo. Aguarde um minuto.' }, 429, {
      'Retry-After': String(limit.retryAfter)
    });
  }

  let body = {};
  try { body = (await req.json()) || {}; } catch (e) { body = {}; }
  const action = String(body.action || 'status').trim().toLowerCase();
  if (!['status', 'start'].includes(action)) return json({ error: 'Ação inválida.' }, 400);

  const key = cleanLicenseKey(body.licenseKey);
  const device = cleanDevice(body.deviceId);
  if (!key || !device) return json({ error: 'Licença ou aparelho não identificado.' }, 401);

  const license = await licenses().get(key, { type: 'json', consistency: 'strong' });
  if (!license || !deviceAllowed(license, device)) {
    return json({ error: 'Licença não encontrada ou vinculada a outro aparelho.' }, 403);
  }

  if (action === 'status') return json({ ok: true, ...mpStatusFor(license) });

  if (!licenseIsActive(license)) {
    return json({ error: 'Assinatura ativa é necessária para vincular o Mercado Pago.' }, 403);
  }
  const oauth = mpOAuthConfig();
  if (!oauth.configured) {
    return json({ error: 'O vínculo com o Mercado Pago ainda não foi habilitado pelo administrador do app.' }, 503);
  }

  const nonce = randomBytes(16).toString('hex');
  await stateStore().setJSON(STATE_PREFIX + nonce, {
    licenseKey: key,
    deviceId: device,
    expiresAt: new Date(Date.now() + STATE_MS).toISOString()
  }, { expireTtl: Math.ceil(STATE_MS / 1000) + 60 });

  const authorization = new URL('https://auth.mercadopago.com/authorization');
  authorization.searchParams.set('client_id', oauth.clientId);
  authorization.searchParams.set('response_type', 'code');
  authorization.searchParams.set('platform_id', 'mp');
  authorization.searchParams.set('state', nonce);
  authorization.searchParams.set('redirect_uri', redirectUri(req));

  return json({ ok: true, authorizationUrl: authorization.toString() });
}

async function handleCallback(req) {
  const params = new URL(req.url).searchParams;
  const code = String(params.get('code') || '').trim();
  const state = String(params.get('state') || '').trim();
  if (!code || !/^[a-f0-9]{32}$/.test(state)) return redirectToApp(req, 'error');

  const store = stateStore();
  const id = STATE_PREFIX + state;
  const saved = await store.get(id, { type: 'json', consistency: 'strong' });
  if (!saved || !saved.licenseKey) return redirectToApp(req, 'error');
  if (Date.parse(String(saved.expiresAt || '')) <= Date.now()) {
    await store.delete(id);
    return redirectToApp(req, 'error');
  }

  const result = await oauthToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(req)
  });
  await store.delete(id);
  if (!result.ok || !result.data?.access_token) return redirectToApp(req, 'error');

  const data = result.data;
  const now = new Date().toISOString();
  const seconds = Number(data.expires_in) || 15552000;
  const license = await licenses().get(saved.licenseKey, { type: 'json', consistency: 'strong' });
  if (!license || !deviceAllowed(license, saved.deviceId)) return redirectToApp(req, 'error');

  await licenses().setJSON(saved.licenseKey, {
    ...license,
    mpConnection: {
      accessToken: String(data.access_token || ''),
      refreshToken: String(data.refresh_token || ''),
      publicKey: String(data.public_key || ''),
      userId: String(data.user_id || ''),
      email: String(data.user_email || data.email || license.email || ''),
      scope: String(data.scope || ''),
      expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
      connectedAt: now,
      renewedAt: ''
    },
    updatedAt: now
  });

  return redirectToApp(req, 'connected');
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method === 'GET') return handleCallback(req);
  if (req.method === 'POST') return handlePost(req);
  return json({ error: 'Método não permitido.' }, 405);
};
