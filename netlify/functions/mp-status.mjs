/* Diagnóstico temporário do sandbox. Remover antes da venda. */
import { json, mpFetch, mpTokenFor, setCorsOrigin } from './_shared.mjs';

export default async (req) => {
  setCorsOrigin(req);
  if (req.method !== 'GET') return json({ error: 'Método não permitido.' }, 405);
  const token = await mpTokenFor('');
  if (!token) return json({ error: 'Token indisponível.' }, 503);
  const q = new URL(req.url).searchParams;
  const out = {};
  const pref = String(q.get('pref') || '').trim();
  if (pref) {
    const r = await mpFetch('/checkout/preferences/' + encodeURIComponent(pref), { token });
    out.preference = {
      status: r.status,
      ok: r.ok,
      id: r.data?.id || '',
      message: r.data?.message || '',
      initPoint: r.data?.init_point || '',
      sandboxInitPoint: r.data?.sandbox_init_point || '',
      items: Array.isArray(r.data?.items) ? r.data.items.map((i) => ({ id: i.id, title: i.title, unitPrice: i.unit_price })) : [],
      payerEmail: r.data?.payer?.email || ''
    };
  }
  const ext = String(q.get('ext') || '').trim();
  if (ext) {
    const r = await mpFetch('/v1/payments/search?external_reference=' + encodeURIComponent(ext) + '&limit=10', { token });
    out.payments = {
      status: r.status,
      ok: r.ok,
      message: r.data?.message || '',
      results: Array.isArray(r.data?.results) ? r.data.results.map((p) => ({
        id: p.id,
        status: p.status,
        detail: p.status_detail,
        amount: p.transaction_amount,
        externalReference: p.external_reference,
        paymentMethodId: p.payment_method_id
      })) : []
    };
  }
  return json(out);
};
