/* Área do jogador: get-player-view + view-respond + view-rating */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num(v));
  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0] || '').join('').toUpperCase();
  const fmtDate = (iso) => {
    if (!iso) return '—';
    const [y, m, d] = String(iso).split('-').map(Number);
    return y && m && d ? `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}` : '—';
  };
  const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  };

  const params = new URLSearchParams(location.search);
  const V = String(params.get('v') || '').trim().toUpperCase();
  const P = String(params.get('p') || '').trim().toUpperCase();
  const isToken = (s, prefix) => new RegExp('^' + prefix + '-[A-Z0-9]{16}$').test(s);
  const valid = isToken(V, 'VW') && isToken(P, 'VP');
  const sameId = (a, b) => String(a) === String(b);

  const state = { player: {}, games: [], pastGames: [], dues: [], updatedAt: null };
  const saving = new Set();
  const notes = Object.create(null);
  let lastSig = '';
  let forcedFocusKey = null;
  let loading = false;
  let offlineNotified = false;

  function toast(msg, ok) {
    const root = $('#toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (ok ? 'ok' : 'err');
    el.innerHTML = esc(msg);
    root.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 4200);
  }

  async function api(url, body) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 12000) : null;
    try {
      const opt = { cache: 'no-store', headers: {} };
      if (ctrl) opt.signal = ctrl.signal;
      if (body !== undefined) {
        opt.method = 'POST';
        opt.headers['Content-Type'] = 'application/json';
        opt.body = JSON.stringify(body);
      }
      const res = await fetch(url, opt);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data && data.error) || 'Não foi possível concluir a operação.');
      return data;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function fatal(msg, status) {
    $('#player-status').textContent = status || 'Indisponível';
    $('#player-root').innerHTML = '<div class="card"><div class="card-body empty"><div class="emoji">🔗</div>' +
      '<h3>' + esc(status || 'Indisponível') + '</h3><p class="small muted">' + esc(msg) + '</p></div></div>';
  }

  function statusOf(g) {
    if (g.confirmed === 'yes') return { label: 'Confirmado', cls: 'badge green' };
    if (g.waitlisted) return { label: 'Fila de espera', cls: 'badge amber' };
    if (g.confirmed === 'no') return { label: 'Não vou', cls: 'badge red' };
    return { label: 'Aguardando', cls: 'badge' };
  }

  /* Mudanças em updatedAt não redesenham a página: isso evita perder o foco dos botões. */
  function signature() {
    return JSON.stringify({
      player: state.player,
      games: state.games.map((g) => [g.id, g.date, g.confirmed, !!g.waitlisted]),
      past: state.pastGames.map((g) => [g.id, g.label, g.date, g.myRating]),
      dues: state.dues.map((d) => [d.month, d.year, d.amount, d.paid, d.pix, d.txid, d.receiptId]),
      notes: notes,
      saving: Array.from(saving).sort()
    });
  }

  function card(title, sub, body, right) {
    return '<div class="card"><div class="card-head"><div><strong>' + esc(title) + '</strong>' +
      '<div class="sub">' + esc(sub) + '</div></div>' +
      (right ? '<div class="right">' + right + '</div>' : '') +
      '</div><div class="card-body stack">' + body + '</div></div>';
  }

  function identityHtml() {
    const p = state.player || {};
    const photo = typeof p.photo === 'string' && (/^data:image\//i.test(p.photo) || /^https?:\/\//i.test(p.photo)) ? p.photo : '';
    const avatar = photo
      ? '<img class="avatar-j" src="' + esc(photo) + '" alt="">'
      : '<span class="avatar-j-fallback">' + esc(initials(p.name)) + '</span>';
    return '<div class="card card-pad"><div class="row">' + avatar +
      '<div style="flex:1;min-width:0"><strong style="font-size:15px">' + esc(p.name || 'Jogador') + '</strong>' +
      (p.position ? '<div class="tiny muted">' + esc(p.position) + '</div>' : '') +
      '</div></div></div>';
  }

  function gamesHtml() {
    const rows = state.games.map((g) => {
      const st = statusOf(g);
      const busyYes = saving.has('resp:' + g.id + ':yes');
      const busyNo = saving.has('resp:' + g.id + ':no');
      const busy = busyYes || busyNo;
      const note = notes[g.id] ? '<div class="wait-note" role="status">⚠️ ' + esc(notes[g.id]) + '</div>' : '';
      return '<div class="list-row"><div class="spread"><div><strong>' + esc(fmtDate(g.date)) + '</strong>' +
        '<div class="tiny muted">Informe se você vai jogar</div></div>' +
        '<span class="' + st.cls + '">' + esc(st.label) + '</span></div>' + note +
        '<div class="row games-actions" style="margin-top:9px">' +
        '<button type="button" class="btn btn-primary btn-sm" data-act="respond" data-game="' + esc(g.id) + '" data-value="yes" ' +
        'data-focus-key="' + esc('resp-yes:' + g.id) + '"' + (busy ? ' disabled aria-busy="true"' : '') + '>' +
        (busyYes ? 'Salvando…' : '✅ Vou jogar') + '</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="respond" data-game="' + esc(g.id) + '" data-value="no" ' +
        'data-focus-key="' + esc('resp-no:' + g.id) + '"' + (busy ? ' disabled aria-busy="true"' : '') + '>' +
        (busyNo ? 'Salvando…' : '❌ Não vou') + '</button>' +
        '</div></div>';
    }).join('');
    return card('Próximos jogos', 'Confirme sua presença', rows || '<p class="small muted">Nenhum jogo futuro cadastrado.</p>');
  }

  function ratingsHtml() {
    const rows = state.pastGames.map((g) => {
      const my = Math.max(0, Math.min(5, Math.round(num(g.myRating))));
      const busy = saving.has('rate:' + g.id);
      const stars = [1, 2, 3, 4, 5].map((n) =>
        '<button type="button" class="star' + (n <= my ? ' on' : '') + '" data-act="rating" data-game="' + esc(g.id) +
        '" data-value="' + n + '" data-focus-key="' + esc('star:' + g.id + ':' + n) +
        '" aria-label="' + esc(n + ' estrela' + (n > 1 ? 's' : '')) + '"' + (busy ? ' disabled aria-busy="true"' : '') + '>★</button>'
      ).join('');
      return '<div class="list-row"><div class="spread"><div><strong>' + esc(g.label || fmtDate(g.date)) + '</strong>' +
        '<div class="tiny muted">' + esc(fmtDate(g.date)) + (my ? ' · sua nota: ' + esc(my) : ' · avalie de 1 a 5') + '</div></div>' +
        '<div class="stars">' + stars + '</div></div></div>';
    }).join('');
    return card('Avaliar jogos', 'Sua nota ajuda a montar os times', rows || '<p class="small muted">Nenhum jogo para avaliar ainda.</p>');
  }

  function duesHtml() {
    const rows = state.dues.map((d, i) => '<div class="list-row spread"><div><strong>' +
      esc(String(num(d.month)).padStart(2, '0')) + '/' + esc(d.year) + '</strong>' +
      '<div class="tiny muted">' + esc(money(d.amount)) + (d.txid ? ' · ' + esc(d.txid) : '') + '</div></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="pix" data-index="' + i + '" ' +
      'data-focus-key="' + esc('pix:' + d.month + ':' + d.year) + '">Copiar PIX</button></div>').join('');
    return card('Minhas mensalidades', 'PIX copia e cola de cada mês', rows || '<p class="small muted">Tudo em dia por aqui 🎉</p>');
  }

  function captureFocus() {
    const a = document.activeElement;
    forcedFocusKey = a && a.dataset ? (a.dataset.focusKey || null) : null;
  }

  function restoreFocus() {
    const key = forcedFocusKey;
    forcedFocusKey = null;
    if (!key) return;
    const all = $('#player-root').querySelectorAll('[data-focus-key]');
    for (let i = 0; i < all.length; i++) {
      if (all[i].dataset.focusKey === key) {
        try { all[i].focus({ preventScroll: true }); } catch (_) { all[i].focus(); }
        break;
      }
    }
  }

  function render(force) {
    const sig = signature();
    if (!force && sig === lastSig) return;
    if (saving.size && !force) return; /* aplicado ao terminar a ação em andamento */
    const a = document.activeElement;
    if (!forcedFocusKey && a && a.dataset) forcedFocusKey = a.dataset.focusKey || null;
    $('#player-root').innerHTML = identityHtml() + gamesHtml() + ratingsHtml() + duesHtml();
    lastSig = sig;
    restoreFocus();
  }

  function inferStatus(data, fallback) {
    if (data.status === 'yes' || data.status === 'no' || data.status === 'wait') return data.status;
    const myId = state.player && state.player.id;
    if (myId) {
      if (Array.isArray(data.confirmed) && data.confirmed.some((x) => sameId(x, myId))) return 'yes';
      if (Array.isArray(data.waitlist) && data.waitlist.some((x) => sameId(x, myId))) return 'wait';
    }
    return fallback;
  }

  async function respond(gameId, response) {
    const key = 'resp:' + gameId + ':' + response;
    if (saving.has(key)) return;
    captureFocus();
    saving.add(key);
    delete notes[gameId];
    render(true);
    try {
      const data = await api('/.netlify/functions/view-respond', { v: V, p: P, gameId: gameId, response: response });
      if (!data || data.ok !== true) throw new Error((data && data.error) || 'Não foi possível salvar sua resposta.');
      const status = inferStatus(data, response === 'no' ? 'no' : 'wait');
      const g = state.games.find((x) => sameId(x.id, gameId));
      if (g) {
        g.confirmed = status === 'yes' ? 'yes' : (status === 'no' ? 'no' : null);
        g.waitlisted = status === 'wait';
      }
      notes[gameId] = status === 'wait'
        ? 'Você está na fila de espera. Se liberar uma vaga, sua presença será confirmada.'
        : null;
      toast(status === 'yes' ? 'Presença confirmada!' : status === 'no' ? 'Resposta registrada: não vou.' : 'Você entrou na fila de espera.', true);
    } catch (err) {
      toast((err && err.message) || 'Não foi possível salvar. Tente de novo.', false);
    } finally {
      saving.delete(key);
      render(true);
    }
  }

  async function rate(gameId, stars) {
    const value = Math.max(1, Math.min(5, Math.round(num(stars))));
    const key = 'rate:' + gameId;
    if (saving.has(key)) return;
    captureFocus();
    saving.add(key);
    render(true);
    try {
      const data = await api('/.netlify/functions/view-rating', { v: V, p: P, gameId: gameId, rating: value });
      if (!data || data.ok !== true) throw new Error((data && data.error) || 'Não foi possível salvar a avaliação.');
      const g = state.pastGames.find((x) => sameId(x.id, gameId));
      if (g) g.myRating = num(data.rating) || value;
      toast('Avaliação salva. Obrigado!', true);
    } catch (err) {
      toast((err && err.message) || 'Não foi possível avaliar. Tente de novo.', false);
    } finally {
      saving.delete(key);
      render(true);
    }
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) { /* tenta o método alternativo abaixo */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      if (typeof ta.setSelectionRange === 'function') ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (_) {
      return false;
    }
  }

  async function copyPix(index) {
    const d = state.dues[Number(index)];
    if (!d || !d.pix) {
      toast('Código PIX indisponível para esta mensalidade.', false);
      return;
    }
    captureFocus();
    const ok = await copyText(String(d.pix));
    restoreFocus();
    toast(ok ? 'PIX copiado!' : 'Não foi possível copiar. Toque e segure o código para copiar.', ok);
  }

  async function load() {
    if (!valid || loading) return;
    loading = true;
    try {
      const data = await api('/.netlify/functions/get-player-view?v=' + encodeURIComponent(V) + '&p=' + encodeURIComponent(P));
      if (!data || data.ok !== true) throw new Error((data && data.error) || 'Link inválido ou expirado.');
      state.player = data.player || {};
      state.games = Array.isArray(data.games) ? data.games : [];
      state.pastGames = Array.isArray(data.pastGames) ? data.pastGames : [];
      state.dues = Array.isArray(data.dues) ? data.dues : [];
      state.updatedAt = data.updatedAt || null;
      offlineNotified = false;
      $('#player-status').textContent = 'Atualizado em ' + fmtTime(state.updatedAt) + ' · atualização automática';
      render();
    } catch (err) {
      if (!lastSig) {
        fatal('Não foi possível carregar suas informações. Verifique sua conexão e tente novamente.', 'Sem conexão');
      } else {
        $('#player-status').textContent = 'Sem conexão · tentando novamente…';
        if (!offlineNotified) {
          offlineNotified = true;
          toast('Não foi possível atualizar. Tentando novamente em instantes.', false);
        }
      }
    } finally {
      loading = false;
    }
  }

  if (!valid) {
    fatal('Link incompleto ou inválido. Peça um novo link ao administrador e confira se os parâmetros v e p estão presentes.', 'Link inválido');
    return;
  }

  $('#player-root').addEventListener('click', (ev) => {
    const el = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!el || el.disabled) return;
    const act = el.dataset.act;
    if (act === 'respond') respond(String(el.dataset.game), String(el.dataset.value));
    else if (act === 'rating') rate(String(el.dataset.game), el.dataset.value);
    else if (act === 'pix') copyPix(el.dataset.index);
  });

  load();
  setInterval(load, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
