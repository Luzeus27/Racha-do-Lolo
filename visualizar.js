/* Visão somente leitura do racha, alimentada por /.netlify/functions/get-view */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

  const token = String(new URLSearchParams(location.search).get('v') || '').trim().toUpperCase();
  let current = null;

  function card(title, sub, body) {
    return `<div class="card"><div class="card-head"><div><strong>${esc(title)}</strong><div class="sub">${esc(sub)}</div></div></div><div class="card-body stack">${body}</div></div>`;
  }

  function avatar(p) {
    if (p && typeof p.photo === 'string' && p.photo.startsWith('data:image/')) {
      return `<img class="avatar" src="${esc(p.photo)}" alt="">`;
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

  function renderNextGames(s, byId) {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = (s.games || [])
      .filter((g) => g && g.date && g.date >= today)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, 6);
    if (!upcoming.length) {
      return card('Próximos jogos', 'Agenda do racha', '<p class="small muted">Nenhum jogo futuro cadastrado.</p>');
    }
    const rows = upcoming.map((g) => {
      const confirmed = Array.isArray((s.confirmations || {})[g.id]) ? s.confirmations[g.id] : [];
      const names = confirmed.slice(0, 8).map((id) => esc((byId[id] || {}).name || '')).filter(Boolean).join(', ');
      return `<div class="person"><span class="pill">${esc(fmtDate(g.date))}</span><span style="flex:1"><strong>${confirmed.length} confirmado(s)</strong><div class="tiny muted">${names || 'Aguardando confirmações'}${confirmed.length > 8 ? '…' : ''}</div></span></div>`;
    }).join('');
    return card('Próximos jogos', 'Datas e presença confirmada', rows);
  }

  function renderConfirmations(s, byId) {
    const entries = Object.keys(s.confirmations || {}).filter((k) => Array.isArray(s.confirmations[k]) && s.confirmations[k].length);
    if (!entries.length) return card('Confirmados', 'Presença por jogo', '<p class="small muted">Nenhuma confirmação registrada.</p>');
    const game = (s.games || []).find((g) => g.id === entries[0]);
    const label = game ? fmtDate(game.date) : 'Jogo';
    const list = s.confirmations[entries[0]].map((id) => byId[id]).filter(Boolean);
    return card('Confirmados', 'Presença confirmada · ' + label,
      `<div class="grid-2" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:4px 16px">${list.map((p) => person(p)).join('')}</div>`);
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
      fairPlay: num(st.ptsFairPlay), punctual: num(st.ptsPunctual), card: num(st.ptsCard)
    };
    const totals = {};
    (s.scores || []).forEach((sc) => {
      if (!sc || !sc.playerId) return;
      const t = totals[sc.playerId] || (totals[sc.playerId] = { points: 0, goals: 0, assists: 0 });
      t.goals += num(sc.goals);
      t.assists += num(sc.assists);
      t.points += num(sc.goals) * pts.goal + num(sc.assists) * pts.assist + num(sc.presence) * pts.presence +
        num(sc.fairPlay) * pts.fairPlay + num(sc.punctual) * pts.punctual + num(sc.cards) * pts.card;
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

  function render(updatedAt) {
    const s = current || {};
    const byId = {};
    (s.players || []).forEach((p) => { if (p && p.id) byId[p.id] = p; });
    $('#view-status').textContent = 'Atualizado em ' + fmtTime(updatedAt || s.publishedAt) + ' · atualização automática';
    $('#view-root').innerHTML = [
      renderNextGames(s, byId),
      renderConfirmations(s, byId),
      renderDraw(s, byId),
      renderRanking(s, byId),
      renderFinance(s)
    ].join('');
  }

  async function load() {
    if (!/^VW-[A-F0-9]{16}$/.test(token)) {
      showError('Link incompleto. Peça o link novo ao administrador.');
      return;
    }
    try {
      const res = await fetch('/.netlify/functions/get-view?v=' + encodeURIComponent(token), { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showError(data.error || 'Link inválido.'); return; }
      current = data.snapshot || {};
      render(data.updatedAt);
    } catch (e) {
      showError('Sem conexão. Tente recarregar em instantes.');
    }
  }

  load();
  setInterval(load, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
