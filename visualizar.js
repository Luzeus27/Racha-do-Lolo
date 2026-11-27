/* Visão do grupo: aba Jogadores (check-in/pagamento) + visão somente leitura. */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const IDENTITY_ERROR = 'Não foi possível confirmar este perfil. Confira o nome e os últimos 4 dígitos do telefone.';
  const safePlayerUrl = (url) => {
    const value = String(url || '');
    return value.startsWith(location.origin + '/jogador.html?') ? value : '';
  };
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num(v));
  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const fmtDate = (iso) => {
    if (!iso) return '—';
    const [y, m, d] = String(iso).split('-').map(Number);
    return y && m && d ? `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}` : '—';
  };
  const fmtTime = (iso) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  };
  /* Foto vem do registro: só formatos raster conhecidos, blob local ou ícone do app. */
  const safePhotoUrl = (value) => {
    if (typeof value !== 'string') return '';
    const v = value.trim();
    if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(v)) return v;
    if (v.startsWith('blob:' + location.origin + '/')) {
      try {
        const u = new URL(v);
        if (u.protocol === 'blob:' && /^\/[A-Za-z0-9._~-]+$/.test(u.pathname) && !u.search && !u.hash) return v;
      } catch (_) { /* ignora URL inválida */ }
      return '';
    }
    return /^(?:\.\/|\/)?(?:icon-192|icon-512)\.png$/i.test(v) ? v : '';
  };

  const token = String(new URLSearchParams(location.search).get('v') || '').trim().toUpperCase();
  const PROFILE_KEY = 'racha-perfil-' + token;
  const REMEMBER_MS = 180 * 24 * 60 * 60 * 1000;
  let current = null;
  let publicData = null;
  let activeTab = 'players';
  let playerQuery = '';
  let selectedPlayer = null;
  let identityBusy = false;

  /* Depois da primeira identificação, o link individual fica lembrado neste
     aparelho por 180 dias. O botão "Trocar jogador" apaga quando não é você. */
  function savedProfile() {
    try {
      const row = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
      if (!row || !row.id || typeof row.url !== 'string' || !row.url) return null;
      if (row.at && Date.now() - Number(row.at) > REMEMBER_MS) {
        localStorage.removeItem(PROFILE_KEY);
        return null;
      }
      return row;
    } catch (e) { return null; }
  }

  function saveProfile(id, url) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ id, url, at: Date.now() })); } catch (e) { /* ignore */ }
  }

  function clearProfile() {
    try { localStorage.removeItem(PROFILE_KEY); } catch (e) { /* ignore */ }
  }

  function card(title, sub, body) {
    return `<div class="card"><div class="card-head"><div><strong>${esc(title)}</strong><div class="sub">${esc(sub)}</div></div></div><div class="card-body stack">${body}</div></div>`;
  }

  function avatar(p) {
    const photo = safePhotoUrl(p && p.photo);
    if (photo) {
      return `<img class="avatar" src="${esc(photo)}" alt="">`;
    }
    return `<span class="avatar-fallback">${esc(initials(p && p.name))}</span>`;
  }

  function person(p, extra) {
    if (!p) return '';
    return `<div class="person">${avatar(p)}<span style="flex:1"><strong>${esc(p.name)}</strong>${p.position ? ` <span class="tiny muted">· ${esc(p.position)}</span>` : ''}</span>${extra || ''}</div>`;
  }

  function rating(p) {
    return Math.round((num(p.strength) + num(p.speed)) / 2);
  }

  function showError(msg) {
    $('#view-status').textContent = 'Não foi possível carregar';
    $('#view-root').innerHTML = `<div class="card"><div class="card-body view-empty"><p class="small muted">${esc(msg)}</p></div></div>`;
  }

  function confirmedFor(gameId) {
    const fromPlayers = Object.keys((publicData?.responses || {})[gameId] || {})
      .filter((id) => publicData.responses[gameId][id] === 'yes');
    if (fromPlayers.length) return fromPlayers;
    const manual = (current?.confirmations || {})[gameId];
    return Array.isArray(manual) ? manual : [];
  }

  function renderNextGames(s, byId) {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = (s.games || [])
      .filter((g) => g && g.date && g.date >= today && !g.canceled)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, 6);
    if (!upcoming.length) {
      return card('Próximos jogos', 'Agenda do racha', '<p class="small muted">Nenhum jogo futuro cadastrado.</p>');
    }
    const rows = upcoming.map((g) => {
      const confirmed = confirmedFor(g.id);
      const wait = (publicData?.waitlist || {})[g.id] || [];
      const names = confirmed.slice(0, 8).map((id) => esc((byId[id] || {}).name || '')).filter(Boolean).join(', ');
      const extra = wait.length ? `<span class="tiny" style="color:var(--amber)"> · ${wait.length} na fila</span>` : '';
      return `<div class="person"><span class="pill">${esc(fmtDate(g.date))}</span><span style="flex:1"><strong>${confirmed.length} confirmado(s)</strong>${extra}<div class="tiny muted">${names || 'Aguardando confirmações'}${confirmed.length > 8 ? '…' : ''}</div></span></div>`;
    }).join('');
    return card('Próximos jogos', 'Datas e presença confirmada', rows);
  }

  function renderConfirmations(s, byId) {
    const entries = Object.keys((publicData?.responses) || (s.confirmations) || {})
      .filter((k) => confirmedFor(k).length && !(s.games || []).some(g => g.id === k && g.canceled));
    if (!entries.length) return card('Confirmados', 'Presença por jogo', '<p class="small muted">Nenhuma confirmação registrada.</p>');
    const game = (s.games || []).find((g) => g.id === entries[0]);
    const label = game ? fmtDate(game.date) : 'Jogo';
    const list = confirmedFor(entries[0]).map((id) => byId[id]).filter(Boolean);
    const wait = ((publicData?.waitlist || {})[entries[0]] || []).map((id) => byId[id]).filter(Boolean);
    return card('Confirmados', 'Presença confirmada · ' + label,
      `<div class="grid-2" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:4px 16px">${list.map((p) => person(p)).join('')}</div>
       ${wait.length ? `<div class="tiny" style="color:var(--amber);margin-top:10px">Fila de espera: ${wait.map((p) => esc(p.name)).join(', ')}</div>` : ''}`);
  }

  function renderLive() {
    const live = publicData?.live;
    if (!live) return '';
    const score = live.score || { A: 0, B: 0 };
    const teams = Object.keys(score).filter((k) => /^[A-F]$/.test(k)).sort();
    const teamKeys = teams.length ? teams : ['A', 'B'];
    const events = (live.events || []).slice(-5).reverse();
    const ico = { goal: '⚽', assist: '🅰️', card: '🟨' };
    const byId = {};
    (current?.players || []).forEach((p) => { if (p && p.id) byId[p.id] = p; });
    return card('Ao vivo', live.endedAt ? 'Partida encerrada' : 'Placar em tempo real', `
      <div class="live-board">${teamKeys.map((k, i) => `<div class="live-side"><span class="tiny muted">Equipe ${k}</span><strong>${num(score[k])}</strong></div>${i < teamKeys.length - 1 ? '<span class="live-x">×</span>' : ''}`).join('')}</div>
      ${events.length ? `<div class="mt">${events.map((ev) => `<div class="person"><span>${ico[ev.type] || '•'}</span><span style="flex:1"><strong>${esc((byId[ev.playerId] || {}).name || 'Jogador')}</strong> <span class="tiny muted">· equipe ${esc(ev.team || 'A')}</span></span></div>`).join('')}</div>` : ''}
      <a class="btn btn-ghost mt" href="./ao-vivo.html?v=${encodeURIComponent(token)}">🔴 Abrir placar completo</a>`);
  }

  function renderDraw(s, byId) {
    const last = (s.drawHistory || [])[0];
    if (!last || !Array.isArray(last.teams) || !last.teams.length) {
      return card('Times sorteados', 'Último sorteio', '<p class="small muted">Ainda não houve sorteio.</p>');
    }
    const teams = last.teams.map((ids, i) => {
      const players = ids.map((id) => byId[id]).filter(Boolean);
      const avg = players.length ? Math.round(players.reduce((a, p) => a + rating(p), 0) / players.length) : 0;
      return `<div class="team"><h4>Time ${i + 1} <span class="pill">média ${avg}</span></h4>${players.map((p) => person(p)).join('') || '<span class="tiny muted">Vago</span>'}</div>`;
    }).join('');
    return card('Times sorteados', `${esc(last.gameLabel || 'Avulso')} · ${esc(fmtTime(last.createdAt))}`,
      `<div class="grid-2" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">${teams}</div>`);
  }

  function renderRanking(s, byId) {
    const st = s.settings || {};
    const pts = {
      goal: num(st.ptsGoal), assist: num(st.ptsAssist), presence: num(st.ptsPresence),
      fairPlay: num(st.ptsFairPlay), punctual: num(st.ptsPunctual), farrapou: num(st.ptsFarrapou),
      atrasado: num(st.ptsAtrasado), desarme: num(st.ptsDesarme), card: num(st.ptsCard),
      defesas: num(st.ptsDefesas), paredoes: num(st.ptsParedoes), golsSofridos: num(st.ptsGolsSofridos)
    };
    const totals = {};
    (s.scores || []).forEach((sc) => {
      if (!sc || !sc.playerId) return;
      const t = totals[sc.playerId] || (totals[sc.playerId] = { points: 0, goals: 0, assists: 0 });
      t.goals += num(sc.goals);
      t.assists += num(sc.assists);
      t.points += num(sc.goals) * pts.goal + num(sc.assists) * pts.assist + num(sc.presence) * pts.presence +
        num(sc.fairPlay) * pts.fairPlay + num(sc.punctual) * pts.punctual - num(sc.farrapou) * pts.farrapou -
        num(sc.atrasado) * pts.atrasado + num(sc.desarmes) * pts.desarme + num(sc.cards) * pts.card +
        num(sc.defesas) * pts.defesas + num(sc.paredoes) * pts.paredoes + num(sc.golsSofridos) * pts.golsSofridos;
    });
    const top = Object.keys(totals)
      .map((id) => ({ ...totals[id], player: byId[id] }))
      .filter((x) => x.player)
      .sort((a, b) => b.points - a.points)
      .slice(0, 10);
    if (!top.length) return card('Ranking', 'Campeonato interno', '<p class="small muted">Ainda não há pontuação lançada.</p>');
    return card('Ranking', 'Campeonato interno · pontos', top.map((x, i) => `
      <div class="rank-row">
        <span class="rank-num">${i + 1}º</span>
        ${person(x.player, `<span class="tiny muted" style="text-align:right">${x.goals} gols · ${x.assists} assist.</span>`)}
        <strong style="color:var(--accent)">${x.points} pts</strong>
      </div>`).join(''));
  }

  function renderFinance(s) {
    const f = s.finance || {};
    const year = num((s.settings || {}).year) || new Date().getFullYear();
    const months = (f.byMonth || []).filter((m) => num(m.year) === year);
    const monthly = months.map((m) => `<div class="person"><span class="pill">${String(num(m.month)).padStart(2, '0')}/${year}</span><span style="flex:1">Pago <strong>${money(m.paid)}</strong></span><span class="tiny muted">Aberto ${money(m.open)}</span></div>`).join('');
    return card('Financeiro', 'Resumo do caixa · ' + year,
      `<div class="grid grid-2">
        <div class="kpi"><div class="label">Recebido</div><div class="big-num">${money(f.paid)}</div></div>
        <div class="kpi"><div class="label">Em aberto</div><div class="big-num">${money(f.open)}</div></div>
      </div>${monthly ? `<div style="margin-top:12px">${monthly}</div>` : ''}`);
  }

  function renderDonation(s) {
    const p = s.settings || {};
    if (p.donationEnabled === false) return '';
    const code = String(p.donationPix || '');
    if (!code.startsWith('000201')) return '';
    const msg = p.donationText || 'Ajude a manter o racha: qualquer quantia é bem-vinda!';
    return card('💚 Doação voluntária', esc(msg),
      `<p class="small muted" style="margin:0">Se quiser ajudar com o aluguel, os brindes ou o churrasco, faça um PIX de qualquer valor. Não é obrigatório e não troca mensalidade nem diária.</p>
       <textarea id="donation-code" readonly rows="3" style="width:100%;font-size:11px;resize:vertical;margin-top:10px">${esc(code)}</textarea>
       <button type="button" class="btn btn-ghost btn-sm" data-act="copy-donation" style="margin-top:8px">📋 Copiar código PIX</button>
       <div class="tiny muted" style="margin-top:6px">Abra o app do banco, escolha PIX copia e cola, cole o código e digite o valor que quiser doar.</div>`);
  }

  function renderProfile(s) {
    const p = s.settings || {};
    const name = p.rachaName || 'Racha do Loló';
    const hasProfile = p.rachaLogo || p.rachaFounded || p.rachaLocation || p.rachaTime ||
      p.rachaDuration || p.rachaRules || (p.rachaName && p.rachaName !== 'Racha do Loló');
    if (!hasProfile) return '';
    const logoUrl = safePhotoUrl(p.rachaLogo);
    const logo = logoUrl
      ? `<img src="${esc(logoUrl)}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:14px">`
      : `<span class="avatar-fallback" style="width:56px;height:56px;display:grid;place-items:center;border-radius:14px">${esc(initials(name))}</span>`;
    const facts = [];
    if (p.rachaFounded) facts.push('Desde ' + fmtDate(p.rachaFounded));
    if (p.rachaLocation) facts.push(String(p.rachaLocation));
    if (p.rachaTime) facts.push(String(p.rachaTime));
    if (p.rachaDuration) facts.push(String(p.rachaDuration));
    const rules = p.rachaRules ? `<details style="margin-top:10px"><summary class="small" style="cursor:pointer">📜 Regras do racha (estatuto)</summary><div class="small muted" style="white-space:pre-wrap;margin-top:8px">${esc(p.rachaRules)}</div></details>` : '';
    return `<div class="card"><div class="card-body stack">
      <div class="person">${logo}<span style="flex:1"><strong>${esc(name)}</strong>${facts.length ? `<div class="tiny muted">${facts.map(esc).join(' · ')}</div>` : ''}</span></div>
      ${rules}
    </div></div>`;
  }

  /* ---- Aba Jogadores: ponto de entrada para check-in e pagamento ---- */

  function renderPlayers(s, byId) {
    const list = (s.players || [])
      .filter((p) => p && p.id && p.name && p.active !== false)
      .slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
    let saved = savedProfile();
    if (saved && !list.some((p) => p.id === saved.id)) { clearProfile(); saved = null; }
    const rows = list.map((p) => {
      const rawType = String(p.type || '').trim();
      const type = rawType.toLowerCase() === 'diarista' ? 'Diarista'
        : ['Presidente', 'Vice-Presidente', 'Diretor', 'Conselheiro'].includes(rawType) ? rawType : 'Mensalista';
      const remembered = saved && saved.id === p.id
        ? '<span class="pill" style="margin-left:6px">✅ Salvo aqui</span>' : '';
      const action = saved && saved.id === p.id ? 'Abrir meu perfil →' : 'Acessar meu perfil →';
      return `<div class="person player-row" data-name="${esc(String(p.name).toLocaleLowerCase('pt-BR'))}">
        ${avatar(p)}
        <span style="flex:1;min-width:0"><strong>${esc(p.name)}</strong>${remembered}${p.position ? `<span class="tiny muted"> · ${esc(p.position)}</span>` : ''}<div class="tiny muted">${type}</div></span>
        <button type="button" class="btn btn-primary btn-sm" data-act="select-player" data-id="${esc(p.id)}">${action}</button>
      </div>`;
    }).join('');
    const intro = saved
      ? `<p class="small muted" style="margin:0 0 10px">Este aparelho já reconhece <strong>${esc((list.find((p) => p.id === saved.id) || {}).name || 'seu perfil')}</strong>. Toque em <strong>Abrir meu perfil</strong> para entrar direto.</p>
         <div style="margin-bottom:12px"><button type="button" class="btn btn-ghost btn-sm" data-act="clear-profile">🔄 Não é você? Trocar jogador</button></div>`
      : `<p class="small muted" style="margin:0 0 12px">
        Encontre seu nome, clique em <strong>Acessar meu perfil</strong> e informe os <strong>últimos 4 números do seu telefone</strong> cadastrado.
        Na sua área você faz o check-in e paga a mensalidade ou a diária, se estiver pendente. Depois disso, este aparelho lembra de você.
      </p>`;
    const body = `${intro}
      <label class="field" style="margin-bottom:6px">
        <input id="player-search" type="search" placeholder="🔎 Digite seu nome para encontrar..." value="${esc(playerQuery)}" autocomplete="off" />
      </label>
      <div id="player-list" class="stack">${rows || '<p class="small muted">Nenhum jogador cadastrado neste link.</p>'}</div>
      <p id="player-empty" class="small muted" hidden>Nenhum jogador com esse nome.</p>
      <p class="tiny muted" style="margin:12px 0 0">O telefone serve só para confirmar que o perfil é seu. Ele não aparece na lista e não é enviado ao grupo. Seus dados só podem ser alterados pelo administrador no app principal.</p>`;
    return card('Jogadores', 'Check-in e pagamento · encontre seu perfil', body);
  }

  function renderTabs() {
    return `<div class="view-tabs" role="tablist" aria-label="Seções do racha">
      <button type="button" role="tab" aria-selected="${activeTab === 'players'}" class="view-tab ${activeTab === 'players' ? 'on' : ''}" data-act="tab" data-tab="players">👥 Jogadores</button>
      <button type="button" role="tab" aria-selected="${activeTab === 'overview'}" class="view-tab ${activeTab === 'overview' ? 'on' : ''}" data-act="tab" data-tab="overview">📊 Visão geral</button>
    </div>`;
  }

  function overviewHtml(s, byId) {
    return [
      renderProfile(s), renderLive(), renderNextGames(s, byId), renderConfirmations(s, byId),
      renderDraw(s, byId), renderRanking(s, byId), renderFinance(s), renderDonation(s)
    ].join('');
  }

  function applyPlayerFilter() {
    const q = playerQuery.trim().toLocaleLowerCase('pt-BR');
    const rows = Array.from(document.querySelectorAll('#player-list .player-row'));
    let visible = 0;
    rows.forEach((row) => {
      const show = !q || String(row.dataset.name || '').indexOf(q) >= 0;
      row.hidden = !show;
      if (show) visible++;
    });
    const empty = $('#player-empty');
    if (empty) empty.hidden = visible > 0;
  }

  function render(updatedAt) {
    const s = current || {};
    const byId = {};
    (s.players || []).forEach((p) => { if (p && p.id) byId[p.id] = p; });
    $('#view-status').textContent = 'Atualizado em ' + fmtTime(updatedAt || s.publishedAt) + ' · atualização automática';
    const content = activeTab === 'players' ? renderPlayers(s, byId) : overviewHtml(s, byId);
    $('#view-root').innerHTML = renderTabs() + `<div class="mt">${content}</div>`;
    applyPlayerFilter();
  }

  /* ---- Identificação do jogador ---- */

  function openPlayerModal(p) {
    selectedPlayer = p;
    identityBusy = false;
    const box = $('#view-modal');
    box.innerHTML = `
      <div class="view-modal-backdrop" data-act="close-player-modal"></div>
      <div class="view-modal-card" role="dialog" aria-modal="true" aria-label="Acessar meu perfil">
        <div class="view-modal-head">
          <div class="person">${avatar(p)}<span style="flex:1"><strong>${esc(p.name)}</strong><div class="tiny muted">Confirme que este perfil é seu</div></span></div>
          <button type="button" class="icon-btn" data-act="close-player-modal" aria-label="Fechar">✕</button>
        </div>
        <p class="small muted" style="margin:0 0 12px">Digite os <strong>últimos 4 números do telefone</strong> que você cadastrou no racha. Se preferir, digite o telefone inteiro.</p>
        <label class="field">Últimos 4 dígitos
          <input id="player-identity" type="text" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="Ex.: 4321" />
        </label>
        <p id="player-identity-error" class="tiny" style="color:var(--red);min-height:16px;margin:6px 0 0"></p>
        <div class="row" style="gap:8px;justify-content:flex-end;margin-top:8px">
          <button type="button" class="btn btn-ghost btn-sm" data-act="close-player-modal">Cancelar</button>
          <button type="button" class="btn btn-primary btn-sm" data-act="confirm-player">Abrir meu perfil →</button>
        </div>
      </div>`;
    box.hidden = false;
    setTimeout(() => { const el = $('#player-identity'); if (el) el.focus(); }, 0);
  }

  function closePlayerModal() {
    const box = $('#view-modal');
    if (box) { box.hidden = true; box.innerHTML = ''; }
    selectedPlayer = null;
    identityBusy = false;
  }

  async function confirmPlayer() {
    if (identityBusy || !selectedPlayer) return;
    const input = $('#player-identity');
    const err = $('#player-identity-error');
    const value = String(input?.value || '').trim();
    if (value.replace(/\D/g, '').length < 4) {
      if (err) err.textContent = 'Digite pelo menos os últimos 4 números.';
      return;
    }
    identityBusy = true;
    const btn = $('[data-act="confirm-player"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Abrindo…'; }
    if (err) err.textContent = '';
    try {
      const res = await fetch('/.netlify/functions/find-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ v: token, id: selectedPlayer.id, input: value })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.url) throw new Error(data.error || 'Não foi possível abrir seu perfil.');
      const target = safePlayerUrl(data.url);
      if (!target) throw new Error('Link de perfil inválido. Peça um novo link ao administrador.');
      saveProfile(selectedPlayer.id, target);
      window.location.href = target;
    } catch (e) {
      const raw = String(e && e.message || 'Não foi possível abrir seu perfil.');
      const message = /jogador não encontrado|número incorreto/i.test(raw) ? IDENTITY_ERROR : raw;
      if (err) err.textContent = message;
      identityBusy = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Abrir meu perfil →'; }
    }
  }

  async function load() {
    if (!/^VW-[A-F0-9]{16}$/.test(token)) {
      showError('Link incompleto. Peça o link novo ao administrador.');
      return;
    }
    const searchFocused = document.activeElement && document.activeElement.id === 'player-search';
    const cursor = searchFocused ? document.activeElement.selectionStart : null;
    try {
      const res = await fetch('/.netlify/functions/get-view?v=' + encodeURIComponent(token), { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showError(data.error || 'Link inválido.'); return; }
      current = data.snapshot || {};
      publicData = data;
      render(data.updatedAt);
      if (searchFocused) {
        const el = $('#player-search');
        if (el) { el.focus(); try { el.setSelectionRange(cursor, cursor); } catch (e) { /* ignore */ } }
      }
    } catch (e) {
      showError('Sem conexão. Tente recarregar em instantes.');
    }
  }

  document.addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-act="tab"]');
    if (tab) {
      activeTab = tab.dataset.tab === 'overview' ? 'overview' : 'players';
      render();
      return;
    }
    if (e.target.closest('[data-act="clear-profile"]')) {
      clearProfile();
      render();
      return;
    }
    const select = e.target.closest('[data-act="select-player"]');
    if (select) {
      const p = (current?.players || []).find((x) => x && x.id === select.dataset.id);
      if (p) {
        const saved = savedProfile();
        if (saved && saved.id === p.id) {
          const target = safePlayerUrl(saved.url);
          if (target) { window.location.href = target; }
          return;
        }
        openPlayerModal(p);
      }
      return;
    }
    if (e.target.closest('[data-act="close-player-modal"]')) { closePlayerModal(); return; }
    if (e.target.closest('[data-act="confirm-player"]')) { await confirmPlayer(); return; }

    const btn = e.target.closest('[data-act="copy-donation"]');
    if (!btn) return;
    const code = $('#donation-code');
    if (!code || !code.value) return;
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(code.value); ok = true; }
    } catch (err) { ok = false; }
    if (!ok) {
      const ta = $('#donation-code');
      ta.select();
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    }
    btn.textContent = ok ? '✅ Código copiado!' : '⚠️ Selecione e copie o código';
    setTimeout(() => { btn.textContent = '📋 Copiar código PIX'; }, 2500);
  });

  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'player-search') {
      playerQuery = e.target.value || '';
      applyPlayerFilter();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#view-modal').hidden) { closePlayerModal(); return; }
    if (e.key === 'Enter' && e.target && e.target.id === 'player-identity') {
      e.preventDefault();
      confirmPlayer();
    }
  });

  load();
  setInterval(load, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
