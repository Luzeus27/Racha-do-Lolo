/* ============================================================
   Racha do Loló — controle de período gratuito e assinatura.
   Roda antes do app.js e expõe window.RachaLicense.
   ============================================================ */
'use strict';

window.RachaLicense = (function () {
  const KEY = 'racha-license';
  const TRIAL_DAYS = 14;
  const GRACE_MS = 3 * 24 * 60 * 60 * 1000;
  const CHECK_MS = 60 * 60 * 1000;

  let listeners = [];
  let checking = false;
  let lastError = '';

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

  function isLocked() { return status().kind === 'expired'; }

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
      const res = await fetch(endpoint('license') + '?key=' + encodeURIComponent(state.key), { cache: 'no-store' });
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
      body: JSON.stringify({ email: String(email || '').trim(), plan: plan || 'monthly' })
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

  async function activate(key) {
    state.key = String(key || '').trim().toUpperCase();
    state.lastKnown = null;
    state.lastCheck = 0;
    save();
    emit();
    return await refresh();
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
    refresh();
    return true;
  }

  function renderBanner() {
    const el = document.getElementById('license-banner');
    if (!el) return;
    const s = status();
    if (s.kind === 'active' || s.kind === 'grace') { el.hidden = true; el.innerHTML = ''; return; }

    el.hidden = false;
    el.className = 'license-banner ' + s.kind;
    const locked = s.kind === 'expired';
    const icon = s.kind === 'trial' ? '⏳' : s.kind === 'pending' ? '⌛' : '🔒';
    el.innerHTML =
      '<span class="license-banner-ico">' + icon + '</span>' +
      '<span class="license-banner-text"><strong>' + s.label + '</strong>' +
      '<span class="license-banner-detail">' + s.detail +
      (locked ? ' · Somente leitura; seus dados continuam salvos.' : '') + '</span></span>' +
      '<button class="btn btn-sm ' + (locked ? 'btn-primary' : 'btn-ghost') + '" type="button" data-act="open-subscription">' +
      (locked ? 'Assinar agora' : 'Ver assinatura') + '</button>';
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
    init, onChange, status, isLocked, refresh, loadPlans, beginCheckout, activate,
    renderBanner, plans, price, daysLeft,
    get key() { return state.key; },
    get configured() { return state.configured; },
    get lastKnown() { return state.lastKnown; },
    get lastError() { return lastError; },
    get trialStart() { return state.trialStart; },
    canUseServer
  };
})();
