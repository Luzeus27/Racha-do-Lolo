/* Área do jogador: get-player-view + view-respond + PIX manual e Mercado Pago */
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

  const state = {
    player: { kind: 'monthly', dailyAmount: 0, monthlyFee: 0, credit: 0 },
    games: [], pastGames: [], dues: [], autoCheckin: false,
    paymentMode: 'manual', card: null, auto: null, updatedAt: null
  };
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

  /* No PIX manual o fluxo é sempre o mesmo: copiar, avisar e aguardar a
     baixa do administrador — inclusive no PRO e na conta master do proprietário. */
  function noticeButton(attrs, key) {
    const busy = saving.has('notice:' + key);
    return '<button type="button" class="btn btn-ghost btn-sm" data-act="notice" ' + attrs +
      ' data-focus-key="' + esc('notice:' + key) + '"' + (busy ? ' disabled aria-busy="true"' : '') + '>' +
      (busy ? 'Enviando…' : '📣 Avisar que paguei') + '</button>';
  }

  function yesButton(g, busyYes) {
    return '<button type="button" class="btn btn-primary btn-sm" data-act="respond" data-game="' + esc(g.id) +
      '" data-value="yes" data-focus-key="' + esc('resp-yes:' + g.id) + '"' +
      (busyYes ? ' disabled aria-busy="true"' : '') + '>' +
      (busyYes ? 'Salvando…' : '✅ Vou jogar') + '</button>';
  }

  /* Mercado Pago: o pagamento aprovado dá a baixa sozinho pelo webhook. */
  function mpPending(p) {
    return !!p && ['pending', 'in_process'].includes(String(p.status));
  }

  function mpMethod(p) {
    if (!p) return '';
    if (p.method === 'card') return 'Cartão';
    if (p.method === 'auto') return 'Cobrança automática';
    return 'PIX';
  }

  function mpPayBlock(p, amountLabel, copyAct, key) {
    if (!mpPending(p)) return '';
    const code = String(p.qrCode || '');
    const url = String(p.checkoutUrl || '');
    let html = '<div style="margin-top:10px;padding:10px;border:1px solid var(--border-soft);border-radius:12px">' +
      '<div class="tiny muted" style="margin-bottom:6px">' + esc(mpMethod(p)) +
      ' no Mercado Pago · ' + esc(amountLabel) + ' · aguardando pagamento</div>';
    if (code) {
      html += '<textarea readonly rows="3" style="width:100%;font-size:11px;resize:vertical">' + esc(code) + '</textarea>' +
        '<button type="button" class="btn btn-ghost btn-sm mt" data-act="' + copyAct + '" data-' + key.type + '="' + esc(key.value) +
        '" data-focus-key="' + esc(copyAct + ':' + key.value) + '">📋 Copiar PIX do Mercado Pago</button>';
    }
    if (url) {
      html += '<a class="btn btn-ghost btn-sm mt" href="' + esc(url) + '" target="_blank" rel="noopener">Abrir pagamento ↗</a>';
    }
    html += '<p class="tiny muted" style="margin:6px 0 0">Depois que o pagamento for aprovado, a liberação acontece sozinha.</p></div>';
    return html;
  }

  function mpManualBlock(code, message) {
    if (!code) return '';
    return '<details style="margin-top:8px"><summary class="tiny muted">PIX manual do administrador (alternativa)</summary>' +
      '<div style="margin-top:6px"><textarea readonly rows="3" style="width:100%;font-size:11px;resize:vertical">' + esc(code) + '</textarea>' +
      '<p class="tiny muted" style="margin:6px 0 0">' + esc(message) + '</p></div></details>';
  }

  function statusOf(g) {
    if (g.confirmed === 'yes' || g.payment?.status === 'confirmed') return { label: 'Confirmado', cls: 'badge green' };
    if (g.waitlisted) return { label: 'Fila de espera', cls: 'badge amber' };
    if (g.confirmed === 'no') return { label: 'Não vou', cls: 'badge red' };
    if (g.payment && ['pending', 'in_process'].includes(String(g.payment.status))) {
      return { label: 'Pagamento aguardando', cls: 'badge amber' };
    }
    if (g.requiresPayment) return { label: 'Pagar diária', cls: 'badge amber' };
    if (g.monthlyPending) return { label: 'Pagar mensalidade', cls: 'badge amber' };
    return { label: 'Aguardando', cls: 'badge' };
  }

  /* Mudanças em updatedAt não redesenham a página: isso evita perder o foco dos botões. */
  function paymentSignature(p) {
    if (!p) return null;
    return [p.status, p.paymentId, p.method, p.checkoutUrl, p.expiresAt, p.paidAt];
  }

  function signature() {
    return JSON.stringify({
      player: [state.player.id, state.player.name, state.player.kind, state.player.dailyAmount, state.player.monthlyFee, state.player.credit],
      paymentMode: state.paymentMode,
      card: state.card,
      auto: state.auto && [state.auto.status, state.auto.initPoint, state.auto.lastChargeStatus],
      games: state.games.map((g) => [
        g.id, g.date, g.confirmed, !!g.waitlisted, !!g.requiresPayment,
        !!g.monthlyPending, g.monthlyDue && [g.monthlyDue.month, g.monthlyDue.year],
        g.manualPix, paymentSignature(g.payment)
      ]),
      dues: state.dues.map((d) => [
        d.month, d.year, d.amount, d.paid, d.txid, d.pix, paymentSignature(d.payment)
      ]),
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
    const daily = p.kind === 'daily';
    const behind = state.dues.length > 0;
    const roles = ['Presidente', 'Vice-Presidente', 'Diretor', 'Conselheiro'];
    const label = roles.indexOf(String(p.type || '')) >= 0 ? String(p.type) : 'Mensalista';
    const info = daily
      ? 'Diarista · diária ' + money(p.dailyAmount) + (num(p.credit) > 0 ? ' · crédito ' + money(p.credit) : '')
      : label + ' · mensalidade ' + money(p.monthlyFee) + (behind ? ' (pendente)' : ' (em dia)');
    return '<div class="card card-pad"><div class="row">' + avatar +
      '<div style="flex:1;min-width:0"><strong style="font-size:15px">' + esc(p.name || 'Jogador') + '</strong>' +
      (p.position ? '<div class="tiny muted">' + esc(p.position) + '</div>' : '') +
      '<div class="tiny muted" style="margin-top:2px">' + esc(info) + '</div>' +
      '</div></div></div>';
  }

  function gamesHtml() {
    const mp = state.paymentMode === 'mp';
    const rows = state.games.map((g) => {
      const st = statusOf(g);
      const daily = !!g.requiresPayment;
      const busyYes = saving.has('resp:' + g.id + ':yes');
      const busyNo = saving.has('resp:' + g.id + ':no');
      const busyMp = saving.has('mpdaily:' + g.id);
      const hasCredit = daily && num(state.player.dailyAmount) > 0 &&
        num(state.player.credit) >= num(state.player.dailyAmount);
      const monthlyIndex = g.monthlyDue
        ? state.dues.findIndex((d) => num(d.month) === num(g.monthlyDue.month) && num(d.year) === num(g.monthlyDue.year))
        : -1;
      const monthlyCode = monthlyIndex >= 0 ? String(state.dues[monthlyIndex].pix || '') : '';
      const note = notes[g.id] ? '<div class="wait-note" role="status">⚠️ ' + esc(notes[g.id]) + '</div>' : '';
      const mpRow = g.payment || null;
      const mpApproved = mp && mpRow && mpRow.status === 'confirmed';

      let payBlock = '';
      if (daily && g.manualPix && !hasCredit && !mp) {
        payBlock = '<div style="margin-top:10px;padding:10px;border:1px solid var(--border-soft);border-radius:12px">' +
          '<div class="tiny muted" style="margin-bottom:6px">PIX da diária · ' + esc(money(state.player.dailyAmount)) + '</div>' +
          '<textarea readonly rows="3" style="width:100%;font-size:11px;resize:vertical">' + esc(g.manualPix) + '</textarea>' +
          '<p class="tiny muted" style="margin:6px 0 0">Pague no app do seu banco e toque em “Avisar que paguei”. O administrador dará a baixa.</p>' +
          '</div>';
      }
      if (daily && mp && !hasCredit && !mpApproved) {
        payBlock = mpPayBlock(mpRow, money(state.player.dailyAmount), 'copy-mp-game', { type: 'game', value: g.id }) +
          mpManualBlock(g.manualPix, 'Se pagar pelo PIX manual, toque em “Avisar que paguei”.');
      }

      const sub = daily
        ? hasCredit ? 'Diarista: use seu crédito para garantir a vaga'
          : mp ? 'Diarista: pague a diária no Mercado Pago (ou PIX manual)'
          : 'Diarista: pague a diária no PIX do administrador'
        : g.monthlyPending
          ? mp ? 'Mensalidade pendente: escolha o pagamento em “Minha mensalidade”'
          : 'Mensalidade pendente: pague no PIX do administrador'
        : 'Mensalista: confirme sem pagar';
      let primary;
      if (daily) {
        if (mpApproved) {
          primary = '<span class="badge green">Pagamento aprovado</span>';
        } else if (hasCredit) {
          primary = '<button type="button" class="btn btn-primary btn-sm" data-act="respond" data-game="' + esc(g.id) +
            '" data-value="yes" data-focus-key="' + esc('resp-yes:' + g.id) + '"' +
            (busyYes ? ' disabled aria-busy="true"' : '') + '>' +
            (busyYes ? 'Salvando…' : '✅ Confirmar com crédito') + '</button>';
        } else if (mp) {
          if (mpPending(mpRow)) {
            primary = mpRow.qrCode
              ? '<button type="button" class="btn btn-primary btn-sm" data-act="copy-mp-game" data-game="' + esc(g.id) +
                '" data-focus-key="' + esc('mpgame:' + g.id) + '">📋 Copiar PIX do Mercado Pago</button>'
              : mpRow.checkoutUrl
                ? '<a class="btn btn-primary btn-sm" href="' + esc(mpRow.checkoutUrl) + '" target="_blank" rel="noopener">Abrir pagamento ↗</a>'
                : '<span class="badge amber">Aguardando pagamento</span>';
          } else {
            primary = '<button type="button" class="btn btn-primary btn-sm" data-act="mp-daily" data-game="' + esc(g.id) +
              '" data-focus-key="' + esc('mpdaily:' + g.id) + '"' + (busyMp ? ' disabled aria-busy="true"' : '') + '>' +
              (busyMp ? 'Gerando…' : '💳 PIX no Mercado Pago') + '</button>';
          }
        } else if (g.manualPix) {
          primary = '<button type="button" class="btn btn-primary btn-sm" data-act="copy-manual-game" data-game="' + esc(g.id) +
            '" data-focus-key="' + esc('pixgame:' + g.id) + '">📋 Copiar PIX da diária</button>';
        } else {
          primary = '<span class="badge amber">PIX do administrador não configurado</span>';
        }
      } else if (g.monthlyPending && g.monthlyDue) {
        primary = mp
          ? '<button type="button" class="btn btn-primary btn-sm" data-act="go-dues">💳 Ver formas de pagamento</button>'
          : monthlyCode
            ? '<button type="button" class="btn btn-primary btn-sm" data-act="pix" data-index="' + monthlyIndex +
              '" data-focus-key="' + esc('monthly:' + g.monthlyDue.month + ':' + g.monthlyDue.year) + '">📋 Copiar PIX da mensalidade</button>'
            : '<span class="badge amber">PIX do administrador não configurado</span>';
      } else {
        primary = yesButton(g, busyYes);
      }

      let extra = '';
      if (daily && mp && !hasCredit && !mpApproved && g.manualPix) {
        extra = noticeButton('data-game="' + esc(g.id) + '"', g.id);
      } else if (!mp || !daily) {
        const needsPix = (daily && g.manualPix && !hasCredit) || (g.monthlyPending && g.monthlyDue && monthlyCode);
        if (needsPix) extra = noticeButton('data-game="' + esc(g.id) + '"', g.id);
      }

      const noButton = mpApproved ? '' :
        '<button type="button" class="btn btn-ghost btn-sm" data-act="respond" data-game="' + esc(g.id) + '" data-value="no" ' +
        'data-focus-key="' + esc('resp-no:' + g.id) + '"' + (busyNo ? ' disabled aria-busy="true"' : '') + '>' +
        (busyNo ? 'Salvando…' : '❌ Não vou') + '</button>';

      return '<div class="list-row"><div class="spread"><div><strong>' + esc(fmtDate(g.date)) + '</strong>' +
        '<div class="tiny muted">' + esc(sub) + '</div></div>' +
        '<span class="' + st.cls + '">' + esc(st.label) + '</span></div>' + note + payBlock +
        '<div class="row games-actions" style="margin-top:9px">' + primary + extra + noButton +
        '</div></div>';
    }).join('');
    return card('Próximos jogos', 'Mensalista em dia confirma; diarista paga a diária', rows || '<p class="small muted">Nenhum jogo futuro cadastrado.</p>');
  }

  function duesHtml() {
    if (state.player.kind === 'daily') return '';
    const mp = state.paymentMode === 'mp';
    const rows = state.dues.map((d, i) => {
      const code = String(d.pix || '');
      const mpRow = d.payment || null;
      const busyPix = saving.has('mppix:' + i);
      const busyCard = saving.has('mpcard:' + i);
      let payBlock = '';

      if (!mp) {
        payBlock = code
          ? '<div style="margin-top:10px;padding:10px;border:1px solid var(--border-soft);border-radius:12px">' +
            '<textarea readonly rows="3" style="width:100%;font-size:11px;resize:vertical">' + esc(code) + '</textarea>' +
            '<p class="tiny muted" style="margin:6px 0 0">Pague no app do seu banco e toque em “Avisar que paguei”. O administrador dará a baixa.</p>' +
            '</div>'
          : '<div class="tiny muted" style="margin-top:8px">Chave PIX do administrador ainda não configurada.</div>';
      } else {
        payBlock = mpPayBlock(mpRow, money(d.amount), 'copy-mp-due', { type: 'index', value: String(i) });
        if (!mpPending(mpRow)) {
          payBlock += '<div class="row games-actions" style="margin-top:8px">' +
            '<button type="button" class="btn btn-primary btn-sm" data-act="mp-due" data-method="pix" data-index="' + i +
            '" data-focus-key="' + esc('mppix:' + i) + '"' + (busyPix ? ' disabled aria-busy="true"' : '') + '>' +
            (busyPix ? 'Gerando…' : '💳 PIX no Mercado Pago') + '</button>' +
            (state.card && num(state.card.gross) > 0
              ? '<button type="button" class="btn btn-ghost btn-sm" data-act="mp-due" data-method="card" data-index="' + i +
                '" data-focus-key="' + esc('mpcard:' + i) + '"' + (busyCard ? ' disabled aria-busy="true"' : '') + '>' +
                (busyCard ? 'Abrindo…' : '💳 Cartão · ' + money(state.card.gross)) + '</button>'
              : '') +
            '</div>' +
            (state.card ? '<p class="tiny muted" style="margin:6px 0 0">No cartão, ' + money(state.card.net) +
              ' + taxa de ' + money(state.card.fee) + ' = ' + money(state.card.gross) + '.</p>' : '');
        }
        payBlock += mpManualBlock(code, 'Pague no app do seu banco e toque em “Avisar que paguei”.');
      }

      let primary = '';
      if (!mp) {
        if (code) primary = '<button type="button" class="btn btn-primary btn-sm" data-act="pix" data-index="' + i +
          '" data-focus-key="' + esc('pix:' + d.month + ':' + d.year) + '">📋 Copiar PIX da mensalidade</button>';
      } else if (mpPending(mpRow)) {
        if (mpRow.qrCode) primary = '<button type="button" class="btn btn-primary btn-sm" data-act="copy-mp-due" data-index="' + i +
          '" data-focus-key="' + esc('mpdue:' + i) + '">📋 Copiar PIX do Mercado Pago</button>';
        else if (mpRow.checkoutUrl) primary = '<a class="btn btn-primary btn-sm" href="' + esc(mpRow.checkoutUrl) +
          '" target="_blank" rel="noopener">Abrir pagamento ↗</a>';
      }

      return '<div class="list-row"><div class="spread"><div><strong>' +
        esc(String(num(d.month)).padStart(2, '0')) + '/' + esc(d.year) + '</strong>' +
        '<div class="tiny muted">' + esc(money(d.amount)) + (d.txid ? ' · ' + esc(d.txid) : '') + '</div></div>' +
        '<span class="badge amber">Pendente</span></div>' + payBlock +
        '<div class="row games-actions" style="margin-top:8px">' + primary +
        noticeButton('data-month="' + num(d.month) + '" data-year="' + num(d.year) + '"', d.month + ':' + d.year) +
        '</div></div>';
    }).join('');

    const subtitle = mp
      ? 'PIX ou cartão no Mercado Pago; o PIX manual continua como alternativa'
      : 'Pague pelo PIX do administrador; o aviso vai para ele dar a baixa';
    return card('Minha mensalidade', subtitle, rows || '<p class="small muted">Tudo em dia por aqui 🎉</p>');
  }

  function autoHtml() {
    if (state.paymentMode !== 'mp' || state.player.kind !== 'monthly') return '';
    const a = state.auto || null;
    const active = !!a && !['cancelled', 'canceled'].includes(String(a.status));
    const busy = saving.has('mp-auto');
    const cardInfo = state.card || {};
    const body = active
      ? '<p class="tiny muted">Cobrança automática ativa' +
        (a.lastChargeStatus ? ' · última cobrança: ' + esc(a.lastChargeStatus) : '') + '.</p>' +
        (a.initPoint ? '<a class="btn btn-ghost btn-sm" href="' + esc(a.initPoint) + '" target="_blank" rel="noopener">Ver autorização ↗</a>' : '') +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="mp-auto-cancel" data-focus-key="mp-auto-cancel"' +
        (busy ? ' disabled aria-busy="true"' : '') + '>' + (busy ? 'Cancelando…' : 'Cancelar cobrança automática') + '</button>'
      : '<p class="tiny muted">Autorize uma vez e a mensalidade é cobrada no cartão todo mês. ' +
        money(num(cardInfo.net) || num(state.player.monthlyFee)) + ' + taxa ' + money(num(cardInfo.fee)) +
        ' = ' + money(num(cardInfo.gross) || num(state.player.monthlyFee)) + '. Você pode cancelar quando quiser.</p>' +
        '<button type="button" class="btn btn-primary btn-sm" data-act="mp-auto" data-focus-key="mp-auto"' +
        (busy ? ' disabled aria-busy="true"' : '') + '>' + (busy ? 'Abrindo…' : '🔁 Ativar cobrança automática') + '</button>';
    return card('Cobrança automática', 'Opcional · mensalista pode ativar ou cancelar', body +
      '<p class="tiny muted" style="margin-top:8px">O PIX manual do administrador continua valendo como alternativa.</p>');
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
    $('#player-root').innerHTML = identityHtml() + gamesHtml() +
      '<div id="dues-card">' + duesHtml() + '</div>' + autoHtml();
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
      if (data.status === 'pay-monthly' || data.status === 'manual') {
        toast(data.message || 'Pague pelo PIX do administrador e envie o comprovante.', true);
        return;
      }
      if (data.status === 'pay') {
        toast(data.message || 'Gere o PIX na sua área para garantir a vaga.', true);
        await load();
        return;
      }
      const status = inferStatus(data, response === 'no' ? 'no' : 'wait');
      const g = state.games.find((x) => sameId(x.id, gameId));
      if (g) {
        g.confirmed = status === 'yes' ? 'yes' : (status === 'no' ? 'no' : null);
        g.waitlisted = status === 'wait';
      }
      notes[gameId] = status === 'wait'
        ? 'Você está na fila de espera. Se liberar uma vaga, sua presença será confirmada.'
        : null;
      if (data.autoPaid) await load();
      toast(data.message || (status === 'yes' ? 'Presença confirmada!' : status === 'no' ? 'Resposta registrada: não vou.' : 'Você entrou na fila de espera.'), true);
    } catch (err) {
      toast((err && err.message) || 'Não foi possível salvar. Tente de novo.', false);
    } finally {
      saving.delete(key);
      render(true);
    }
  }

  async function copyManualGamePix(gameId) {
    const key = 'pixgame:' + gameId;
    if (saving.has(key)) return;
    captureFocus();
    saving.add(key);
    render(true);
    try {
      const current = state.games.find((x) => sameId(x.id, gameId));
      const code = current && String(current.manualPix || '');
      if (!code) {
        toast('Código PIX indisponível. Peça um novo link ao administrador.', false);
        return;
      }
      const ok = await copyText(code);
      toast(ok ? 'PIX copiado! Pague e toque em “Avisar que paguei”. O administrador dará a baixa.' : 'Não foi possível copiar. Toque e segure o código para copiar.', ok);
    } catch (err) {
      toast((err && err.message) || 'Não foi possível copiar o PIX. Tente de novo.', false);
    } finally {
      saving.delete(key);
      restoreFocus();
      render(true);
    }
  }

  /* PIX manual: o jogador só avisa; a baixa e o check-in são do administrador. */
  async function declarePayment(gameId, month, year) {
    const act = 'notice';
    const key = act + ':' + (gameId || month + ':' + year);
    if (saving.has(key)) return;
    captureFocus();
    saving.add(key);
    if (gameId) delete notes[gameId];
    render(true);
    try {
      const body = { v: V, p: P, response: act };
      if (gameId) body.gameId = gameId;
      if (num(month) && num(year)) { body.month = num(month); body.year = num(year); }
      const data = await api('/.netlify/functions/view-respond', body);
      if (!data || data.ok !== true) throw new Error((data && data.error) || 'Não foi possível enviar.');
      if (data.status === 'wait') {
        if (gameId) notes[gameId] = 'Você entrou na fila de espera e não precisa pagar agora.';
        toast(data.message || 'Você entrou na fila de espera.', true);
        await load();
        return;
      }
      if (data.status === 'notice') {
        toast(data.message || 'Aviso enviado ao administrador.', true);
        return;
      }
      toast(data.message || 'Aviso enviado ao administrador.', true);
    } catch (err) {
      toast((err && err.message) || 'Não foi possível enviar. Tente de novo.', false);
    } finally {
      saving.delete(key);
      restoreFocus();
      render(true);
    }
  }

  async function copyMpCode(kind, key) {
    const row = kind === 'game'
      ? (state.games.find((g) => sameId(g.id, key)) || {}).payment
      : (state.dues[Number(key)] || {}).payment;
    const code = String(row?.qrCode || '');
    if (!code) {
      toast('Código PIX do Mercado Pago indisponível. Gere um novo pagamento.', false);
      return;
    }
    captureFocus();
    const ok = await copyText(code);
    restoreFocus();
    toast(ok ? 'PIX do Mercado Pago copiado!' : 'Não foi possível copiar. Toque e segure o código para copiar.', ok);
  }

  async function createMpDaily(gameId) {
    const key = 'mpdaily:' + gameId;
    if (saving.has(key)) return;
    captureFocus();
    saving.add(key);
    render(true);
    try {
      const data = await api('/.netlify/functions/create-daily-pix', { v: V, p: P, gameId: gameId });
      if (!data || data.ok !== true) throw new Error((data && data.error) || 'Não foi possível gerar o PIX.');
      await load();
      toast(data.message || 'PIX gerado no Mercado Pago!', true);
    } catch (err) {
      toast((err && err.message) || 'Não foi possível gerar o PIX. Tente de novo.', false);
    } finally {
      saving.delete(key);
      restoreFocus();
      render(true);
    }
  }

  async function createMpDue(index, method) {
    const d = state.dues[Number(index)];
    if (!d) return;
    const key = (method === 'card' ? 'mpcard:' : 'mppix:') + index;
    if (saving.has(key)) return;
    captureFocus();
    saving.add(key);
    render(true);
    try {
      const endpoint = method === 'card' ? 'create-monthly-card' : 'create-monthly-pix';
      const data = await api('/.netlify/functions/' + endpoint, {
        v: V, p: P, month: num(d.month), year: num(d.year)
      });
      if (!data || data.ok !== true) throw new Error((data && data.error) || 'Não foi possível iniciar o pagamento.');
      await load();
      toast(data.message || 'Pagamento iniciado no Mercado Pago!', true);
    } catch (err) {
      toast((err && err.message) || 'Não foi possível iniciar o pagamento. Tente de novo.', false);
    } finally {
      saving.delete(key);
      restoreFocus();
      render(true);
    }
  }

  async function setAuto(activate) {
    const key = 'mp-auto';
    if (saving.has(key)) return;
    captureFocus();
    saving.add(key);
    render(true);
    try {
      const endpoint = activate ? 'create-monthly-auto' : 'cancel-monthly-auto';
      const data = await api('/.netlify/functions/' + endpoint, { v: V, p: P });
      if (!data || data.ok !== true) throw new Error((data && data.error) || 'Não foi possível atualizar a cobrança automática.');
      await load();
      toast(data.message || 'Cobrança automática atualizada!', true);
    } catch (err) {
      toast((err && err.message) || 'Não foi possível atualizar. Tente de novo.', false);
    } finally {
      saving.delete(key);
      restoreFocus();
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
      state.autoCheckin = data.autoCheckin === true; /* lido só para compatibilidade; não altera pagamentos */
      state.paymentMode = data.paymentMode === 'mp' ? 'mp' : 'manual';
      state.card = data.card || null;
      state.auto = data.auto || null;
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
    else if (act === 'pix') copyPix(el.dataset.index);
    else if (act === 'copy-manual-game') copyManualGamePix(String(el.dataset.game));
    else if (act === 'copy-mp-game') copyMpCode('game', String(el.dataset.game));
    else if (act === 'copy-mp-due') copyMpCode('due', String(el.dataset.index));
    else if (act === 'mp-daily') createMpDaily(String(el.dataset.game));
    else if (act === 'mp-due') createMpDue(el.dataset.index, String(el.dataset.method));
    else if (act === 'mp-auto') setAuto(true);
    else if (act === 'mp-auto-cancel') setAuto(false);
    else if (act === 'go-dues') {
      try { $('#dues-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) { /* ignora */ }
    }
    else if (act === 'paid' || act === 'notice') {
      declarePayment(String(el.dataset.game || ''), el.dataset.month, el.dataset.year);
    }
  });

  load();
  setInterval(load, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
