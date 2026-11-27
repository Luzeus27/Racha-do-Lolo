/* Acompanhamento ao vivo: get-view (somente leitura) */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const fmtDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  };
  const fmtHour = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };
  const stampNow = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const V = String(new URLSearchParams(location.search).get('v') || '').trim().toUpperCase();
  const valid = /^VW-[A-Z0-9]{16}$/.test(V);
  const state = { snapshot: {}, live: null, updatedAt: null };
  let lastSig = '';
  let loading = false;
  let offlineNotified = false;

  async function api(url) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 12000) : null;
    try {
      const opt = { cache: 'no-store' };
      if (ctrl) opt.signal = ctrl.signal;
      const res = await fetch(url, opt);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data && data.error) || 'Não foi possível carregar o placar.');
      return data;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function fatal(msg, status) {
    $('#live-status').textContent = status || 'Indisponível';
    $('#live-root').innerHTML = '<div class="card"><div class="card-body empty"><div class="emoji">🔗</div>' +
      '<h3>' + esc(status || 'Indisponível') + '</h3><p class="small muted">' + esc(msg) + '</p></div></div>';
  }

  function byId(snapshot) {
    const map = Object.create(null);
    (snapshot && Array.isArray(snapshot.players) ? snapshot.players : []).forEach((p) => {
      if (p && p.id) map[String(p.id)] = p;
    });
    return map;
  }

  /* drawHistory[0].teams é uma lista de times; cada time é uma lista de ids de jogadores. */
  function teamPlayers(snapshot, by) {
    const last = snapshot && Array.isArray(snapshot.drawHistory) ? snapshot.drawHistory[0] : null;
    const raw = last && Array.isArray(last.teams) ? last.teams : [];
    return raw.map((group) => {
      const ids = Array.isArray(group) ? group : (group && Array.isArray(group.players) ? group.players : []);
      return ids.map((x) => {
        const id = x && typeof x === 'object' ? (x.id || x.playerId) : x;
        const p = by[String(id)];
        return { id: String(id || ''), name: p && p.name ? String(p.name) : 'Jogador' };
      });
    });
  }

  function card(title, sub, body, right) {
    return '<div class="card"><div class="card-head"><div><strong>' + esc(title) + '</strong>' +
      '<div class="sub">' + esc(sub) + '</div></div>' +
      (right ? '<div class="right">' + right + '</div>' : '') +
      '</div><div class="card-body stack">' + body + '</div></div>';
  }

  function signature() {
    const live = state.live;
    const events = live && Array.isArray(live.events) ? live.events : [];
    return JSON.stringify({
      live: live ? {
        startedAt: live.startedAt,
        updatedAt: live.updatedAt,
        score: live.score,
        events: events.map((e) => [e && e.id, e && e.at, e && e.type, e && e.playerId, e && e.team, e && e.minute])
      } : null,
      teams: teamPlayers(state.snapshot, byId(state.snapshot))
    });
  }

  function waitingHtml() {
    return '<div class="card"><div class="card-head"><div><strong>Ao vivo</strong>' +
      '<div class="sub">Aguardando o início</div></div><div class="right"><span class="pill live">● Ao vivo</span></div></div>' +
      '<div class="card-body empty"><div class="emoji">⏱️</div><h3>Aguardando a partida</h3>' +
      '<p class="small muted">A partida ainda não começou. O organizador inicia o placar no app.</p>' +
      '<p class="tiny muted" style="margin-top:10px">Verificando novamente em 5 segundos…</p></div></div>';
  }

  const TEAM_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const TEAM_TONES = ['', 'b', 'c', 'd', 'e', 'f'];

  function teamKeysFrom(score, teams) {
    const fromScore = Object.keys(score || {}).filter((k) => TEAM_KEYS.includes(k)).length;
    const count = Math.min(TEAM_KEYS.length, Math.max(2, (Array.isArray(teams) ? teams.length : 0), fromScore));
    return TEAM_KEYS.slice(0, count);
  }

  function scoreHtml(live, teams) {
    const score = live.score || {};
    const keys = teamKeysFrom(score, teams);
    const body = '<div class="score-grid">' + keys.map((k, i) => {
      const list = teams[i] || [];
      const info = list.length ? list.length + ' jogador(es)' : 'Times ainda não disponíveis';
      return '<div class="score-team"><span class="team-tag ' + TEAM_TONES[i] + '">' + k + '</span>' +
        '<strong>Time ' + k + '</strong><div class="tiny muted">' + esc(info) + '</div>' +
        '<div class="score-value">' + esc(num(score[k])) + '</div></div>';
    }).join('') + '</div>';
    return card('Placar', 'Início ' + fmtDateTime(live.startedAt), body, '<span class="pill live">● Ao vivo</span>');
  }

  function teamLabel(team) {
    const s = String(team == null ? '' : team).toUpperCase();
    if (TEAM_KEYS.includes(s)) return s;
    if (s === '0') return 'A';
    if (s === '1') return 'B';
    return '';
  }

  function teamsHtml(teams) {
    const box = (label, list) => {
      const items = list.length
        ? list.map((p) => '<li><span class="muted tiny">•</span><span>' + esc(p.name) + '</span></li>').join('')
        : '<li class="muted tiny">Ainda não disponível</li>';
      return '<div class="team-box"><h4>Time ' + label + ' <span class="pill">' + esc(list.length) + ' jogador(es)</span></h4>' +
        '<ul>' + items + '</ul></div>';
    };
    const keys = teamKeysFrom({}, teams);
    return card('Times do último sorteio', 'Escalação por equipe',
      '<div class="grid grid-2">' + keys.map((k, i) => box(k, teams[i] || [])).join('') + '</div>');
  }

  function eventsHtml(live, by) {
    const list = (Array.isArray(live.events) ? live.events : []).map((e, i) => ({ e: e, i: i }));
    list.sort((x, y) => String((y.e && y.e.at) || '').localeCompare(String((x.e && x.e.at) || '')) || y.i - x.i);
    const rows = list.slice(0, 25).map((row) => {
      const e = row.e || {};
      const type = String(e.type || '').toLowerCase();
      const icon = type === 'goal' ? '⚽' : type === 'assist' ? '🅰️' : type === 'card' ? '🟨' : '•';
      const label = type === 'goal' ? 'Gol' : type === 'assist' ? 'Assistência' : type === 'card' ? 'Cartão' : 'Evento';
      const player = by[String(e.playerId)];
      const name = player && player.name ? player.name : 'Jogador';
      const team = teamLabel(e.team);
      const minute = (e.minute === 0 || e.minute) ? esc(e.minute) + "'" : '';
      const at = fmtHour(e.at);
      return '<div class="list-row spread"><div class="row"><span>' + icon + '</span><strong>' + esc(label) + '</strong>' +
        '<span class="small muted">' + esc(name) + '</span></div><div class="row">' +
        (team ? '<span class="pill">' + esc(team) + '</span>' : '') +
        (minute ? '<span class="tiny mono">' + minute + '</span>' : '') +
        (at ? '<span class="tiny muted">' + esc(at) + '</span>' : '') +
        '</div></div>';
    }).join('');
    return card('Eventos recentes', 'Gols, assistências e cartões',
      rows || '<p class="small muted">Nenhum evento registrado ainda.</p>');
  }

  function render() {
    const sig = signature();
    if (sig === lastSig) return;
    lastSig = sig;
    if (!state.live) {
      $('#live-root').innerHTML = waitingHtml();
      return;
    }
    const by = byId(state.snapshot);
    const teams = teamPlayers(state.snapshot, by);
    $('#live-root').innerHTML = scoreHtml(state.live, teams) + teamsHtml(teams) + eventsHtml(state.live, by);
  }

  async function load() {
    if (!valid || loading) return;
    loading = true;
    try {
      const data = await api('/.netlify/functions/get-view?v=' + encodeURIComponent(V));
      if (!data) throw new Error('Resposta inválida do servidor.');
      state.snapshot = data.snapshot || {};
      state.live = data.live || null;
      state.updatedAt = data.updatedAt || null;
      offlineNotified = false;
      $('#live-status').textContent = (state.live ? 'Ao vivo · atualizado às ' : 'Aguardando a partida · verificado às ') + stampNow();
      render();
    } catch (err) {
      if (!offlineNotified) {
        offlineNotified = true;
        if (lastSig) $('#live-root').insertAdjacentHTML('afterbegin',
          '<div class="banner" role="status">⚠️ Sem conexão. Tentando novamente em instantes.</div>');
        else fatal('Não foi possível carregar o placar. Verifique sua conexão e tente novamente.', 'Sem conexão');
      }
      if (lastSig) $('#live-status').textContent = 'Sem conexão · tentando novamente…';
    } finally {
      loading = false;
    }
  }

  if (!valid) {
    fatal('Link incompleto ou inválido. Peça ao organizador o link de acompanhamento ao vivo (parâmetro v).', 'Link inválido');
    return;
  }

  load();
  setInterval(load, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
