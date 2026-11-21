/* ============================================================
   Racha do Loló — controle de período gratuito e assinatura.
   Roda antes do app.js e expõe window.RachaLicense.
   ============================================================ */
'use strict';

window.RachaLicense = (function () {
  const KEY = 'racha-license';
  const DEVICE_KEY = 'racha-device-id';
  const TRIAL_DAYS = 14;
  const GRACE_MS = 3 * 24 * 60 * 60 * 1000;
  const CHECK_MS = 60 * 60 * 1000;

  let listeners = [];
  let checking = false;
  let lastError = '';

  /* ID anônimo deste aparelho. Não contém dados pessoais e impede o
     compartilhamento da chave entre dispositivos. */
  function randomHex(length) {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, length).toUpperCase();
  }

  function deviceId() {
    let id = '';
    try { id = String(localStorage.getItem(DEVICE_KEY) || '').trim().toUpperCase(); } catch (e) { id = ''; }
    if (!/^DEV-[A-F0-9]{24}$/.test(id)) {
      id = 'DEV-' + randomHex(24);
      try { localStorage.setItem(DEVICE_KEY, id); } catch (e) { /* ignored */ }
    }
    return id;
  }

  function load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { saved = {}; }
    if (!saved.trialStart) saved.trialStart = new Date().toISOString();
    return {
      trialStart: saved.trialStart,
      key: String(saved.key || '').trim().toUpperCase(),
      lastCheck: Number(saved.lastCheck || 0),
      lastKnown: saved.lastKnown || null,
      plans: saved.plans || null,
      configured: saved.configured === true
    };
  }

  let state = load();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function emit() {
    renderBanner();
    listeners.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return function off() { listeners = listeners.filter((f) => f !== fn); };
  }

  function endpoint(name) { return '/.netlify/functions/' + name; }

  function canUseServer() {
    return /^https?:$/.test(location.protocol) && !/github\.io$/i.test(location.hostname);
  }

  function daysLeft() {
    const end = Date.parse(state.trialStart) + TRIAL_DAYS * 24 * 60 * 60 * 1000;
    return Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)));
  }

  function status() {
    const now = Date.now();
    const trialEnd = Date.parse(state.trialStart) + TRIAL_DAYS * 24 * 60 * 60 * 1000;
    const known = state.lastKnown;
    const checkedRecently = state.lastCheck && (now - state.lastCheck) < GRACE_MS;

    if (known && known.state === 'device_mismatch') {
      return {
        kind: 'device_mismatch',
        label: 'Dispositivo não autorizado',
        detail: known.message || 'Esta chave pertence a outro aparelho.'
      };
    }
    if (known && known.valid && known.plan === 'lifetime') {
      return { kind: 'active', label: 'Acesso vitalício', detail: 'Conta master — sem cobranças' };
    }
    if (known && known.valid && checkedRecently) {
      return { kind: 'active', label: 'Assinatura ativa', detail: known.plan === 'yearly' ? 'Plano anual' : 'Plano mensal' };
    }
    if (known && known.valid && state.lastCheck && (now - state.lastCheck) < GRACE_MS) {
      return { kind: 'grace', label: 'Assinatura ativa', detail: 'Confirmando online...' };
    }
    if (now < trialEnd) {
      return { kind: 'trial', label: 'Período gratuito', detail: daysLeft() + ' dia(s) restante(s)', daysLeft: daysLeft() };
    }
    if (known && known.state === 'pending') {
      return { kind: 'pending', label: 'Pagamento em andamento', detail: 'Aguarde a confirmação do Mercado Pago' };
    }
    if (state.key) {
      return { kind: 'expired', label: 'Assinatura vencida', detail: 'Renove para continuar editando' };
    }
    return { kind: 'expired', label: 'Período gratuito encerrado', detail: 'Assine para continuar editando' };
  }

  function isLocked() {
    const kind = status().kind;
    return kind === 'expired' || kind === 'device_mismatch';
  }

  function plans() {
    return state.plans || {
      monthly: { amount: 9, label: 'Mensal' },
      yearly: { amount: 90, label: 'Anual' }
    };
  }

  function price(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
  }

  async function refresh() {
    if (!canUseServer() || !state.key || checking) return null;
    checking = true;
    try {
      const res = await fetch(endpoint('license'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: state.key, deviceId: deviceId() }),
        cache: 'no-store'
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      state.lastKnown = data;
      state.lastCheck = Date.now();
      if (data.plans) state.plans = data.plans;
      state.configured = data.configured === true;
      lastError = '';
      save();
      emit();
      return data;
    } catch (err) {
      lastError = err.message || String(err);
      emit();
      return null;
    } finally {
      checking = false;
    }
  }

  /* Ao voltar do checkout, força uma conferência direta no Mercado Pago
     (o webhook pode atrasar). O backend só aceita a chave desta instalação. */
  async function verify(key) {
    if (!canUseServer() || !key) return null;
    try {
      const res = await fetch(endpoint('license'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'verify', key, deviceId: deviceId() })
      });
      if (!res.ok) return null;
      const data = await res.json();
      state.lastKnown = data;
      state.lastCheck = Date.now();
      if (data.plans) state.plans = data.plans;
      state.configured = data.configured === true;
      save();
      emit();
      return data;
    } catch (err) {
      return null;
    }
  }

  async function loadPlans() {
    if (!canUseServer()) return null;
    try {
      const res = await fetch(endpoint('license'), { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      state.plans = data.plans || state.plans;
      state.configured = data.configured === true;
      save();
      emit();
      return data;
    } catch (err) {
      return null;
    }
  }

  async function beginCheckout(email, plan) {
    if (!canUseServer()) {
      throw new Error('Para assinar, abra o site principal no Netlify (o espelho do GitHub não aceita pagamentos).');
    }
    const res = await fetch(endpoint('create-checkout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: String(email || '').trim(), plan: plan || 'monthly', deviceId: deviceId() })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || 'Não foi possível iniciar a assinatura.');
    if (data.key) {
      state.key = data.key;
      state.lastKnown = { state: 'pending', valid: false };
      state.lastCheck = Date.now();
      save();
      emit();
    }
    return data;
  }

  /* Transfere o vínculo da chave para este aparelho após conferir o e-mail
     usado no checkout. Serve para troca de celular sem exigir suporte. */
  async function transfer(key, email) {
    if (!canUseServer()) {
      return { ok: false, error: 'Disponível apenas no site principal.' };
    }
    try {
      const res = await fetch(endpoint('license'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'transfer',
          key: String(key || '').trim().toUpperCase(),
          email: String(email || '').trim().toLowerCase(),
          deviceId: deviceId()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) return { ok: false, error: data.error || 'Não foi possível transferir.' };
      return { ok: true, message: data.message || 'Chave vinculada a este aparelho.' };
    } catch (err) {
      return { ok: false, error: 'Sem conexão com o servidor. Tente novamente.' };
    }
  }

  async function activate(key, email) {
    const clean = String(key || '').trim().toUpperCase();
    if (email) {
      const moved = await transfer(clean, email);
      if (!moved.ok) return moved;
    }
    state.key = clean;
    state.lastKnown = null;
    state.lastCheck = 0;
    save();
    emit();
    return await refresh();
  }

  /* Cancela a recorrência no Mercado Pago. O acesso segue até o fim do período pago. */
  async function cancel() {
    if (!canUseServer() || !state.key) {
      return { ok: false, error: 'Cancelamento disponível apenas no site principal.' };
    }
    try {
      const res = await fetch(endpoint('cancel-subscription'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: state.key, deviceId: deviceId() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        return { ok: false, error: data.error || 'Não foi possível cancelar.' };
      }
      await refresh();
      return data;
    } catch (err) {
      return { ok: false, error: 'Sem conexão com o servidor. Tente novamente.' };
    }
  }

  function consumeQuery() {
    const params = new URLSearchParams(location.search);
    const key = params.get('license');
    if (!key) return false;
    state.key = key.trim().toUpperCase();
    state.lastKnown = null;
    state.lastCheck = 0;
    save();
    params.delete('license');
    const query = params.toString();
    history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + location.hash);
    verify(state.key).then(() => refresh());
    return true;
  }

  function renderBanner() {
    const el = document.getElementById('license-banner');
    if (!el) return;
    const s = status();
    if (s.kind === 'active' || s.kind === 'grace') { el.hidden = true; el.innerHTML = ''; return; }

    el.hidden = false;
    el.className = 'license-banner ' + (s.kind === 'device_mismatch' ? 'expired' : s.kind);
    const locked = s.kind === 'expired' || s.kind === 'device_mismatch';
    const icon = s.kind === 'trial' ? '⏳' : s.kind === 'pending' ? '⌛' : '🔒';
    el.innerHTML =
      '<span class="license-banner-ico">' + icon + '</span>' +
      '<span class="license-banner-text"><strong>' + s.label + '</strong>' +
      '<span class="license-banner-detail">' + s.detail +
      (s.kind === 'expired' ? ' · Somente leitura; seus dados continuam salvos.' : '') + '</span></span>' +
      '<button class="btn btn-sm ' + (locked ? 'btn-primary' : 'btn-ghost') + '" type="button" data-act="open-subscription">' +
      (s.kind === 'device_mismatch' ? 'Ver detalhes' : locked ? 'Assinar agora' : 'Ver assinatura') + '</button>';
  }

  function init(fn) {
    onChange(fn);
    save();
    consumeQuery();
    renderBanner();
    refresh();
    loadPlans();
    window.setInterval(() => { refresh(); }, CHECK_MS);
  }

  return {
    init, onChange, status, isLocked, refresh, loadPlans, beginCheckout, activate, cancel,
    transfer, renderBanner, plans, price, daysLeft, deviceId,
    get key() { return state.key; },
    get configured() { return state.configured; },
    get lastKnown() { return state.lastKnown; },
    get lastError() { return lastError; },
    get trialStart() { return state.trialStart; },
    canUseServer
  };
})();
