/* Leitura pública do retrato compartilhado. O token é a única credencial. */
import { getStore } from '@netlify/blobs';
import { json } from './_shared.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  let token = '';
  if (req.method === 'GET') {
    token = String(new URL(req.url).searchParams.get('v') || '').trim().toUpperCase();
  } else {
    try { token = String((await req.json()).token || '').trim().toUpperCase(); } catch (e) { token = ''; }
  }

  if (!/^VW-[A-F0-9]{16}$/.test(token)) {
    return json({ error: 'Link inválido.' }, 404);
  }

  const store = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });
  const record = await store.get(token, { type: 'json', consistency: 'strong' });
  if (!record) return json({ error: 'Link inválido ou removido.' }, 404);

  return json({
    token,
    updatedAt: record.updatedAt || null,
    snapshot: record.snapshot || {}
  });
};
