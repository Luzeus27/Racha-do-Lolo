/* Revoga o link privado do grupo. Exige licença ativa no aparelho vinculado. */
import { getStore } from '@netlify/blobs';
import {
  json, licenses, cleanDevice, deviceAllowed, normalizeStatus, validUntil,
  setCorsOrigin, rateLimit
} from './_shared.mjs';

const MAX_BODY = 16 * 1024;
const VIEW_TOKEN = /^VW-[A-F0-9]{16}$/;

function cleanKey(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const limit = await rateLimit(req, 'revoke-view', { max: 10, windowMs: 60000 });
  if (!limit.ok) {
    return json({ error: 'Muitas tentativas. Aguarde um minuto.' }, 429, {
      'Retry-After': String(limit.retryAfter)
    });
  }

  const declared = Number(req.headers?.get?.('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY) {
    return json({ error: 'Requisição muito grande.' }, 413);
  }

  let body = {};
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY) return json({ error: 'Requisição muito grande.' }, 413);
    body = raw ? JSON.parse(raw) : {};
  } catch (e) { body = {}; }

  const key = cleanKey(body.licenseKey);
  const device = cleanDevice(body.deviceId);
  const token = String(body.token || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{8,40}$/.test(key) || !device || !VIEW_TOKEN.test(token)) {
    return json({ error: 'Dados inválidos.' }, 400);
  }

  const record = await licenses().get(key, { type: 'json', consistency: 'strong' });
  if (!record || !deviceAllowed(record, device)) {
    return json({ error: 'Licença não encontrada ou vinculada a outro aparelho.' }, 403);
  }

  let active = normalizeStatus(record.status) === 'active' && validUntil(record.nextPaymentAt);
  if (record.cancelRequestedAt && record.nextPaymentAt) {
    const end = Date.parse(record.nextPaymentAt);
    if (Number.isFinite(end) && end <= Date.now()) active = false;
  }
  if (!active) {
    return json({ error: 'Assinatura ativa é necessária para revogar o link.' }, 403);
  }

  const store = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });
  const view = await store.get(token, { type: 'json', consistency: 'strong' });
  if (!view || view.ownerKey !== key) {
    return json({ error: 'Link não encontrado para esta licença.' }, 404);
  }

  const now = new Date().toISOString();
  await store.setJSON(token, { ...view, revokedAt: now, updatedAt: now }, {
    metadata: { owner: 'license' }
  });

  return json({ ok: true, token, revokedAt: now });
};
