/* DiagnÃ³stico temporÃ¡rio do sandbox. Remover antes da venda. */
import { json, mpFetch, mpTokenFor, setCorsOrigin } from './_shared.mjs';

export default async (req) => {
  setCorsOrigin(req);
  const token = await mpTokenFor('');
  if (!token) return json({ error: 'Token indisponÃ­vel.' }, 503);

  if (req.method === 'POST') {
    const card = await mpFetch('/v1/card_tokens', {
      token,
      method: 'POST',
      body: {
        card_number: '5480032801033311',
        expiration_month: '11',
        expiration_year: '2030',
        security_code: '123',
        cardholder: {
          name: 'Comprador Racha',
          identification: { type: 'CPF', number: '12345678909' }
        }
      }
    });
    if (!card.ok || !card.data?.id) {
      return json({ etapa: 'cartao', status: card.status, message: card.data?.message || '' }, 502);
    }
    const pm = String(card.data?.card?.payment_method?.id || 'mastercard');
    const issuer = Number(card.data?.issuer_id || card.data?.card?.issuer?.id || 0);
    const pay = await mpFetch('/v1/payments', {
      token,
      method: 'POST',
      body: {
        transaction_amount: 63.15,
        token: card.data.id,
        description: 'Mensalidade Racha do LolÃ³ â 122026',
        installments: 1,
        payment_method_id: pm,
        issuer_id: issuer > 0 ? issuer : undefined,
        payer: { email: 'mensalista.f39147b4d38d2b@example.com' },
        external_reference: 'MENSALIDADE-CARD|VW-E9A2F816431A45E3|MS-A1F9857859854B3B',
        notification_url: 'https://rachadololo.netlify.app/.netlify/functions/mp-webhook?cliente=RL-D3367A29C45F',
        binary_mode: true
      }
    });
    return json({
      etapa: 'pagamento',
      ok: pay.ok,
      status: pay.status,
      mpStatus: pay.data?.status || '',
      detail: pay.data?.status_detail || '',
      message: pay.data?.message || '',
      paymentId: pay.data?.id || ''
    }, pay.ok ? 200 : 502);
  }

  if (req.method !== 'GET') return json({ error: 'MÃ©todo nÃ£o permitido.' }, 405);
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
