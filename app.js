/* ============================================================
   Racha do Loló — aplicativo offline-first
   Todos os dados ficam no localStorage deste navegador.
   ============================================================ */
'use strict';

const STORAGE_KEY = 'racha-do-lolo-v1';
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTH_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const EXPENSE_CATS = ['Quadra', 'Goleiros', 'Arbitragem', 'Churrasco', 'Material', 'Outros'];
const CASH_ROWS = ['Quadra', 'Goleiros', 'Arbitragem', 'Churrasco', 'Material', 'Outros', 'Brindes', 'Benefícios'];

const PAGES = {
  dashboard:  { title: 'Visão geral',      sub: 'Acompanhe o caixa, os jogos e o desempenho do racha', ico: '🏠' },
  players:    { title: 'Jogadores',        sub: 'Cadastro, perfis e status dos integrantes', ico: '👥' },
  payments:   { title: 'Mensalidades',     sub: 'Controle do que foi pago mês a mês', ico: '💳' },
  games:      { title: 'Jogos & Diárias',  sub: 'Agenda, presença e receita por jogo', ico: '🎟️' },
  expenses:   { title: 'Despesas',         sub: 'Tudo que sai do caixa do racha', ico: '🧾' },
  benefits:   { title: 'Benefícios',       sub: 'Incentivos e descontos concedidos aos mensalistas', ico: '🎖️' },
  cash:       { title: 'Fluxo de caixa',   sub: 'Receitas, despesas, reserva e metas do ano', ico: '💰' },
  simulator:  { title: 'Simulador',        sub: 'Teste cenários de mensalidade e diaristas', ico: '📊' },
  scores:     { title: 'Pontuação',        sub: 'Lançamento mensal de gols, assistências e presença', ico: '⚽' },
  ranking:    { title: 'Ranking',          sub: 'Campeonato interno trimestral e anual', ico: '🏆' },
  awards:     { title: 'Premiações',       sub: 'Vencedores do mês e brindes entregues', ico: '🎁' },
  settings:   { title: 'Configurações',    sub: 'Premissas, backup e limpeza de dados', ico: '⚙️' }
};

const NAV = [
  { group: 'Gestão', items: ['dashboard', 'players', 'payments', 'games', 'expenses', 'benefits', 'cash'] },
  { group: 'Desempenho', items: ['scores', 'ranking', 'awards'] },
  { group: 'Planejamento', items: ['simulator', 'settings'] }
];

/* ------------------------------------------------------------
   Utilitários
   ------------------------------------------------------------ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num(v));
const compactMoney = (v) => { const n = num(v); return (n < 0 ? '-' : '') + 'R$ ' + Math.abs(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 }); };
const monthName = (m) => MONTH_FULL[num(m) - 1] || '—';
const shortMonth = (m) => MONTHS[num(m) - 1] || '—';
const isoDate = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
};
const todayISO = () => { const d = new Date(); return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const sum = (arr, fn) => arr.reduce((a, x) => a + num(fn(x)), 0);

function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind === 'err' ? 'err' : 'ok');
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function download(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { /* fallback abaixo */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}

/* ---------- cores personalizadas ---------- */
const COLOR_PRESETS = {
  padrao: { accent: '#35d07f', secondary: '#48a9f8', label: 'Verde padrão' },
  azul: { accent: '#3b82f6', secondary: '#22d3ee', label: 'Azul' },
  roxo: { accent: '#a78bfa', secondary: '#f472b6', label: 'Roxo' },
  laranja: { accent: '#fb923c', secondary: '#facc15', label: 'Laranja' },
  rosa: { accent: '#fb7185', secondary: '#c084fc', label: 'Rosa' }
};
let colors = (() => {
  try { return { ...COLOR_PRESETS.padrao, ...(JSON.parse(localStorage.getItem('racha-colors')) || {}) }; }
  catch (e) { return { ...COLOR_PRESETS.padrao }; }
})();
let deferredPrompt = null;

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function shade(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const f = v => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  return '#' + [f(r), f(g), f(b)].map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
}
function rgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function applyColors() {
  document.body.style.setProperty('--accent', colors.accent);
  document.body.style.setProperty('--accent-dark', shade(colors.accent, -0.25));
  document.body.style.setProperty('--accent-soft', rgba(colors.accent, 0.12));
  document.body.style.setProperty('--blue', colors.secondary);
  document.body.style.setProperty('--blue-soft', rgba(colors.secondary, 0.12));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', colors.accent);
}
function saveColors() {
  try { localStorage.setItem('racha-colors', JSON.stringify(colors)); } catch (e) { /* ignore */ }
  applyColors();
}

/* ---------- PIX e link de cobrança ---------- */
function emvField(id, value) {
  const v = String(value);
  return id + String(v.length).padStart(2, '0') + v;
}
function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc;
}
function pixCode(amount, txid) {
  const s = settings();
  const key = String(s.pixKey || '').trim();
  if (!key) return '';
  const norm = (v, max) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, max);
  const payload =
    emvField('00', '01') +
    emvField('26', emvField('00', 'BR.GOV.BCB.PIX') + emvField('01', key)) +
    emvField('52', '0000') +
    emvField('53', '986') +
    emvField('54', Number(amount).toFixed(2)) +
    emvField('58', 'BR') +
    emvField('59', norm(s.pixMerchant || 'RACHA DO LOLO', 25)) +
    emvField('60', norm(s.pixCity || 'SAO PAULO', 15)) +
    emvField('62', emvField('05', String(txid || 'RL').slice(0, 25))) +
    '6304';
  const crc = crc16(payload).toString(16).toUpperCase().padStart(4, '0');
  return payload + crc;
}
function txidFor(playerId, month) { return 'RL' + year() + String(month).padStart(2, '0') + String(playerId).slice(-4).toUpperCase(); }
function paymentLink(playerId, month, amount) {
  const base = location.href.split('#')[0];
  return `${base}#cobranca/${encodeURIComponent(playerId)}/${month}/${Number(amount).toFixed(2)}`;
}
/* ---------- comprovante de pagamento ---------- */
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
function ensureReceipt(rec) {
  if (!rec.receiptId) rec.receiptId = 'RL-' + rec.year + '-' + String(rec.month).padStart(2, '0') + '-' + String(rec.playerId).slice(-4).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  if (!rec.paidAt) rec.paidAt = new Date().toISOString();
  return rec;
}
function receiptLines(rec) {
  const p = playerById(rec.playerId);
  return [
    ['Pagamento recebido de', p?.name || 'Jogador'],
    ['Mensalidade', monthName(rec.month) + '/' + rec.year],
    ['Valor', money(rec.amount)],
    ['Forma de pagamento', rec.origem === 'link' ? 'PIX / Link de cobrança' : 'Baixa registrada no app'],
    ['ID da transação', rec.txid || 'Não informado'],
    ['Data e hora', fmtDateTime(rec.paidAt)],
    ['Status', 'PAGO']
  ];
}
function receiptText(rec) {
  return [
    'COMPROVANTE DE PAGAMENTO - RACHA DO LOLO',
    'Recibo: ' + (rec.receiptId || ''),
    '',
    ...receiptLines(rec).map(([k, v]) => `${k}: ${v}`),
    '',
    'Documento gerado pelo aplicativo Racha do Loló.'
  ].join('\n');
}
function receiptHTML(rec, compact = false) {
  const lines = receiptLines(rec);
  return `<div class="receipt ${compact ? 'compact' : ''}">
    <div class="receipt-top">
      <div class="receipt-logo">RL</div>
      <div><strong>RACHA DO LOLO</strong><span>Comprovante de pagamento</span></div>
    </div>
    <div class="receipt-id">RECIBO ${esc(rec.receiptId || '')}</div>
    <div class="receipt-amount">${money(rec.amount)}</div>
    <div class="receipt-status">✅ PAGAMENTO CONFIRMADO</div>
    <div class="receipt-lines">
      ${lines.map(([k, v]) => `<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}
    </div>
    <div class="receipt-foot">Documento gerado pelo app Racha do Loló · registro interno</div>
  </div>`;
}
function modalReceipt(recId) {
  const rec = state.payments.find(x => x.id === recId);
  if (!rec) return;
  openModal('Comprovante de pagamento', 'Baixa registrada com sucesso', `
    ${receiptHTML(rec)}
    <div class="row mt" style="justify-content:flex-end">
      <button class="btn btn-ghost" data-act="copy-receipt" data-id="${rec.id}">📋 Copiar texto</button>
      <button class="btn btn-ghost" data-act="download-receipt" data-id="${rec.id}">🖼️ Baixar PNG</button>
      <button class="btn btn-primary" data-act="print-receipt" data-id="${rec.id}">🖨️ Salvar em PDF</button>
    </div>`, true);
}
function receiptById(id) {
  return state.payments.find(x => x.id === id) || (ui.paymentPage
    ? state.payments.find(x => x.playerId === ui.paymentPage.playerId && x.month === ui.paymentPage.month && x.year === year())
    : null);
}
function downloadReceiptPNG(rec) {
  const W = 720, H = 900;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, W, 180);
  grad.addColorStop(0, colors.accent); grad.addColorStop(1, colors.secondary);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, 180);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px Arial'; ctx.fillText('RACHA DO LOLO', 48, 78);
  ctx.font = '18px Arial'; ctx.fillText('Comprovante de pagamento', 48, 112);
  ctx.font = 'bold 46px Arial'; ctx.fillText('RL', W - 118, 100);
  ctx.fillStyle = '#6b7a90'; ctx.font = '14px monospace'; ctx.fillText('RECIBO ' + (rec.receiptId || ''), 48, 222);
  ctx.fillStyle = '#16213a'; ctx.font = 'bold 52px Arial'; ctx.fillText(money(rec.amount), 48, 294);
  ctx.fillStyle = colors.accent; ctx.font = 'bold 18px Arial'; ctx.fillText('PAGAMENTO CONFIRMADO', 48, 332);
  ctx.strokeStyle = '#e3e9f2'; ctx.beginPath(); ctx.moveTo(48, 360); ctx.lineTo(W - 48, 360); ctx.stroke();
  let y = 406;
  receiptLines(rec).forEach(([k, v]) => {
    ctx.fillStyle = '#7a889e'; ctx.font = '15px Arial'; ctx.fillText(k, 48, y);
    ctx.fillStyle = '#16213a'; ctx.font = 'bold 17px Arial';
    const text = String(v);
    const max = 360;
    let line = '', yy = y;
    text.split(' ').forEach(word => {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > max) { ctx.fillText(line, W - 48 - ctx.measureText(line).width, yy); line = word; yy += 24; }
      else line = test;
    });
    if (line) ctx.fillText(line, W - 48 - ctx.measureText(line).width, yy);
    y += Math.max(46, (yy - y) + 46);
  });
  ctx.strokeStyle = '#e3e9f2'; ctx.beginPath(); ctx.moveTo(48, H - 110); ctx.lineTo(W - 48, H - 110); ctx.stroke();
  ctx.fillStyle = '#94a3b8'; ctx.font = '13px Arial';
  ctx.fillText('Documento gerado pelo app Racha do Loló - registro interno', 48, H - 74);
  ctx.fillText('Emitido em ' + fmtDateTime(new Date().toISOString()), 48, H - 50);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = 'comprovante-' + (rec.receiptId || 'pagamento') + '.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function printReceipt(rec) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Comprovante ${esc(rec.receiptId || '')}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body { font-family: Arial, sans-serif; color: #16213a; margin: 0; }
    .top { background: ${colors.accent}; color: #fff; padding: 24px; border-radius: 12px; display: flex; align-items: center; gap: 14px; }
    .logo { width: 52px; height: 52px; border-radius: 12px; background: rgba(255,255,255,.2); display: grid; place-items: center; font-weight: 900; font-size: 18px; }
    .top strong { font-size: 20px; display: block; }
    .top span { font-size: 12px; opacity: .9; }
    .id { font-family: monospace; color: #64748b; margin: 24px 0 6px; font-size: 12px; }
    .amount { font-size: 40px; font-weight: 900; }
    .status { color: ${colors.accent}; font-weight: 800; margin: 6px 0 22px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 11px 0; border-bottom: 1px solid #e8edf5; font-size: 14px; }
    td:first-child { color: #64748b; width: 45%; }
    td:last-child { text-align: right; font-weight: 700; }
    .foot { margin-top: 44px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e8edf5; padding-top: 14px; }
  </style></head><body>
    <div class="top"><div class="logo">RL</div><div><strong>RACHA DO LOLO</strong><span>Comprovante de pagamento</span></div></div>
    <div class="id">RECIBO ${esc(rec.receiptId || '')}</div>
    <div class="amount">${money(rec.amount)}</div>
    <div class="status">PAGAMENTO CONFIRMADO</div>
    <table>${receiptLines(rec).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
    <div class="foot">Documento gerado pelo aplicativo Racha do Loló · registro interno<br>Emitido em ${esc(fmtDateTime(new Date().toISOString()))}</div>
  </body></html>`;
  const w = window.open('', '_blank', 'width=760,height=900');
  if (!w) { toast('Permita pop-ups para salvar o PDF.', 'err'); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 500);
}

function resizePhoto(file, done) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      done(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => done(null);
    img.src = reader.result;
  };
  reader.onerror = () => done(null);
  reader.readAsDataURL(file);
}

/* ------------------------------------------------------------
   Estado e dados iniciais
   ------------------------------------------------------------ */
function defaultSettings() {
  return {
    year: 2027, monthlyFee: 60, dayFee: 20, fieldRent: 825,
    goalkeepers: 2, goalkeeperFee: 30, gamesPerMonth: 4,
    bbqCostPerPerson: 40, bbqPeople: 18, giftsReserve: 100, bbqPerYear: 3,
    ptsGoal: 3, ptsAssist: 2, ptsPresence: 1, ptsFairPlay: 5, ptsPunctual: 2, ptsCard: -3,
    dayPlayersPerGame: 6, plannedMembers: 18, initialCash: 300, refereeFee: 0,
    pixKey: '', pixMerchant: 'RACHA DO LOLO', pixCity: 'SAO PAULO'
  };
}

function emptyState() {
  return {
    version: 1,
    settings: defaultSettings(),
    players: [], payments: [], dayEntries: [], expenses: [], games: [],
    benefits: [], scores: [], awards: []
  };
}

function makeDemoState() {
  const s = emptyState();
  const p = (id, name, type, position, phone, note) => ({ id, name, type, position, phone, note, active: true, demo: true });
  s.players = [
    p('p1', 'Rafael Souza', 'Mensalista', 'Linha', '11999990001', 'Capitão'),
    p('p2', 'Diego Alves', 'Mensalista', 'Meia', '11999990002', ''),
    p('p3', 'Bruno Lima', 'Mensalista', 'Zaga', '11999990003', ''),
    p('p4', 'Lucas Prado', 'Mensalista', 'Ataque', '11999990004', ''),
    p('p5', 'Thiago Nunes', 'Mensalista', 'Linha', '11999990005', ''),
    p('p6', 'Marcos Gomes', 'Mensalista', 'Goleiro', '11999990006', 'Titular'),
    p('p7', 'Felipe Rocha', 'Mensalista', 'Linha', '11999990007', ''),
    p('p8', 'Gustavo Melo', 'Mensalista', 'Meia', '11999990008', ''),
    p('p9', 'Pedro Santos', 'Diarista', 'Ataque', '11988880001', ''),
    p('p10', 'João Pereira', 'Diarista', 'Linha', '11988880002', ''),
    p('p11', 'Neto Costa', 'Diarista', 'Zaga', '11988880003', ''),
    p('p12', 'Caio Ribeiro', 'Diarista', 'Meia', '11988880004', ''),
    p('p13', 'Beto Martins', 'Diarista', 'Linha', '11988880005', ''),
    p('p14', 'Igor Freitas', 'Diarista', 'Goleiro', '11988880006', '')
  ];
  const members = s.players.filter(x => x.type === 'Mensalista');
  const dailies = s.players.filter(x => x.type === 'Diarista');

  for (let m = 1; m <= 3; m++) {
    members.forEach((pl, i) => {
      if ((i + m) % 5 !== 0) s.payments.push({ id: uid(), playerId: pl.id, month: m, year: 2027, amount: 60, paid: true, demo: true });
    });
    const days = [];
    let d = 1 + ((4 - new Date(2027, m - 1, 1).getDay() + 7) % 7);
    while (d <= new Date(2027, m, 0).getDate()) { days.push(d); d += 7; }
    days.forEach(day => {
      const date = isoDate(2027, m, day);
      const gid = 'g' + m + '-' + day;
      s.games.push({ id: gid, date, month: m, year: 2027, done: true, demo: true });
      dailies.forEach((dp, i) => {
        s.dayEntries.push({ id: uid(), gameId: gid, date, month: m, year: 2027, playerId: dp.id, amount: 20, demo: true });
      });
    });
    s.expenses.push({ id: uid(), date: isoDate(2027, m, 5), month: m, year: 2027, category: 'Quadra', description: `Aluguel de ${monthName(m)}`, amount: 825, demo: true });
    s.expenses.push({ id: uid(), date: isoDate(2027, m, 28), month: m, year: 2027, category: 'Goleiros', description: '2 goleiros × 4 jogos', amount: 240, demo: true });
    s.awards.push({ id: uid(), month: m, year: 2027, gift: m === 3 ? 'Churrasco de encerramento' : 'Brinde do mês', cost: 100, delivered: m < 3, demo: true });
    s.players.forEach((pl, i) => {
      s.scores.push({
        id: uid(), month: m, year: 2027, playerId: pl.id,
        goals: (i * 7 + m * 3) % 4, assists: (i * 3 + m) % 3,
        presence: 2 + ((i + m) % 3), fairPlay: (i + m) % 5 !== 0 ? 1 : 0,
        punctual: (i + m) % 4 !== 0 ? 1 : 0, cards: (i + m) % 7 === 0 ? 1 : 0, demo: true
      });
    });
  }
  s.expenses.push({ id: uid(), date: '2027-02-16', month: 2, year: 2027, category: 'Material', description: 'Bola e coletes', amount: 120, demo: true });
  s.expenses.push({ id: uid(), date: '2027-03-20', month: 3, year: 2027, category: 'Churrasco', description: 'Churrasco do trimestre', amount: 720, demo: true });
  s.benefits.push({ id: uid(), date: '2027-01-14', month: 1, year: 2027, playerId: 'p1', type: 'Camisa/colete', amount: 45, fromCash: true, note: 'Primeiro uniforme', demo: true });
  return s;
}

let state;
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  state = raw ? JSON.parse(raw) : makeDemoState();
  if (!state || !state.settings) state = makeDemoState();
} catch (e) { state = makeDemoState(); }

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Não foi possível salvar no navegador.', 'err'); }
}
function settings() { return state.settings; }
function year() { return num(state.settings.year) || 2027; }

const ui = {
  page: 'dashboard',
  payMonth: null,
  scoreMonth: null,
  awardMonth: null,
  cashMonth: null,
  gameTab: 'games',
  rankFilter: 'year',
  sim: null,
  search: '',
  playerFilter: 'all'
};

/* ------------------------------------------------------------
   Cálculos derivados
   ------------------------------------------------------------ */
function activePlayers() { return state.players.filter(p => p.active !== false); }
function playerById(id) { return state.players.find(p => p.id === id) || null; }
function playerName(id) { return playerById(id)?.name || 'Jogador removido'; }

function meta() {
  const s = settings();
  const fixed = num(s.fieldRent) + num(s.goalkeepers) * num(s.goalkeeperFee) * num(s.gamesPerMonth) + num(s.refereeFee) * num(s.gamesPerMonth);
  const bbqAnnual = num(s.bbqCostPerPerson) * num(s.bbqPeople) * num(s.bbqPerYear);
  const bbqMonthly = bbqAnnual / 12;
  return { fixed, bbqAnnual, bbqMonthly, base: fixed + bbqMonthly, withGifts: fixed + bbqMonthly + num(s.giftsReserve) };
}

function revenue(m) {
  const y = year();
  const mens = sum(state.payments.filter(p => p.year === y && p.month === m && p.paid !== false), p => p.amount);
  const dias = sum(state.dayEntries.filter(d => d.year === y && d.month === m), d => d.amount);
  return { mens, dias, total: mens + dias };
}

function expenses(m) {
  const y = year();
  const byCat = {};
  CASH_ROWS.forEach(c => byCat[c] = 0);
  state.expenses.filter(e => e.year === y && e.month === m).forEach(e => {
    const cat = CASH_ROWS.includes(e.category) ? e.category : 'Outros';
    byCat[cat] += num(e.amount);
  });
  byCat['Benefícios'] = sum(state.benefits.filter(b => b.year === y && b.month === m && b.fromCash), b => b.amount);
  byCat['Brindes'] = sum(state.awards.filter(a => a.year === y && a.month === m), a => a.cost);
  const total = CASH_ROWS.reduce((a, c) => a + byCat[c], 0);
  return { byCat, total };
}

function cashRows() {
  let acc = num(settings().initialCash), paidBbq = 0;
  const m = meta();
  const rows = [];
  for (let i = 1; i <= 12; i++) {
    const rev = revenue(i), exp = expenses(i);
    const balance = rev.total - exp.total;
    acc += balance;
    paidBbq += exp.byCat['Churrasco'];
    rows.push({
      month: i, rev, exp, balance, acc,
      reserveTarget: m.bbqMonthly * i, reservePaid: paidBbq,
      reserveDiff: paidBbq - m.bbqMonthly * i,
      metaTarget: m.withGifts, metaDiff: rev.total - m.withGifts
    });
  }
  return rows;
}

function currentMonth() {
  if (ui.page === 'scores' && ui.scoreMonth) return num(ui.scoreMonth);
  if (ui.page === 'awards' && ui.awardMonth) return num(ui.awardMonth);
  if (ui.page === 'payments' && ui.payMonth) return num(ui.payMonth);
  const y = year();
  const candidates = [
    ...state.payments.map(x => x.month), ...state.dayEntries.map(x => x.month),
    ...state.expenses.map(x => x.month), ...state.scores.map(x => x.month)
  ].filter(m => m >= 1 && m <= 12);
  return candidates.length ? Math.max(...candidates) : (new Date().getMonth() + 1);
}

function scorePoints(sc) {
  const s = settings();
  return num(sc.goals) * num(s.ptsGoal) + num(sc.assists) * num(s.ptsAssist) + num(sc.presence) * num(s.ptsPresence)
    + (sc.fairPlay ? num(s.ptsFairPlay) : 0) + (sc.punctual ? num(s.ptsPunctual) : 0) + num(sc.cards) * num(s.ptsCard);
}

function rankingFor(filter) {
  const map = new Map();
  state.scores.filter(sc => sc.year === year() && (filter === 'year' || Math.ceil(num(sc.month) / 3) === filter)).forEach(sc => {
    if (!map.has(sc.playerId)) map.set(sc.playerId, { playerId: sc.playerId, goals: 0, assists: 0, presence: 0, points: 0, games: 0 });
    const r = map.get(sc.playerId);
    r.goals += num(sc.goals); r.assists += num(sc.assists); r.presence += num(sc.presence);
    r.points += scorePoints(sc); r.games += 1;
  });
  return [...map.values()].sort((a, b) => b.points - a.points || b.goals - a.goals).map((r, i) => ({ ...r, pos: i + 1, player: playerById(r.playerId) }));
}

function autoWinners(m) {
  const list = state.scores.filter(sc => sc.year === year() && sc.month === m);
  const best = (fn) => list.slice().sort((a, b) => fn(b) - fn(a) || a.playerId.localeCompare(b.playerId))[0]?.playerId || '';
  return { goals: best(x => num(x.goals)), assists: best(x => num(x.assists)), points: best(x => scorePoints(x)) };
}

function simulate(members, fee, dayPerGame, dayFee, games) {
  const m = meta().withGifts;
  return num(members) * num(fee) + num(dayPerGame) * num(dayFee) * num(games) - m;
}
function breakEvenMembers(fee, dayPerGame, dayFee, games) {
  const other = num(dayPerGame) * num(dayFee) * num(games);
  const need = meta().withGifts - other;
  return need <= 0 ? 0 : Math.ceil(need / Math.max(1, num(fee)));
}

/* ------------------------------------------------------------
   Helpers de render
   ------------------------------------------------------------ */
const badge = (text, kind = '') => `<span class="badge ${kind}">${esc(text)}</span>`;
const avatarHTML = (p, small = false) => {
  const cls = 'avatar' + (small ? ' sm' : '') + (p?.photo ? ' photo' : '');
  return p?.photo
    ? `<span class="${cls}" style="background-image:url('${p.photo}')"></span>`
    : `<span class="${cls}">${esc(initials(p?.name))}</span>`;
};
const playerCell = (p, sub) => p
  ? `<div class="player-cell">${avatarHTML(p, true)}<span><strong>${esc(p.name)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</span></div>`
  : '<span class="muted">—</span>';

function empty(title, text, action = '') {
  return `<div class="empty"><div class="emoji">⚽</div><h3>${esc(title)}</h3><p class="small">${esc(text)}</p>${action ? `<div class="mt">${action}</div>` : ''}</div>`;
}
function section(title, sub = '', right = '') {
  return `<div class="card-head"><div><h3>${esc(title)}</h3>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>${right ? `<div class="right">${right}</div>` : ''}</div>`;
}
function selectMonths(id, value, all = false) {
  const opts = all ? `<option value="all" ${value === 'all' ? 'selected' : ''}>Ano todo</option>` : '';
  return `<select id="${id}">${opts}${MONTHS.map((m, i) => `<option value="${i + 1}" ${num(value) === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select>`;
}

function svgBars(rows) {
  const W = 640, H = 230, L = 48, R = 10, T = 12, B = 30;
  const max = Math.max(1, ...rows.flatMap(r => [r.rev.total, r.exp.total]));
  const gw = (W - L - R) / 12, bw = Math.min(14, gw / 3);
  const y = v => T + (H - T - B) * (1 - v / max);
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const v = max * i / 4, yy = y(v);
    g += `<line x1="${L}" y1="${yy}" x2="${W - R}" y2="${yy}" stroke="var(--border-soft)" stroke-dasharray="3 4"/><text x="${L - 8}" y="${yy + 3}" text-anchor="end">${compactMoney(v)}</text>`;
  }
  rows.forEach((r, i) => {
    const cx = L + gw * i + gw / 2;
    g += `<rect x="${cx - bw - 2}" y="${y(r.rev.total)}" width="${bw}" height="${Math.max(0, H - B - y(r.rev.total))}" rx="3" fill="var(--accent)"/>`;
    g += `<rect x="${cx + 2}" y="${y(r.exp.total)}" width="${bw}" height="${Math.max(0, H - B - y(r.exp.total))}" rx="3" fill="var(--red)"/>`;
    g += `<text x="${cx}" y="${H - 9}" text-anchor="middle">${MONTHS[i]}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Receitas e despesas por mês">${g}</svg>
    <div class="legend"><span><i style="background:var(--accent)"></i>Receitas</span><span><i style="background:var(--red)"></i>Despesas</span></div>`;
}

function svgLine(rows) {
  const W = 640, H = 230, L = 52, R = 12, T = 14, B = 30;
  const vals = rows.map(r => r.acc);
  const min = Math.min(0, ...vals), max = Math.max(1, ...vals);
  const x = i => L + (W - L - R) * i / 11;
  const y = v => T + (H - T - B) * (1 - (v - min) / (max - min));
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const area = `${x(0)},${y(min)} ${pts} ${x(11)},${y(min)}`;
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const v = min + (max - min) * i / 4, yy = y(v);
    g += `<line x1="${L}" y1="${yy}" x2="${W - R}" y2="${yy}" stroke="var(--border-soft)" stroke-dasharray="3 4"/><text x="${L - 8}" y="${yy + 3}" text-anchor="end">${compactMoney(v)}</text>`;
  }
  g += `<polygon points="${area}" fill="var(--blue-soft)"/><polyline points="${pts}" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linejoin="round"/>`;
  rows.forEach((r, i) => { g += `<circle cx="${x(i)}" cy="${y(r.acc)}" r="3.5" fill="var(--blue)"><title>${MONTHS[i]}: ${money(r.acc)}</title></circle><text x="${x(i)}" y="${H - 9}" text-anchor="middle">${MONTHS[i]}</text>`; });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo acumulado">${g}</svg>`;
}

/* ------------------------------------------------------------
   Páginas
   ------------------------------------------------------------ */
function pageDashboard() {
  const rows = cashRows(), m = currentMonth(), r = rows[m - 1], mm = meta();
  const membersPaid = state.payments.filter(p => p.year === year() && p.month === m && p.paid !== false).length;
  const membersTotal = activePlayers().filter(p => p.type === 'Mensalista').length;
  const progress = Math.min(100, Math.max(0, r.rev.total / mm.withGifts * 100));
  const reservePct = mm.bbqAnnual ? Math.min(100, Math.max(0, r.reservePaid / mm.bbqAnnual * 100)) : 0;

  const nextGames = state.games.filter(g => g.year === year()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const pending = activePlayers().filter(p => p.type === 'Mensalista' && !state.payments.some(x => x.playerId === p.id && x.month === m && x.year === year() && x.paid !== false)).slice(0, 5);

  const activities = [];
  state.expenses.forEach(e => activities.push({ date: e.date, text: `${e.description} · ${money(e.amount)}`, kind: 'Despesa', ico: '🧾' }));
  state.payments.filter(p => p.paid !== false).forEach(p => activities.push({ date: `${year()}-${String(p.month).padStart(2, '0')}-01`, text: `Mensalidade de ${shortMonth(p.month)} · ${playerName(p.playerId)}`, kind: 'Receita', ico: '💳' }));
  state.dayEntries.forEach(d => activities.push({ date: d.date, text: `Diária · ${playerName(d.playerId)}`, kind: 'Receita', ico: '🎟️' }));
  activities.sort((a, b) => b.date.localeCompare(a.date));

  return `
    ${hasDemo() ? `<div class="banner">🎯 <span>Você está vendo <strong>dados de demonstração</strong>. Apague-os quando quiser começar de verdade.</span><button class="btn btn-sm" data-act="clear-demo">Limpar demonstração</button></div>` : ''}
    <div class="grid grid-4">
      <div class="card kpi ${r.acc < 0 ? 'red' : ''}"><div class="label">Saldo acumulado</div><div class="value ${r.acc < 0 ? 'negative' : 'positive'} mono">${money(r.acc)}</div><div class="foot">inclui saldo inicial de ${money(settings().initialCash)}</div></div>
      <div class="card kpi blue"><div class="label">Receita · ${shortMonth(m)}</div><div class="value mono">${money(r.rev.total)}</div><div class="foot">${money(r.rev.mens)} mensalidades · ${money(r.rev.dias)} diárias</div></div>
      <div class="card kpi amber"><div class="label">Despesas · ${shortMonth(m)}</div><div class="value mono">${money(r.exp.total)}</div><div class="foot">meta mensal ${money(mm.withGifts)}</div></div>
      <div class="card kpi"><div class="label">Mensalistas pagantes</div><div class="value mono">${membersPaid}<span class="muted" style="font-size:15px">/${membersTotal}</span></div><div class="foot">planejado: ${settings().plannedMembers} jogadores</div></div>
    </div>

    <div class="grid grid-dash mt">
      <div class="stack">
        <div class="card">
          ${section('Receitas × despesas', 'Valores por mês no ano de ' + year())}
          <div class="card-body">${svgBars(rows)}</div>
        </div>
        <div class="card">
          ${section('Saldo acumulado', 'Evolução do caixa ao longo do ano')}
          <div class="card-body">${svgLine(rows)}</div>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          ${section('Meta mensal', `Meta com brindes: ${money(mm.withGifts)}`)}
          <div class="card-body">
            <div class="spread small"><span>Recebido em ${shortMonth(m)}</span><strong class="mono">${money(r.rev.total)}</strong></div>
            <div class="progress mt ${progress < 100 ? 'amber' : ''}"><span style="width:${progress}%"></span></div>
            <p class="tiny muted mt">${r.metaDiff >= 0 ? `✅ Acima da meta em <strong class="positive">${money(r.metaDiff)}</strong>` : `⚠️ Faltam <strong class="negative">${money(-r.metaDiff)}</strong> para bater a meta`}</p>
            <hr style="border:0;border-top:1px solid var(--border-soft);margin:18px 0">
            <div class="spread small"><span>Reserva do churrasco</span><strong class="mono">${money(r.reservePaid)} / ${money(mm.bbqAnnual)}</strong></div>
            <div class="progress mt"><span style="width:${reservePct}%"></span></div>
            <p class="tiny muted mt">Provisão mensal de ${money(mm.bbqMonthly)} · ${r.reserveDiff >= 0 ? '<span class="positive">reserva em dia</span>' : `<span class="warn">faltam ${money(-r.reserveDiff)}</span>`}</p>
          </div>
        </div>
        <div class="card">
          ${section('Próximos jogos', 'Agenda do racha', `<button class="btn btn-sm btn-ghost" data-act="nav" data-page="games">Ver agenda</button>`)}
          <div class="card-body stack" style="gap:9px">
            ${nextGames.length ? nextGames.map(g => `
              <div class="spread" style="padding:9px 11px;background:var(--panel-2);border-radius:10px">
                <div><strong class="small">${fmtDate(g.date)}</strong><div class="tiny muted">${state.dayEntries.filter(d => d.gameId === g.id).length} diaristas · ${money(sum(state.dayEntries.filter(d => d.gameId === g.id), d => d.amount))}</div></div>
                <button class="btn btn-sm ${g.done ? 'btn-ghost' : 'btn-primary'}" data-act="checkin" data-id="${g.id}">${g.done ? 'Editar' : 'Check-in'}</button>
              </div>`).join('') : empty('Sem jogos agendados', 'Crie jogos na aba Jogos & Diárias.')}
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-2 mt">
      <div class="card">
        ${section('Mensalidades pendentes', shortMonth(m) + '/' + year(), `<button class="btn btn-sm btn-ghost" data-act="nav" data-page="payments">Ver todas</button>`)}
        <div class="table-wrap">${pending.length ? `<table><thead><tr><th>Jogador</th><th>Contato</th><th class="right">Ação</th></tr></thead><tbody>${pending.map(p => `
          <tr><td>${playerCell(p, p.position)}</td><td class="tiny muted">${esc(p.phone || '—')}</td><td class="right"><button class="btn btn-sm ${p.phone ? '' : 'btn-ghost'}" data-act="cobrar" data-id="${p.id}" ${p.phone ? '' : 'disabled title="Sem telefone cadastrado"'}>📲 Cobrar</button></td></tr>`).join('')}</tbody></table>` : empty('Tudo em dia!', 'Nenhuma mensalidade pendente neste mês.')}</div>
      </div>
      <div class="card">
        ${section('Atividade recente', 'Últimos lançamentos')}
        <div class="table-wrap">${activities.length ? `<table><tbody>${activities.slice(0, 6).map(a => `<tr><td style="width:30px">${a.ico}</td><td><strong class="small">${esc(a.text)}</strong><div class="tiny muted">${esc(a.kind)}</div></td><td class="right tiny muted">${fmtDate(a.date)}</td></tr>`).join('')}</tbody></table>` : empty('Sem atividades', 'Os lançamentos aparecerão aqui.')}</div>
      </div>
    </div>`;
}

function pagePlayers() {
  const list = activePlayers().filter(p => {
    const okType = ui.playerFilter === 'all' || p.type === ui.playerFilter;
    const okSearch = !ui.search || p.name.toLowerCase().includes(ui.search.toLowerCase());
    return okType && okSearch;
  });
  const rank = rankingFor('year');
  const rankMap = new Map(rank.map(r => [r.playerId, r]));
  return `
    <div class="card">
      ${section(`${activePlayers().length} jogadores cadastrados`, 'Use a busca para filtrar por nome', `
        <input id="player-search" placeholder="🔎 Buscar jogador..." value="${esc(ui.search)}" style="width:190px" />
        <select id="player-filter" style="width:130px">
          <option value="all" ${ui.playerFilter === 'all' ? 'selected' : ''}>Todos</option>
          <option value="Mensalista" ${ui.playerFilter === 'Mensalista' ? 'selected' : ''}>Mensalistas</option>
          <option value="Diarista" ${ui.playerFilter === 'Diarista' ? 'selected' : ''}>Diaristas</option>
        </select>
        <button class="btn btn-primary" data-act="open-modal" data-modal="player">＋ Jogador</button>`)}
      <div class="table-wrap" id="players-table">
        ${list.length ? `<table><thead><tr><th>Jogador</th><th>Tipo</th><th>Posição</th><th>Contato</th><th class="right">Pontos</th><th class="right">Ações</th></tr></thead><tbody>
          ${list.map(p => { const r = rankMap.get(p.id); return `<tr>
            <td>${playerCell(p, p.note || (p.type === 'Mensalista' ? 'Mensalista' : 'Diarista'))}</td>
            <td>${badge(p.type, p.type === 'Mensalista' ? 'green' : 'blue')}</td>
            <td class="small">${esc(p.position || '—')}</td>
            <td class="tiny muted">${esc(p.phone || '—')}</td>
            <td class="right mono"><strong>${r ? r.points : 0}</strong></td>
            <td class="right">
              <button class="icon-btn" data-act="photo" data-id="${p.id}" title="Foto">📷</button>
              <button class="icon-btn" data-act="cobranca" data-id="${p.id}" title="Link de cobrança">🔗</button>
              <button class="icon-btn" data-act="profile" data-id="${p.id}" title="Perfil">👤</button>
              <button class="icon-btn" data-act="edit-player" data-id="${p.id}" title="Editar">✏️</button>
              <button class="icon-btn danger" data-act="delete-player" data-id="${p.id}" title="Excluir">🗑️</button>
            </td></tr>`; }).join('')}
        </tbody></table>` : empty('Nenhum jogador encontrado', 'Cadastre jogadores ou ajuste o filtro.', `<button class="btn btn-primary" data-act="open-modal" data-modal="player">＋ Cadastrar jogador</button>`)}
      </div>
    </div>`;
}

function pagePayments() {
  const m = currentMonth(), players = activePlayers().filter(p => p.type === 'Mensalista');
  const y = year();
  const totals = MONTHS.map((_, i) => {
    const list = state.payments.filter(p => p.year === y && p.month === i + 1 && p.paid !== false);
    return { received: sum(list, p => p.amount), count: list.length };
  });
  const expected = num(settings().monthlyFee) * players.length;
  return `
    <div class="card">
      ${section('Mensalidades ' + y, `${players.length} mensalistas · ${money(settings().monthlyFee)} por mês`, `
        ${selectMonths('pay-month', m)}
        <button class="btn btn-sm btn-ghost" data-act="pay-all">Marcar ${shortMonth(m)} para todos</button>
        <button class="btn btn-sm btn-ghost" data-act="clear-month">Limpar ${shortMonth(m)}</button>`)}
      <div class="table-wrap"><table class="pay-grid">
        <thead><tr><th>Jogador</th>${MONTHS.map((mo, i) => `<th>${mo}</th>`).join('')}<th>Total</th></tr></thead>
        <tbody>
          ${players.map(p => {
            let total = 0;
            const cells = MONTHS.map((_, i) => {
              const rec = state.payments.find(x => x.playerId === p.id && x.month === i + 1 && x.year === y && x.paid !== false);
              if (rec) total += num(rec.amount);
              return `<td><button class="pay-cell ${rec ? 'paid' : ''}" data-act="edit-payment" data-player="${p.id}" data-month="${i + 1}" title="${rec ? 'Pago: ' + money(rec.amount) + ' (clique para editar)' : 'Marcar como pago'}">${rec ? '✓' : '—'}</button></td>`;
            }).join('');
            return `<tr><td>${playerCell(p)}</td>${cells}<td class="num"><strong>${money(total)}</strong></td></tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="total-row"><td>Recebido</td>${totals.map(t => `<td class="num">${compactMoney(t.received)}</td>`).join('')}<td class="num">${money(totals.reduce((a, t) => a + t.received, 0))}</td></tr>
          <tr><td>Pagantes</td>${totals.map(t => `<td class="num">${t.count}</td>`).join('')}<td></td></tr>
          <tr><td>Previsto</td>${MONTHS.map(() => `<td class="num">${compactMoney(expected)}</td>`).join('')}<td class="num">${money(expected * 12)}</td></tr>
          <tr><td>Em aberto</td>${totals.map(t => `<td class="num warn">${compactMoney(Math.max(0, expected - t.received))}</td>`).join('')}<td></td></tr>
        </tfoot>
      </table></div>
    </div>`;
}

function pageGames() {
  const y = year();
  const games = state.games.filter(g => g.year === y).sort((a, b) => a.date.localeCompare(b.date));
  const tabs = `<div class="row" style="margin-bottom:16px">
      <button class="btn ${ui.gameTab === 'games' ? 'btn-primary' : 'btn-ghost'}" data-act="game-tab" data-tab="games">📅 Jogos (${games.length})</button>
      <button class="btn ${ui.gameTab === 'days' ? 'btn-primary' : 'btn-ghost'}" data-act="game-tab" data-tab="days">🎟️ Diárias (${state.dayEntries.filter(d => d.year === y).length})</button>
    </div>`;
  if (ui.gameTab === 'games') {
    return tabs + `<div class="card">
      ${section('Agenda de jogos', 'Quintas-feiras do racha', `
        ${selectMonths('gen-month', currentMonth())}
        <button class="btn btn-sm btn-ghost" data-act="generate-games">Gerar quintas do mês</button>
        <button class="btn btn-sm btn-primary" data-act="open-modal" data-modal="game">＋ Jogo</button>`)}
      <div class="table-wrap">${games.length ? `<table><thead><tr><th>Data</th><th>Mês</th><th>Status</th><th class="right">Diaristas</th><th class="right">Receita</th><th class="right">Ações</th></tr></thead><tbody>
        ${games.map(g => { const ds = state.dayEntries.filter(d => d.gameId === g.id); return `<tr>
          <td><strong>${fmtDate(g.date)}</strong></td><td>${shortMonth(g.month)}</td>
          <td>${badge(g.done ? 'Realizado' : 'Agendado', g.done ? 'green' : 'amber')}</td>
          <td class="right mono">${ds.length}</td><td class="right mono">${money(sum(ds, d => d.amount))}</td>
          <td class="right"><button class="btn btn-sm ${g.done ? 'btn-ghost' : 'btn-primary'}" data-act="checkin" data-id="${g.id}">${g.done ? 'Editar presença' : 'Fazer check-in'}</button>
          <button class="icon-btn danger" data-act="delete-game" data-id="${g.id}">🗑️</button></td></tr>`; }).join('')}
      </tbody></table>` : empty('Nenhum jogo agendado', 'Gere as quintas do mês ou cadastere um jogo manualmente.')}</div>
    </div>`;
  }
  const days = state.dayEntries.filter(d => d.year === y).sort((a, b) => b.date.localeCompare(a.date));
  return tabs + `<div class="card">
    ${section('Diárias recebidas', 'Uma linha por diarista por jogo', `<button class="btn btn-sm btn-primary" data-act="open-modal" data-modal="day">＋ Diária</button>`)}
    <div class="table-wrap">${days.length ? `<table><thead><tr><th>Data</th><th>Jogador</th><th>Tipo</th><th class="right">Valor</th><th class="right">Ações</th></tr></thead><tbody>
      ${days.slice(0, 300).map(d => `<tr><td>${fmtDate(d.date)}</td><td>${playerCell(playerById(d.playerId))}</td><td>${badge('Diarista', 'blue')}</td><td class="right mono">${money(d.amount)}</td><td class="right"><button class="icon-btn danger" data-act="delete-day" data-id="${d.id}">🗑️</button></td></tr>`).join('')}
    </tbody></table>` : empty('Sem diárias', 'Faça o check-in de um jogo para lançar as diárias em lote.')}</div>
  </div>`;
}

function pageExpenses() {
  const y = year();
  const all = state.expenses.filter(e => e.year === y).sort((a, b) => b.date.localeCompare(a.date));
  const byCat = {};
  all.forEach(e => byCat[e.category] = (byCat[e.category] || 0) + num(e.amount));
  return `
    <div class="grid grid-4">
      ${CASH_ROWS.filter(c => ['Quadra', 'Goleiros', 'Material', 'Churrasco'].includes(c)).map((c, i) => `
        <div class="card kpi ${i % 2 ? 'blue' : ''}"><div class="label">${esc(c)}</div><div class="value mono">${money(byCat[c] || 0)}</div><div class="foot">total no ano</div></div>`).join('')}
    </div>
    <div class="card mt">
      ${section(`${all.length} despesas em ${y}`, `Total: ${money(sum(all, e => e.amount))}`, `
        <button class="btn btn-sm btn-ghost" data-act="quick-expense" data-cat="Quadra">＋ Aluguel</button>
        <button class="btn btn-sm btn-ghost" data-act="quick-expense" data-cat="Goleiros">＋ Goleiros</button>
        <button class="btn btn-sm btn-primary" data-act="open-modal" data-modal="expense">＋ Despesa</button>`)}
      <div class="table-wrap">${all.length ? `<table><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Mês</th><th class="right">Valor</th><th class="right">Ações</th></tr></thead><tbody>
        ${all.map(e => `<tr><td>${fmtDate(e.date)}</td><td>${badge(e.category, e.category === 'Quadra' ? 'green' : e.category === 'Goleiros' ? 'blue' : 'amber')}</td><td>${esc(e.description || '—')}</td><td>${shortMonth(e.month)}</td><td class="right mono">${money(e.amount)}</td><td class="right"><button class="icon-btn danger" data-act="delete-expense" data-id="${e.id}">🗑️</button></td></tr>`).join('')}
      </tbody></table>` : empty('Sem despesas', 'Lance o aluguel da quadra e os goleiros para começar.')}</div>
    </div>`;
}

function pageBenefits() {
  const y = year();
  const list = state.benefits.filter(b => b.year === y).sort((a, b) => b.date.localeCompare(a.date));
  const fromCash = sum(list.filter(b => b.fromCash), b => b.amount);
  return `
    <div class="grid grid-3">
      <div class="card kpi amber"><div class="label">Benefícios no ano</div><div class="value mono">${money(sum(list, b => b.amount))}</div><div class="foot">${list.length} lançamentos</div></div>
      <div class="card kpi red"><div class="label">Saiu do caixa</div><div class="value mono">${money(fromCash)}</div><div class="foot">entra nas despesas do fluxo</div></div>
      <div class="card kpi blue"><div class="label">Desconto em mensalidade</div><div class="value mono">${money(sum(list.filter(b => !b.fromCash), b => b.amount))}</div><div class="foot">não sai do caixa</div></div>
    </div>
    <div class="card mt">
      ${section('Benefícios e incentivos · ' + y, 'Camisa, colete, desconto e outros incentivos', `<button class="btn btn-sm btn-primary" data-act="open-modal" data-modal="benefit">＋ Benefício</button>`)}
      <div class="table-wrap">${list.length ? `<table><thead><tr><th>Data</th><th>Jogador</th><th>Tipo</th><th class="right">Valor</th><th>Sai do caixa?</th><th>Mês</th><th>Observação</th><th class="right">Ações</th></tr></thead><tbody>
        ${list.map(b => `<tr><td>${fmtDate(b.date)}</td><td>${playerCell(playerById(b.playerId))}</td><td class="small">${esc(b.type || '—')}</td><td class="right mono">${money(b.amount)}</td><td>${badge(b.fromCash ? 'Sim' : 'Não', b.fromCash ? 'red' : 'blue')}</td><td>${shortMonth(b.month)}</td><td class="small muted">${esc(b.note || '—')}</td><td class="right"><button class="icon-btn" data-act="edit-benefit" data-id="${b.id}">✏️</button> <button class="icon-btn danger" data-act="delete-benefit" data-id="${b.id}">🗑️</button></td></tr>`).join('')}
      </tbody></table>` : empty('Sem benefícios', 'Lance incentivos e descontos concedidos aos mensalistas.')}</div>
    </div>`;
}

function pageCash() {
  const rows = cashRows(), m = meta();
  const total = rows[11];
  return `
    <div class="grid grid-4">
      <div class="card kpi blue"><div class="label">Receitas do ano</div><div class="value mono">${money(total.rev.total)}</div><div class="foot">mensalidades + diárias</div></div>
      <div class="card kpi amber"><div class="label">Despesas do ano</div><div class="value mono">${money(total.exp.total)}</div><div class="foot">inclui brindes e benefícios</div></div>
      <div class="card kpi ${total.acc < 0 ? 'red' : ''}"><div class="label">Saldo final previsto</div><div class="value mono ${total.acc < 0 ? 'negative' : 'positive'}">${money(total.acc)}</div><div class="foot">com saldo inicial</div></div>
      <div class="card kpi"><div class="label">Meta anual</div><div class="value mono">${money(m.withGifts * 12)}</div><div class="foot">${money(m.withGifts)} / mês</div></div>
    </div>
    <div class="card mt">
      ${section('Fluxo de caixa · ' + year(), 'Tudo automático a partir dos lançamentos', `<button class="btn btn-sm btn-ghost" data-act="export-cash">⬇ Exportar CSV</button>`)}
      <div class="table-wrap"><table>
        <thead><tr><th>Item</th>${MONTHS.map(x => `<th class="right">${x}</th>`).join('')}<th class="right">Total</th></tr></thead>
        <tbody>
          <tr class="section-row"><td colspan="14">RECEITAS</td></tr>
          <tr><td>Mensalidades</td>${rows.map(r => `<td class="right mono">${money(r.rev.mens)}</td>`).join('')}<td class="right mono">${money(total.rev.mens)}</td></tr>
          <tr><td>Diárias</td>${rows.map(r => `<td class="right mono">${money(r.rev.dias)}</td>`).join('')}<td class="right mono">${money(total.rev.dias)}</td></tr>
          <tr class="total-row"><td>Total de receitas</td>${rows.map(r => `<td class="right mono">${money(r.rev.total)}</td>`).join('')}<td class="right mono">${money(total.rev.total)}</td></tr>
          <tr class="section-row"><td colspan="14">DESPESAS</td></tr>
          ${CASH_ROWS.map(c => `<tr><td>${c}</td>${rows.map(r => `<td class="right mono">${money(r.exp.byCat[c])}</td>`).join('')}<td class="right mono">${money(rows.reduce((a, r) => a + r.exp.byCat[c], 0))}</td></tr>`).join('')}
          <tr class="total-row"><td>Total de despesas</td>${rows.map(r => `<td class="right mono">${money(r.exp.total)}</td>`).join('')}<td class="right mono">${money(total.exp.total)}</td></tr>
          <tr class="total-row"><td>SALDO DO MÊS</td>${rows.map(r => `<td class="right mono ${r.balance < 0 ? 'negative' : 'positive'}">${money(r.balance)}</td>`).join('')}<td class="right mono ${total.balance < 0 ? 'negative' : 'positive'}">${money(total.balance)}</td></tr>
          <tr><td>Saldo acumulado</td>${rows.map(r => `<td class="right mono ${r.acc < 0 ? 'negative' : 'positive'}">${money(r.acc)}</td>`).join('')}<td class="right mono">${money(total.acc)}</td></tr>
          <tr class="section-row"><td colspan="14">RESERVA DO CHURRASCO</td></tr>
          <tr><td>Meta acumulada</td>${rows.map(r => `<td class="right mono">${money(r.reserveTarget)}</td>`).join('')}<td class="right mono">${money(m.bbqAnnual)}</td></tr>
          <tr><td>Já pago</td>${rows.map(r => `<td class="right mono">${money(r.reservePaid)}</td>`).join('')}<td class="right mono">${money(total.reservePaid)}</td></tr>
          <tr><td>Folga / falta</td>${rows.map(r => `<td class="right mono ${r.reserveDiff < 0 ? 'negative' : 'positive'}">${money(r.reserveDiff)}</td>`).join('')}<td class="right mono">${money(total.reserveDiff)}</td></tr>
          <tr class="section-row"><td colspan="14">META DE RECEITA</td></tr>
          <tr><td>Meta mensal</td>${rows.map(() => `<td class="right mono">${money(m.withGifts)}</td>`).join('')}<td class="right mono">${money(m.withGifts * 12)}</td></tr>
          <tr><td>Acima / abaixo</td>${rows.map(r => `<td class="right mono ${r.metaDiff < 0 ? 'negative' : 'positive'}">${money(r.metaDiff)}</td>`).join('')}<td class="right mono">${money(total.metaDiff)}</td></tr>
        </tbody>
      </table></div>
    </div>`;
}

function simValues() {
  if (!ui.sim) ui.sim = {
    members: num(settings().plannedMembers), fee: num(settings().monthlyFee),
    dayPerGame: num(settings().dayPlayersPerGame), dayFee: num(settings().dayFee),
    games: num(settings().gamesPerMonth)
  };
  return ui.sim;
}
function simResultHTML() {
  const v = simValues(), res = simulate(v.members, v.fee, v.dayPerGame, v.dayFee, v.games);
  const need = breakEvenMembers(v.fee, v.dayPerGame, v.dayFee, v.games);
  return `<div class="sim-result ${res < 0 ? 'bad' : ''}">
    <div class="small muted">${res >= 0 ? 'Sobra mensal prevista' : 'Falta mensal prevista'}</div>
    <div class="big mono ${res < 0 ? 'negative' : 'positive'}">${money(Math.abs(res))}</div>
    <div class="tiny muted mt">${res >= 0 ? '✅ Cenário fecha no azul' : `⚠️ Precisa de <strong>${need} mensalistas</strong> para fechar no azul com estes valores`}</div>
  </div>
  <div class="grid grid-3 mt">
    <div class="card kpi blue"><div class="label">Receita mensalista</div><div class="value mono">${money(v.members * v.fee)}</div></div>
    <div class="card kpi amber"><div class="label">Receita diaristas</div><div class="value mono">${money(v.dayPerGame * v.dayFee * v.games)}</div></div>
    <div class="card kpi red"><div class="label">Meta mensal</div><div class="value mono">${money(meta().withGifts)}</div></div>
  </div>`;
}
function simHeatHTML() {
  const v = simValues();
  const fees = [40, 50, 60, 70, 80, 90, 100];
  const members = [10, 12, 14, 16, 18, 20, 22, 24];
  return `<table class="heat"><thead><tr><th>Mensalistas</th>${fees.map(f => `<th>${money(f)}</th>`).join('')}</tr></thead><tbody>
    ${members.map(n => `<tr><td><strong>${n}</strong></td>${fees.map(f => {
      const r = simulate(n, f, v.dayPerGame, v.dayFee, v.games);
      const cls = r < 0 ? 'bad' : r < 200 ? 'near' : 'good';
      return `<td class="${cls}">${compactMoney(r)}</td>`;
    }).join('')}</tr>`).join('')}
  </tbody></table>`;
}
function pageSimulator() {
  const v = simValues();
  const slider = (key, label, min, max, step, prefix = '') => `
    <div class="slider-row"><label class="small muted" for="sim-${key}">${label}</label>
      <div class="row" style="flex-wrap:nowrap"><input type="range" id="sim-${key}" data-sim="${key}" min="${min}" max="${max}" step="${step}" value="${v[key]}" /><output id="out-${key}">${prefix}${v[key]}</output></div>
    </div>`;
  return `
    <div class="grid grid-2">
      <div class="card">
        ${section('Ajuste os cenários', 'Arraste os controles e veja o resultado na hora')}
        <div class="card-body stack">
          ${slider('members', 'Nº de mensalistas', 0, 40, 1)}
          ${slider('fee', 'Mensalidade (R$)', 20, 150, 5, 'R$ ')}
          ${slider('dayPerGame', 'Diaristas por jogo', 0, 15, 1)}
          ${slider('dayFee', 'Diária (R$)', 10, 60, 5, 'R$ ')}
          ${slider('games', 'Jogos por mês', 1, 8, 1)}
          <button class="btn btn-primary" data-act="apply-sim">Aplicar ao planejamento</button>
          <p class="tiny muted">Ao aplicar, mensalidade, diária, diaristas por jogo e jogos por mês passam a valer nas premissas do app.</p>
        </div>
      </div>
      <div class="card">
        ${section('Resultado', 'Receita − meta mensal com brindes')}
        <div class="card-body" id="sim-result">${simResultHTML()}</div>
      </div>
    </div>
    <div class="card mt">
      ${section('Tabela de sensibilidade', 'Resultado mensal por nº de mensalistas × mensalidade')}
      <div class="card-body table-wrap" id="sim-heat">${simHeatHTML()}</div>
    </div>`;
}

function pageScores() {
  const m = currentMonth(), y = year(), players = activePlayers();
  const existing = new Map(state.scores.filter(s => s.year === y && s.month === m).map(s => [s.playerId, s]));
  return `
    <div class="card">
      ${section('Pontuação · ' + shortMonth(m) + '/' + y, '1 = sim · 0 = não. Os pontos são calculados automaticamente.', selectMonths('score-month', m))}
      <div class="table-wrap"><table><thead><tr><th>Jogador</th><th class="right">Gols</th><th class="right">Assist.</th><th class="right">Presenças</th><th class="center">Fair play</th><th class="center">Pontual</th><th class="right">Cartões</th><th class="right">Pontos</th></tr></thead><tbody>
        ${players.map(p => {
          const s = existing.get(p.id) || { goals: 0, assists: 0, presence: 0, fairPlay: 0, punctual: 0, cards: 0 };
          const pts = scorePoints(s);
          return `<tr data-score-row="${p.id}">
            <td>${playerCell(p)}</td>
            ${['goals', 'assists', 'presence', 'cards'].map(k => `<td class="right"><input type="number" min="0" value="${num(s[k])}" data-score="${k}" data-player="${p.id}" style="width:66px;text-align:right" /></td>`).join('')}
            <td class="center"><input type="checkbox" data-score="fairPlay" data-player="${p.id}" ${s.fairPlay ? 'checked' : ''} /></td>
            <td class="center"><input type="checkbox" data-score="punctual" data-player="${p.id}" ${s.punctual ? 'checked' : ''} /></td>
            <td class="right mono"><strong id="pts-${p.id}">${pts}</strong></td>
          </tr>`;
        }).join('')}
      </tbody></table></div>
    </div>`;
}

function pageRanking() {
  const filters = [['year', 'Ano'], [1, 'T1'], [2, 'T2'], [3, 'T3'], [4, 'T4']];
  const rank = rankingFor(ui.rankFilter);
  const top3 = rank.slice(0, 3);
  const label = ui.rankFilter === 'year' ? 'do ano de ' + year() : `do ${ui.rankFilter}º trimestre de ${year()}`;
  return `
    <div class="card">
      ${section('Ranking ' + label, 'Pontos = gols×' + settings().ptsGoal + ' + assistências×' + settings().ptsAssist + ' + presença×' + settings().ptsPresence + ' + bônus', 
        filters.map(([k, l]) => `<button class="btn btn-sm ${String(ui.rankFilter) === String(k) ? 'btn-primary' : 'btn-ghost'}" data-act="rank-filter" data-filter="${k}">${l}</button>`).join(''))}
      <div class="card-body">
        ${rank.length ? `<div class="podium">
          ${[1, 0, 2].map(idx => { const r = top3[idx]; return r ? `<div class="podium-item ${idx === 0 ? 'first' : ''}"><div class="medal">${['🥇', '🥈', '🥉'][idx]}</div><div class="name">${esc(r.player?.name || '—')}</div><div class="pts">${r.points} pts</div><div class="tiny muted">${r.goals} gols · ${r.assists} assist.</div></div>` : ''; }).join('')}
        </div>` : ''}
        <div class="table-wrap">${rank.length ? `<table><thead><tr><th class="right">#</th><th>Jogador</th><th class="right">Gols</th><th class="right">Assist.</th><th class="right">Presenças</th><th class="right">Meses</th><th class="right">Pontos</th></tr></thead><tbody>
          ${rank.map(r => `<tr><td class="right"><strong>${r.pos}</strong></td><td>${playerCell(r.player, r.player?.position)}</td><td class="right mono">${r.goals}</td><td class="right mono">${r.assists}</td><td class="right mono">${r.presence}</td><td class="right mono">${r.games}</td><td class="right mono"><strong class="positive">${r.points}</strong></td></tr>`).join('')}
        </tbody></table>` : empty('Sem pontuação lançada', 'Vá em Pontuação e registre o mês para montar o ranking.')}</div>
      </div>
    </div>`;
}

function pageAwards() {
  const m = currentMonth(), auto = autoWinners(m);
  const aw = state.awards.find(a => a.month === m && a.year === year()) || { month: m, year: year(), gift: '', cost: 0, delivered: false };
  const history = state.awards.filter(a => a.year === year()).sort((a, b) => a.month - b.month);
  const autoCard = (label, ico, id, extra) => `<div class="card kpi blue"><div class="label">${ico} ${label}</div><div class="value" style="font-size:16px">${esc(playerName(id))}</div><div class="foot">${extra}</div></div>`;
  return `
    <div class="row" style="margin-bottom:16px">${selectMonths('award-month', m)}</div>
    <div class="grid grid-3">
      ${autoCard('Artilheiro', '⚽', auto.goals, state.scores.filter(s => s.month === m && s.year === year() && s.playerId === auto.goals).reduce((a, s) => a + num(s.goals), 0) + ' gols')}
      ${autoCard('Garçom', '🍽️', auto.assists, state.scores.filter(s => s.month === m && s.year === year() && s.playerId === auto.assists).reduce((a, s) => a + num(s.assists), 0) + ' assistências')}
      ${autoCard('Líder em pontos', '⭐', auto.points, state.scores.filter(s => s.month === m && s.year === year() && s.playerId === auto.points).reduce((a, s) => a + scorePoints(s), 0) + ' pontos')}
    </div>
    <div class="grid grid-2 mt">
      <div class="card">
        ${section('Premiação de ' + shortMonth(m), 'Os três primeiros vêm da aba Pontuação')}
        <div class="card-body">
          <form data-form="award" class="form-grid">
            <label class="field">Melhor goleiro<input name="bestGk" value="${esc(aw.bestGk || '')}" placeholder="Nome" /></label>
            <label class="field">Paredão (defensor)<input name="defender" value="${esc(aw.defender || '')}" placeholder="Nome" /></label>
            <label class="field">Fair play<input name="fairPlay" value="${esc(aw.fairPlay || '')}" placeholder="Nome" /></label>
            <label class="field">Craque do mês<input name="crack" value="${esc(aw.crack || '')}" placeholder="Nome" /></label>
            <label class="field">Presença VIP (qtd)<input name="vipCount" type="number" min="0" value="${num(aw.vipCount)}" /></label>
            <label class="field">Brinde / prêmio<input name="gift" value="${esc(aw.gift || '')}" placeholder="Ex.: camisa, bola..." /></label>
            <label class="field">Custo dos brindes (R$)<input name="cost" type="number" step="0.01" value="${num(aw.cost)}" /></label>
            <label class="field" style="justify-content:flex-end"><span style="display:flex;align-items:center;gap:8px"><input name="delivered" type="checkbox" ${aw.delivered ? 'checked' : ''} style="width:16px" /> Entregue?</span></label>
            <div class="form-actions" style="grid-column:1/-1"><button class="btn btn-primary" type="submit">Salvar premiação</button></div>
          </form>
        </div>
      </div>
      <div class="card">
        ${section('Histórico de brindes', 'Custos entram no fluxo de caixa')}
        <div class="table-wrap">${history.length ? `<table><thead><tr><th>Mês</th><th>Brinde</th><th class="right">Custo</th><th>Status</th></tr></thead><tbody>
          ${history.map(a => `<tr><td>${shortMonth(a.month)}</td><td class="small">${esc(a.gift || '—')}</td><td class="right mono">${money(a.cost)}</td><td>${badge(a.delivered ? 'Entregue' : 'Pendente', a.delivered ? 'green' : 'amber')}</td></tr>`).join('')}
        </tbody></table>` : empty('Sem premiações', 'Salve a premiacao do mês para aparecer aqui.')}</div>
      </div>
    </div>`;
}

function pageSettings() {
  const s = settings();
  const f = (name, label, step = '0.01') => `<label class="field">${esc(label)}<input name="${name}" type="number" step="${step}" value="${num(s[name])}" /></label>`;
  return `
    <form data-form="settings">
      <div class="grid grid-2">
        <div class="card">
          ${section('Financeiro', 'Valores base usados nas simulações')}
          <div class="card-body form-grid">
            ${f('year', 'Ano de controle', '1')}
            ${f('monthlyFee', 'Mensalidade (R$/mês)')}
            ${f('dayFee', 'Diária (R$/jogo)')}
            ${f('fieldRent', 'Aluguel mensal do campo (R$)')}
            ${f('goalkeepers', 'Nº de goleiros pagos', '1')}
            ${f('goalkeeperFee', 'Valor por goleiro por jogo (R$)')}
            ${f('refereeFee', 'Arbitragem por jogo (R$)')}
            ${f('gamesPerMonth', 'Jogos por mês', '1')}
            ${f('initialCash', 'Saldo inicial do caixa (R$)')}
            <label class="field" style="grid-column:1/-1">Chave PIX para cobranças<input name="pixKey" value="${esc(s.pixKey || '')}" placeholder="CPF, e-mail, telefone ou chave aleatória" /></label>
            <label class="field">Nome do favorecido<input name="pixMerchant" value="${esc(s.pixMerchant || '')}" placeholder="RACHA DO LOLO" /></label>
            <label class="field">Cidade<input name="pixCity" value="${esc(s.pixCity || '')}" placeholder="SAO PAULO" /></label>
          </div>
        </div>
        <div class="card">
          ${section('Cenário e churrasco', 'Planejamento e reserva')}
          <div class="card-body form-grid">
            ${f('plannedMembers', 'Mensalistas planejados', '1')}
            ${f('dayPlayersPerGame', 'Diaristas médios por jogo', '1')}
            ${f('bbqCostPerPerson', 'Churrasco: custo por pessoa (R$)')}
            ${f('bbqPeople', 'Churrasco: nº de pessoas', '1')}
            ${f('bbqPerYear', 'Churrascos por ano', '1')}
            ${f('giftsReserve', 'Reserva mensal p/ brindes (R$)')}
          </div>
        </div>
        <div class="card">
          ${section('Pontuação do campeonato', 'Valores de cada evento')}
          <div class="card-body form-grid">
            ${f('ptsGoal', 'Pontos por gol', '1')}
            ${f('ptsAssist', 'Pontos por assistência', '1')}
            ${f('ptsPresence', 'Pontos por presença', '1')}
            ${f('ptsFairPlay', 'Prêmio de fair play no mês', '1')}
            ${f('ptsPunctual', 'Pontualidade no mês', '1')}
            ${f('ptsCard', 'Por cartão / entrada violenta', '1')}
          </div>
        </div>
        <div class="card">
          ${section('Aparência', 'Escolha as cores do app', `<button class="btn btn-sm btn-ghost" data-act="reset-colors">Restaurar padrão</button>`)}
          <div class="card-body stack">
            <div class="row">
              <label class="field" style="flex:1">Cor principal<input type="color" id="color-accent" value="${esc(colors.accent)}" style="height:42px;padding:4px" /></label>
              <label class="field" style="flex:1">Cor secundária<input type="color" id="color-secondary" value="${esc(colors.secondary)}" style="height:42px;padding:4px" /></label>
            </div>
            <div>
              <div class="tiny muted" style="margin-bottom:8px">Paletas prontas</div>
              <div class="row">${Object.entries(COLOR_PRESETS).map(([k, v]) => `<button class="btn btn-sm ${colors.accent === v.accent ? 'btn-primary' : 'btn-ghost'}" data-act="color-preset" data-preset="${k}">${v.label}</button>`).join('')}</div>
            </div>
            <p class="tiny muted">As cores são aplicadas na hora e salvas neste navegador. O tema claro/escuro continua no menu lateral.</p>
          </div>
        </div>
        <div class="card">
          ${section('Dados', 'Backup, importação e limpeza')}
          <div class="card-body stack">
            <p class="small muted">Os dados ficam salvos apenas neste navegador. Faça backup regularmente e guarde o arquivo em local seguro.</p>
            <div class="row">
              <button class="btn btn-primary" type="button" data-act="export-json">⬇ Baixar backup</button>
              <button class="btn btn-ghost" type="button" data-act="import-json">⬆ Importar backup</button>
              <button class="btn btn-ghost" type="button" data-act="import-csv">⬆ Importar CSV</button>
            </div>
            <div class="row">
              <button class="btn btn-ghost" type="button" data-act="export-players">⬇ Jogadores (CSV)</button>
              <button class="btn btn-ghost" type="button" data-act="export-cash">⬇ Caixa (CSV)</button>
            </div>
            <div class="row">
              <button class="btn btn-primary" type="button" data-act="install-app">📲 Instalar no celular</button>
            </div>
            <div class="row">
              <button class="btn btn-ghost" type="button" data-act="load-demo">🔄 Recarregar exemplo</button>
              <button class="btn btn-danger" type="button" data-act="clear-all">🗑️ Apagar tudo</button>
            </div>
          </div>
        </div>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn btn-primary" type="submit">💾 Salvar premissas</button></div>
    </form>`;
}

function hasDemo() {
  return ['players', 'payments', 'dayEntries', 'expenses', 'games', 'benefits', 'scores', 'awards'].some(k => state[k].some(x => x.demo));
}

/* ---------- página de pagamento (link de cobrança) ---------- */
function renderPaymentPage() {
  const pp = ui.paymentPage;
  if (!pp) return;
  const p = playerById(pp.playerId);
  const rec = state.payments.find(x => x.playerId === pp.playerId && x.month === pp.month && x.year === year() && x.paid !== false);
  const paid = !!rec;
  if (rec && !rec.receiptId) { ensureReceipt(rec); save(); }
  const code = pixCode(pp.amount, txidFor(pp.playerId, pp.month));
  $('#content').innerHTML = `
    <div class="payment-center">
      <div class="card card-pad">
        <div class="center">
          ${avatarHTML(p, false).replace('class="avatar', 'class="avatar big')}
          <h2 style="margin-top:12px">${esc(p?.name || 'Jogador')}</h2>
          <p class="muted small">Mensalidade de ${monthName(pp.month)}/${year()}</p>
          <div class="value mono" style="font-size:34px;font-weight:850;margin:14px 0">${money(pp.amount)}</div>
        </div>
        ${paid ? `
          <div class="sim-result" style="text-align:center">
            <div style="font-size:30px">✅</div>
            <h3 style="margin-top:6px">Pagamento confirmado</h3>
            <p class="small muted mt">Baixa registrada automaticamente. Comprovante disponível abaixo.</p>
          </div>
          <div class="mt">${receiptHTML(rec, true)}</div>
          <div class="row mt">
            <button class="btn btn-ghost btn-sm" data-act="copy-receipt" data-id="${rec.id}">📋 Copiar</button>
            <button class="btn btn-ghost btn-sm" data-act="download-receipt" data-id="${rec.id}">🖼️ PNG</button>
            <button class="btn btn-primary btn-sm" data-act="print-receipt" data-id="${rec.id}">🖨️ PDF</button>
            <button class="btn btn-ghost btn-sm" data-act="exit-payment" style="margin-left:auto">Voltar ao app</button>
          </div>` : `
          ${code ? `
            <label class="field">Código PIX (copia e cola)<textarea id="pix-code" readonly rows="4">${esc(code)}</textarea></label>
            <button class="btn btn-ghost btn-block mt" data-act="copy-pix">📋 Copiar código PIX</button>
            <div class="center tiny muted mt">Ou pague com o QR Code do seu banco usando o código acima.</div>
          ` : `<div class="banner" style="margin:0">Configure a chave PIX em Configurações para gerar o código de pagamento.</div>`}
          <label class="field mt">ID da transação (opcional)<input id="txid-input" placeholder="Ex.: E123456789202701011234" /></label>
          <button class="btn btn-primary btn-block mt" data-act="confirm-payment-link" data-player="${pp.playerId}" data-month="${pp.month}" data-amount="${pp.amount}">✅ Já paguei — confirmar e dar baixa</button>
          <p class="tiny muted center mt">Ao confirmar, a mensalidade é marcada como paga automaticamente neste app.</p>
          <button class="btn btn-ghost btn-block mt" data-act="exit-payment">Voltar ao app</button>`}
      </div>
    </div>`;
}

function handleHash() {
  const m = location.hash.match(/^#cobranca\/([^/]+)\/(\d{1,2})(?:\/(\d+(?:\.\d+)?))?/);
  if (m) {
    ui.paymentPage = { playerId: decodeURIComponent(m[1]), month: num(m[2]), amount: m[3] ? num(m[3]) : num(settings().monthlyFee) };
    document.body.classList.add('payment-mode');
    renderPaymentPage();
  } else if (ui.paymentPage) {
    ui.paymentPage = null;
    document.body.classList.remove('payment-mode');
    render();
  }
}

/* ------------------------------------------------------------
   Render principal
   ------------------------------------------------------------ */
const PAGE_FNS = {
  dashboard: pageDashboard, players: pagePlayers, payments: pagePayments, games: pageGames,
  expenses: pageExpenses, benefits: pageBenefits, cash: pageCash, simulator: pageSimulator, scores: pageScores,
  ranking: pageRanking, awards: pageAwards, settings: pageSettings
};

function renderNav() {
  $('#nav').innerHTML = NAV.map(g => `
    <div class="nav-group">${g.group}</div>
    ${g.items.map(k => `<button class="nav-item ${ui.page === k ? 'active' : ''}" data-act="nav" data-page="${k}" type="button"><span class="ico">${PAGES[k].ico}</span><span>${PAGES[k].title}</span></button>`).join('')}
  `).join('');
  $('#year-select').innerHTML = [year() - 1, year(), year() + 1, year() + 2].map(y => `<option value="${y}" ${y === year() ? 'selected' : ''}>${y}</option>`).join('');
}

function render() {
  renderNav();
  const p = PAGES[ui.page];
  $('#page-title').textContent = p.title;
  $('#page-subtitle').textContent = p.sub;
  $('#content').innerHTML = PAGE_FNS[ui.page]();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function navigate(page) {
  if (!PAGES[page]) return;
  ui.page = page;
  document.body.classList.remove('menu-open');
  render();
}

/* ------------------------------------------------------------
   Modais
   ------------------------------------------------------------ */
let pendingConfirm = null;

function openModal(title, subtitle, body, wide = false) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><div><h3>${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
      <button class="icon-btn" data-act="close-modal" title="Fechar">✕</button></div>
    <div class="modal-body">${body}</div>
  </div>`;
  root.classList.add('open');
  root.setAttribute('aria-hidden', 'false');
}
function closeModal() {
  $('#modal-root').classList.remove('open');
  $('#modal-root').setAttribute('aria-hidden', 'true');
  $('#modal-root').innerHTML = '';
  pendingConfirm = null;
}
function confirmAction(message, fn) {
  pendingConfirm = fn;
  openModal('Confirmar ação', '', `<p class="small">${esc(message)}</p><div class="form-actions"><button class="btn btn-ghost" data-act="close-modal">Cancelar</button><button class="btn btn-danger" data-act="confirm-yes">Confirmar</button></div>`);
}

function modalPlayer(id) {
  const p = id ? playerById(id) : { name: '', type: 'Mensalista', position: '', phone: '', note: '', active: true };
  if (!p) return;
  openModal(id ? 'Editar jogador' : 'Novo jogador', 'Campos marcados são opcionais', `
    <form data-form="player" data-id="${id || ''}" class="form-grid">
      <label class="field" style="grid-column:1/-1">Nome *<input name="name" required value="${esc(p.name)}" placeholder="Nome completo ou apelido" /></label>
      <label class="field">Tipo<select name="type"><option ${p.type === 'Mensalista' ? 'selected' : ''}>Mensalista</option><option ${p.type === 'Diarista' ? 'selected' : ''}>Diarista</option></select></label>
      <label class="field">Posição<select name="position">${['Linha', 'Meia', 'Zaga', 'Ataque', 'Goleiro'].map(x => `<option ${p.position === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="field">Telefone / WhatsApp<input name="phone" value="${esc(p.phone || '')}" placeholder="11999999999" /></label>
      <label class="field">Observação<input name="note" value="${esc(p.note || '')}" placeholder="Ex.: capitão,VICE..." /></label>
      <label class="field" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:8px"><input name="active" type="checkbox" ${p.active !== false ? 'checked' : ''} style="width:16px" /> Jogador ativo</label>
      <div class="form-actions" style="grid-column:1/-1"><button class="btn btn-ghost" data-act="close-modal" type="button">Cancelar</button><button class="btn btn-primary" type="submit">Salvar</button></div>
    </form>`);
}

function modalPayment(playerId, month) {
  const p = playerById(playerId);
  const y = year();
  const rec = state.payments.find(x => x.playerId === playerId && x.month === month && x.year === y);
  openModal('Mensalidade · ' + shortMonth(month), p?.name || '', `
    <form data-form="payment" class="form-grid">
      <input type="hidden" name="playerId" value="${playerId}" /><input type="hidden" name="month" value="${month}" />
      <label class="field">Jogador<select name="playerSelect" disabled>${activePlayers().filter(x => x.type === 'Mensalista').map(x => `<option ${x.id === playerId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <label class="field">Mês<select disabled><option>${shortMonth(month)}/${y}</option></select></label>
      <label class="field">Valor pago (R$)<input name="amount" type="number" step="0.01" value="${rec ? num(rec.amount) : num(settings().monthlyFee)}" /></label>
      <label class="field" style="justify-content:flex-end"><span style="display:flex;align-items:center;gap:8px"><input name="paid" type="checkbox" ${!rec || rec.paid !== false ? 'checked' : ''} style="width:16px" /> Pagamento realizado</span></label>
      <div class="form-actions" style="grid-column:1/-1">
        ${rec ? `<button class="btn btn-danger" type="button" data-act="delete-payment" data-id="${rec.id}">Remover</button>` : ''}
        ${rec?.paidAt ? `<button class="btn btn-ghost" type="button" data-act="view-receipt" data-id="${rec.id}">🧾 Comprovante</button>` : ''}
        <button class="btn btn-ghost" data-act="close-modal" type="button">Cancelar</button>
        <button class="btn btn-primary" type="submit">Salvar</button>
      </div>
    </form>`);
}

function modalGame() {
  openModal('Novo jogo', 'Informe a data da partida', `
    <form data-form="game" class="form-grid one">
      <label class="field">Data<input name="date" type="date" value="${todayISO()}" required /></label>
      <div class="form-actions"><button class="btn btn-ghost" data-act="close-modal" type="button">Cancelar</button><button class="btn btn-primary" type="submit">Criar jogo</button></div>
    </form>`);
}

function modalCheckin(gameId) {
  const g = state.games.find(x => x.id === gameId);
  if (!g) return;
  const entries = state.dayEntries.filter(d => d.gameId === gameId);
  const players = activePlayers();
  openModal('Check-in · ' + fmtDate(g.date), 'Marque quem jogou e o valor recebido de cada um', `
    <form data-form="checkin" data-id="${gameId}" class="form-grid one">
      <div class="table-wrap" style="max-height:46vh;overflow:auto">
        <table><thead><tr><th>Jogador</th><th>Tipo</th><th class="right">Valor (R$)</th><th class="center">Presente</th></tr></thead><tbody>
          ${players.map(p => {
            const e = entries.find(x => x.playerId === p.id);
            const checked = e ? true : p.type === 'Diarista';
            return `<tr><td>${playerCell(p)}</td><td>${badge(p.type, p.type === 'Mensalista' ? 'green' : 'blue')}</td>
              <td class="right"><input type="number" step="0.01" name="amount-${p.id}" value="${e ? num(e.amount) : p.type === 'Diarista' ? num(settings().dayFee) : 0}" style="width:92px;text-align:right" /></td>
              <td class="center"><input type="checkbox" name="present-${p.id}" ${checked ? 'checked' : ''} style="width:17px;height:17px" /></td></tr>`;
          }).join('')}
        </tbody></table>
      </div>
      <div class="form-actions"><button class="btn btn-ghost" data-act="close-modal" type="button">Cancelar</button><button class="btn btn-primary" type="submit">Salvar check-in</button></div>
    </form>`, true);
}

function modalDay() {
  openModal('Nova diária', 'Lançamento individual', `
    <form data-form="day" class="form-grid one">
      <label class="field">Data<input name="date" type="date" value="${todayISO()}" required /></label>
      <label class="field">Jogador<select name="playerId">${activePlayers().filter(p => p.type === 'Diarista').map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
      <label class="field">Valor (R$)<input name="amount" type="number" step="0.01" value="${num(settings().dayFee)}" /></label>
      <div class="form-actions"><button class="btn btn-ghost" data-act="close-modal" type="button">Cancelar</button><button class="btn btn-primary" type="submit">Salvar</button></div>
    </form>`);
}

function modalExpense(cat) {
  openModal('Nova despesa', 'Valor que sai do caixa', `
    <form data-form="expense" class="form-grid one">
      <label class="field">Data<input name="date" type="date" value="${todayISO()}" required /></label>
      <label class="field">Categoria<select name="category">${EXPENSE_CATS.map(c => `<option ${c === cat ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field">Descrição<input name="description" placeholder="Ex.: aluguel de janeiro" /></label>
      <label class="field">Valor (R$)<input name="amount" type="number" step="0.01" required /></label>
      <div class="form-actions"><button class="btn btn-ghost" data-act="close-modal" type="button">Cancelar</button><button class="btn btn-primary" type="submit">Salvar</button></div>
    </form>`);
}

function modalQuickAdd() {
  openModal('Novo lançamento', 'Escolha o que deseja adicionar', `
    <div class="grid grid-2">
      ${[['player', '👤', 'Jogador', 'Cadastrar mensalista ou diarista'], ['payment', '💳', 'Mensalidade', 'Marcar pagamento'], ['game', '📅', 'Jogo', 'Agendar partida'], ['day', '🎟️', 'Diária', 'Receita de diarista'], ['expense', '🧾', 'Despesa', 'Gasto do racha'], ['benefit', '🎖️', 'Benefício', 'Incentivo a mensalista'], ['settings', '⚙️', 'Premissas', 'Ajustar valores bases']].map(([k, ico, t, d]) => `
        <button class="card card-pad" style="text-align:left" data-act="quick-target" data-target="${k}">
          <div style="font-size:22px">${ico}</div><strong class="small" style="display:block;margin-top:8px">${t}</strong><span class="tiny muted">${d}</span>
        </button>`).join('')}
    </div>`);
}

let pendingPhoto = null;

function modalPhoto(id) {
  const p = playerById(id);
  if (!p) return;
  pendingPhoto = p.photo || null;
  openModal('Foto de ' + p.name, 'JPG ou PNG. A imagem é redimensionada para 256 px e salva no app.', `
    <div class="center">
      <div id="photo-preview">${avatarHTML({ ...p, photo: pendingPhoto }, false).replace('class="avatar', 'class="avatar big')}</div>
      <label class="btn btn-ghost mt" style="position:relative;overflow:hidden">
        📷 Escolher imagem
        <input type="file" id="photo-file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer;padding:0" />
      </label>
      <p class="tiny muted mt">Dica: use uma foto quadrada de rosto para melhor resultado.</p>
    </div>
    <div class="form-actions">
      ${p.photo ? '<button class="btn btn-danger" data-act="remove-photo" data-id="' + id + '" type="button">Remover foto</button>' : ''}
      <button class="btn btn-ghost" data-act="close-modal" type="button">Cancelar</button>
      <button class="btn btn-primary" data-act="save-photo" data-id="${id}" type="button">Salvar foto</button>
    </div>`);
}

function modalCobranca(playerId) {
  const p = playerById(playerId);
  if (!p) return;
  const m = ui.cobrancaMonth || currentMonth(), amount = num(settings().monthlyFee), y = year();
  ui.cobrancaPlayer = playerId;
  ui.cobrancaMonth = m;
  const paid = state.payments.some(x => x.playerId === playerId && x.month === m && x.year === y && x.paid !== false);
  const link = paymentLink(playerId, m, amount);
  const code = pixCode(amount, txidFor(playerId, m));
  openModal('Cobrança · ' + p.name, `Mensalidade de ${monthName(m)}/${y}`, `
    <div class="row" style="justify-content:flex-end;margin-bottom:14px"><label class="select-wrap">Mês ${selectMonths('cobranca-month', m)}</label></div>
    <div class="grid grid-3">
      <div class="card kpi blue"><div class="label">Valor</div><div class="value mono">${money(amount)}</div></div>
      <div class="card kpi"><div class="label">Mês</div><div class="value">${shortMonth(m)}/${y}</div></div>
      <div class="card kpi ${paid ? '' : 'amber'}"><div class="label">Situação</div><div class="value" style="font-size:17px">${paid ? '✅ Pago' : '⏳ Em aberto'}</div></div>
    </div>
    <div class="mt">
      <label class="field">Link de pagamento (abrir no celular)<input id="pay-link" readonly value="${esc(link)}" /></label>
      <div class="row mt">
        <button class="btn btn-primary" data-act="copy-link" type="button">📋 Copiar link</button>
        <button class="btn btn-ghost" data-act="open-pay-link" type="button">🔗 Abrir link</button>
        <button class="btn btn-ghost" data-act="cobrar" data-id="${playerId}" type="button">📲 Enviar no WhatsApp</button>
      </div>
    </div>
    <div class="mt">
      <label class="field">Código PIX copia e cola${code ? '' : ' <span class="warn">(configure a chave PIX em Configurações)</span>'}
        <textarea id="pix-code" readonly rows="3">${esc(code)}</textarea>
      </label>
      ${code ? '<button class="btn btn-ghost btn-sm mt" data-act="copy-pix" type="button">📋 Copiar código PIX</button>' : ''}
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" data-act="close-modal" type="button">Fechar</button>
      ${paid ? '' : `<button class="btn btn-primary" data-act="confirm-payment-modal" data-player="${playerId}" data-month="${m}" data-amount="${amount}" type="button">✅ Já recebi — dar baixa</button>`}
    </div>`, true);
}

function modalBenefit(id) {
  const b = id ? state.benefits.find(x => x.id === id) : null;
  const d = b || { date: todayISO(), playerId: activePlayers()[0]?.id || '', type: 'Camisa/colete', amount: 0, fromCash: true, note: '' };
  openModal(id ? 'Editar benefício' : 'Novo benefício', 'Descontos já refletidos na mensalidade devem marcar "Sai do caixa?" como Não', `
    <form data-form="benefit" data-id="${id || ''}" class="form-grid one">
      <label class="field">Data<input name="date" type="date" value="${esc(d.date)}" required /></label>
      <label class="field">Jogador<select name="playerId">${activePlayers().map(p => `<option value="${p.id}" ${p.id === d.playerId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="field">Tipo<input name="type" value="${esc(d.type || '')}" placeholder="Ex.: camisa, colete, desconto" /></label>
      <label class="field">Valor (R$)<input name="amount" type="number" step="0.01" value="${num(d.amount)}" /></label>
      <label class="field" style="flex-direction:row;align-items:center;gap:8px"><input name="fromCash" type="checkbox" ${d.fromCash ? 'checked' : ''} style="width:16px" /> Sai do caixa (gasto real)</label>
      <label class="field">Observação<input name="note" value="${esc(d.note || '')}" /></label>
      <div class="form-actions"><button class="btn btn-ghost" data-act="close-modal" type="button">Cancelar</button><button class="btn btn-primary" type="submit">Salvar</button></div>
    </form>`);
}

function modalImportCSV() {
  openModal('Importar CSV', 'Exporte a aba do Excel como CSV e cole o conteúdo abaixo', `
    <form data-form="csv" class="form-grid one">
      <label class="field">Tipo de dados
        <select name="entity">
          <option value="players">Jogadores (Nome; Tipo; Posição; Telefone; Observação)</option>
          <option value="payments">Mensalidades (Jogador; Jan; Fev; ...; Dez)</option>
          <option value="expenses">Despesas (Data; Categoria; Descrição; Valor)</option>
          <option value="days">Diárias (Data; Jogador; Valor)</option>
        </select>
      </label>
      <label class="field">Conteúdo do CSV<textarea name="content" rows="10" placeholder="Nome;Tipo;Posição;Telefone;Observação&#10;João Silva;Mensalista;Linha;11999999999;Capitão"></textarea></label>
      <div class="form-actions"><button class="btn btn-ghost" data-act="close-modal" type="button">Cancelar</button><button class="btn btn-primary" type="submit">Importar</button></div>
    </form>`);
}

function modalProfile(id) {
  const p = playerById(id);
  if (!p) return;
  const scores = state.scores.filter(s => s.playerId === id);
  const pts = sum(scores, s => scorePoints(s));
  const paid = state.payments.filter(x => x.playerId === id && x.paid !== false);
  const days = state.dayEntries.filter(d => d.playerId === id);
  const rank = rankingFor('year').find(r => r.playerId === id);
  openModal(p.name, `${p.type} · ${p.position || 'sem posição'}`, `
    <div class="center">${avatarHTML(p, false).replace('class="avatar', 'class="avatar big')}</div>
    <div class="grid grid-4 mt">
      <div class="card kpi"><div class="label">Pontos</div><div class="value">${pts}</div></div>
      <div class="card kpi blue"><div class="label">Gols</div><div class="value">${sum(scores, s => s.goals)}</div></div>
      <div class="card kpi amber"><div class="label">Assist.</div><div class="value">${sum(scores, s => s.assists)}</div></div>
      <div class="card kpi"><div class="label">Posição</div><div class="value">${rank ? '#' + rank.pos : '—'}</div></div>
    </div>
    <div class="grid grid-2 mt">
      <div class="card card-pad"><div class="label tiny muted">CONTATO</div><strong>${esc(p.phone || '—')}</strong><div class="tiny muted mt">${esc(p.note || 'Sem observações')}</div></div>
      <div class="card card-pad"><div class="label tiny muted">FINANCEIRO</div><strong>${paid.length} mensalidades pagas</strong><div class="tiny muted mt">${money(sum(paid, x => x.amount))} pagos · ${days.length} diárias · ${money(sum(days, d => d.amount))}</div></div>
    </div>
    <div class="form-actions"><button class="btn btn-ghost" data-act="close-modal">Fechar</button><button class="btn btn-primary" data-act="edit-player" data-id="${id}">Editar jogador</button></div>`);
}

/* ------------------------------------------------------------
   Ações
   ------------------------------------------------------------ */
function cobrar(playerId) {
  const p = playerById(playerId);
  if (!p?.phone) { toast('Este jogador não tem telefone cadastrado.', 'err'); return; }
  const m = currentMonth();
  const link = paymentLink(p.id, m, settings().monthlyFee);
  const msg = `Olá ${p.name.split(' ')[0]}! Falta a mensalidade de ${monthName(m)}/${year()} do Racha do Loló (${money(settings().monthlyFee)}). Pode pagar? ⚽\n\nLink: ${link}`;
  window.open(`https://wa.me/55${p.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
}

function upsertScore(playerId, key, value) {
  const m = currentMonth(), y = year();
  let sc = state.scores.find(s => s.playerId === playerId && s.month === m && s.year === y);
  if (!sc) {
    sc = { id: uid(), playerId, month: m, year: y, goals: 0, assists: 0, presence: 0, fairPlay: 0, punctual: 0, cards: 0 };
    state.scores.push(sc);
  }
  sc[key] = key === 'fairPlay' || key === 'punctual' ? (value ? 1 : 0) : num(value);
  sc.demo = false;
  const cell = document.getElementById('pts-' + playerId);
  if (cell) cell.textContent = scorePoints(sc);
  save();
}

function exportCashCSV() {
  const rows = cashRows();
  const head = ['Item', ...MONTHS, 'Total'];
  const line = (cells) => cells.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';');
  const out = [head, ...rows.map(r => [
    r.month, r.rev.mens, r.rev.dias, r.rev.total,
    ...CASH_ROWS.map(c => r.exp.byCat[c]), r.exp.total, r.balance, r.acc,
    r.reserveTarget, r.reservePaid, r.reserveDiff, r.metaTarget, r.metaDiff
  ])].map(line).join('\r\n');
  download(`caixa-${year()}.csv`, '\ufeff' + out, 'text/csv;charset=utf-8');
  toast('Caixa exportado em CSV.');
}
function exportPlayersCSV() {
  const head = ['Nome', 'Tipo', 'Posição', 'Telefone', 'Observação'];
  const line = (cells) => cells.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';');
  const out = [head, ...activePlayers().map(p => [p.name, p.type, p.position, p.phone, p.note])].map(line).join('\r\n');
  download('jogadores.csv', '\ufeff' + out, 'text/csv;charset=utf-8');
  toast('Jogadores exportados em CSV.');
}

function parseCSV(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const delim = lines[0].includes(';') ? ';' : ',';
  const split = (line) => {
    const out = []; let cur = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted; }
      else if (c === delim && !quoted) { out.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    out.push(cur.trim());
    return out;
  };
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const head = split(lines[0]).map(norm);
  return lines.slice(1).map(l => {
    const cells = split(l), obj = {};
    head.forEach((h, i) => obj[h] = cells[i] ?? '');
    return obj;
  });
}

function parseCSDate(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return isoDate(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  return todayISO();
}

function importCSV(entity, text) {
  const rows = parseCSV(text);
  if (!rows.length) { toast('CSV vazio ou sem linhas de dados.', 'err'); return; }
  let n = 0;
  const findPlayer = (name) => state.players.find(p => p.name.toLowerCase() === String(name || '').toLowerCase());
  if (entity === 'players') {
    rows.forEach(r => {
      const name = r['nome'] || r['jogador'];
      if (!name) return;
      state.players.push({ id: uid(), name, type: String(r['tipo'] || '').toLowerCase().includes('diar') ? 'Diarista' : 'Mensalista', position: r['posicao'] || 'Linha', phone: r['telefone'] || r['contato'] || '', note: r['observacao'] || '', active: true });
      n++;
    });
  } else if (entity === 'payments') {
    rows.forEach(r => {
      const p = findPlayer(r['jogador'] || r['nome']);
      if (!p) return;
      const y = num(r['ano']) || year();
      MONTHS.forEach((mo, i) => {
        const amount = num(r[mo.toLowerCase()]);
        if (amount <= 0) return;
        state.payments = state.payments.filter(x => !(x.playerId === p.id && x.month === i + 1 && x.year === y));
        state.payments.push({ id: uid(), playerId: p.id, month: i + 1, year: y, amount, paid: true });
        n++;
      });
    });
  } else if (entity === 'expenses') {
    rows.forEach(r => {
      const amount = num(r['valor']);
      if (!amount) return;
      const date = parseCSDate(r['data']), [y, m] = date.split('-').map(Number);
      const cat = EXPENSE_CATS.find(c => c.toLowerCase() === String(r['categoria'] || '').toLowerCase()) || 'Outros';
      state.expenses.push({ id: uid(), date, month: m, year: y, category: cat, description: r['descricao'] || '', amount });
      n++;
    });
  } else if (entity === 'days') {
    rows.forEach(r => {
      const amount = num(r['valor']);
      if (!amount) return;
      let p = findPlayer(r['jogador'] || r['nome']);
      if (!p) {
        p = { id: uid(), name: r['jogador'] || r['nome'], type: 'Diarista', position: 'Linha', phone: '', note: '', active: true };
        state.players.push(p);
      }
      const date = parseCSDate(r['data']), [y, m] = date.split('-').map(Number);
      state.dayEntries.push({ id: uid(), date, month: m, year: y, playerId: p.id, amount });
      n++;
    });
  }
  save(); render();
  toast(n ? `${n} registros importados.` : 'Nenhum registro válido encontrado.', n ? 'ok' : 'err');
}

/* ------------------------------------------------------------
   Eventos
   ------------------------------------------------------------ */
document.addEventListener('click', (e) => {
  const root = $('#modal-root');
  if (e.target === root) { closeModal(); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;

  switch (act) {
    case 'toggle-sidebar': document.body.classList.toggle('menu-open'); break;
    case 'nav': navigate(el.dataset.page); break;
    case 'theme': {
      const light = document.body.dataset.theme !== 'light';
      document.body.dataset.theme = light ? 'light' : 'dark';
      $('#theme-icon').textContent = light ? '🌙' : '☀️';
      $('#theme-label').textContent = light ? 'Tema escuro' : 'Tema claro';
      localStorage.setItem('racha-theme', document.body.dataset.theme);
      break;
    }
    case 'color-preset': {
      const preset = COLOR_PRESETS[el.dataset.preset];
      if (preset) { colors.accent = preset.accent; colors.secondary = preset.secondary; saveColors(); render(); toast('Cores atualizadas.'); }
      break;
    }
    case 'reset-colors': colors = { ...COLOR_PRESETS.padrao }; saveColors(); render(); toast('Cores restauradas.'); break;
    case 'install-app':
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => { deferredPrompt = null; });
      } else {
        toast('Abra o app via HTTPS ou localhost e use “Adicionar à tela inicial” no navegador.', 'err');
      }
      break;
    case 'close-modal': closeModal(); break;
    case 'confirm-yes': { const fn = pendingConfirm; closeModal(); if (fn) fn(); break; }

    case 'open-modal': {
      const m = el.dataset.modal;
      if (m === 'player') modalPlayer();
      else if (m === 'game') modalGame();
      else if (m === 'day') modalDay();
      else if (m === 'expense') modalExpense();
      else if (m === 'benefit') modalBenefit();
      else if (m === 'quick-add') modalQuickAdd();
      else if (m === 'settings') navigate('settings');
      else if (m === 'payment') {
        const first = activePlayers().find(p => p.type === 'Mensalista');
        if (first) modalPayment(first.id, currentMonth()); else toast('Cadastre um mensalista primeiro.', 'err');
      }
      break;
    }
    case 'quick-target': {
      const t = el.dataset.target;
      closeModal();
      if (t === 'player') modalPlayer();
      else if (t === 'game') modalGame();
      else if (t === 'day') modalDay();
      else if (t === 'expense') modalExpense();
      else if (t === 'benefit') modalBenefit();
      else if (t === 'settings') navigate('settings');
      else if (t === 'payment') {
        const first = activePlayers().find(p => p.type === 'Mensalista');
        if (first) modalPayment(first.id, currentMonth()); else toast('Cadastre um mensalista primeiro.', 'err');
      }
      break;
    }

    case 'edit-player': modalPlayer(id); break;
    case 'delete-player': {
      const p = playerById(id);
      confirmAction(`Excluir ${p?.name || 'este jogador'} e todos os lançamentos relacionados?`, () => {
        ['payments', 'dayEntries', 'benefits', 'scores'].forEach(k => state[k] = state[k].filter(x => x.playerId !== id));
        state.players = state.players.filter(x => x.id !== id);
        save(); render(); toast('Jogador excluído.');
      });
      break;
    }
    case 'profile': modalProfile(id); break;
    case 'photo': modalPhoto(id); break;
    case 'cobranca': ui.cobrancaMonth = currentMonth(); modalCobranca(id); break;

    case 'save-photo': {
      const p = playerById(id);
      if (!p) break;
      if (pendingPhoto) p.photo = pendingPhoto;
      save(); closeModal(); render(); toast('Foto salva.');
      break;
    }
    case 'remove-photo': {
      const p = playerById(id);
      if (p) { delete p.photo; save(); }
      pendingPhoto = null; closeModal(); render(); toast('Foto removida.');
      break;
    }
    case 'copy-link': copyText($('#pay-link')?.value || '').then(ok => toast(ok ? 'Link copiado!' : 'Não foi possível copiar.', ok ? 'ok' : 'err')); break;
    case 'copy-pix': copyText($('#pix-code')?.value || '').then(ok => toast(ok ? 'Código PIX copiado!' : 'Não foi possível copiar.', ok ? 'ok' : 'err')); break;
    case 'open-pay-link': {
      const link = $('#pay-link')?.value;
      if (link) window.open(link, '_blank', 'noopener');
      break;
    }
    case 'confirm-payment-modal': {
      const pid = el.dataset.player, mo = num(el.dataset.month), amt = num(el.dataset.amount), y = year();
      state.payments = state.payments.filter(x => !(x.playerId === pid && x.month === mo && x.year === y));
      const rec = ensureReceipt({ id: uid(), playerId: pid, month: mo, year: y, amount: amt, paid: true, paidAt: new Date().toISOString(), origem: 'link' });
      state.payments.push(rec);
      save(); closeModal(); render(); toast('Pagamento registrado e baixa automática concluída!');
      modalReceipt(rec.id);
      break;
    }
    case 'confirm-payment-link': {
      const pp = ui.paymentPage;
      if (!pp) break;
      state.payments = state.payments.filter(x => !(x.playerId === pp.playerId && x.month === pp.month && x.year === year()));
      const rec = ensureReceipt({ id: uid(), playerId: pp.playerId, month: pp.month, year: year(), amount: pp.amount, paid: true, txid: $('#txid-input')?.value || '', paidAt: new Date().toISOString(), origem: 'link' });
      state.payments.push(rec);
      save(); renderPaymentPage(); toast('Pagamento confirmado! Baixa registrada automaticamente.');
      break;
    }
    case 'copy-receipt': {
      const rec = receiptById(id);
      if (!rec) break;
      copyText(receiptText(rec)).then(ok => toast(ok ? 'Comprovante copiado!' : 'Não foi possível copiar.', ok ? 'ok' : 'err'));
      break;
    }
    case 'view-receipt': modalReceipt(id); break;
    case 'download-receipt': { const rec = receiptById(id); if (rec) downloadReceiptPNG(rec); break; }
    case 'print-receipt': { const rec = receiptById(id); if (rec) printReceipt(rec); break; }
    case 'exit-payment': location.hash = ''; break;

    case 'edit-payment': modalPayment(el.dataset.player, num(el.dataset.month)); break;
    case 'delete-payment': {
      state.payments = state.payments.filter(x => x.id !== id);
      save(); closeModal(); render(); toast('Pagamento removido.');
      break;
    }
    case 'pay-all': {
      const m = currentMonth(), y = year();
      activePlayers().filter(p => p.type === 'Mensalista').forEach(p => {
        if (!state.payments.some(x => x.playerId === p.id && x.month === m && x.year === y)) {
          state.payments.push({ id: uid(), playerId: p.id, month: m, year: y, amount: num(settings().monthlyFee), paid: true });
        }
      });
      save(); render(); toast(`Mensalidades de ${shortMonth(m)} marcadas.`);
      break;
    }
    case 'clear-month': {
      const m = currentMonth(), y = year();
      confirmAction(`Remover todos os pagamentos de ${monthName(m)}/${y}?`, () => {
        state.payments = state.payments.filter(x => !(x.month === m && x.year === y));
        save(); render(); toast('Mês limpo.');
      });
      break;
    }
    case 'cobrar': cobrar(id); break;

    case 'game-tab': ui.gameTab = el.dataset.tab; render(); break;
    case 'checkin': modalCheckin(id); break;
    case 'delete-game': confirmAction('Excluir este jogo e todas as diárias associadas?', () => {
      state.dayEntries = state.dayEntries.filter(d => d.gameId !== id);
      state.games = state.games.filter(g => g.id !== id);
      save(); render(); toast('Jogo excluído.');
    }); break;
    case 'generate-games': {
      const m = num($('#gen-month')?.value || currentMonth()), y = year();
      let first = 1 + ((4 - new Date(y, m - 1, 1).getDay() + 7) % 7);
      const lastDay = new Date(y, m, 0).getDate();
      let created = 0;
      while (first <= lastDay) {
        const date = isoDate(y, m, first);
        if (!state.games.some(g => g.date === date && g.year === y)) {
          state.games.push({ id: uid(), date, month: m, year: y, done: false });
          created++;
        }
        first += 7;
      }
      save(); render(); toast(created ? `${created} jogos criados.` : 'Já existem jogos para todas as quintas do mês.');
      break;
    }
    case 'delete-day': confirmAction('Excluir esta diária?', () => {
      state.dayEntries = state.dayEntries.filter(d => d.id !== id);
      save(); render(); toast('Diária excluída.');
    }); break;

    case 'quick-expense': {
      const cat = el.dataset.cat, m = currentMonth(), y = year();
      const amount = cat === 'Quadra' ? num(settings().fieldRent) : num(settings().goalkeepers) * num(settings().goalkeeperFee) * num(settings().gamesPerMonth);
      const date = isoDate(y, m, cat === 'Quadra' ? 5 : 28);
      state.expenses.push({ id: uid(), date, month: m, year: y, category: cat, description: cat === 'Quadra' ? `Aluguel de ${monthName(m)}` : `${settings().goalkeepers} goleiros × ${settings().gamesPerMonth} jogos`, amount });
      save(); render(); toast('Despesa lançada.');
      break;
    }
    case 'delete-expense': confirmAction('Excluir esta despesa?', () => {
      state.expenses = state.expenses.filter(x => x.id !== id);
      save(); render(); toast('Despesa excluída.');
    }); break;

    case 'edit-benefit': modalBenefit(id); break;
    case 'delete-benefit': confirmAction('Excluir este benefício?', () => {
      state.benefits = state.benefits.filter(x => x.id !== id);
      save(); render(); toast('Benefício excluído.');
    }); break;

    case 'rank-filter': ui.rankFilter = isNaN(num(el.dataset.filter)) ? el.dataset.filter : num(el.dataset.filter); render(); break;
    case 'apply-sim': {
      const v = simValues();
      Object.assign(state.settings, { plannedMembers: v.members, monthlyFee: v.fee, dayPlayersPerGame: v.dayPerGame, dayFee: v.dayFee, gamesPerMonth: v.games });
      ui.sim = null; save(); render(); toast('Cenário aplicado às premissas.');
      break;
    }
    case 'export-json': download(`racha-do-lolo-${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json'); toast('Backup baixado.'); break;
    case 'import-json': $('#import-file').click(); break;
    case 'import-csv': modalImportCSV(); break;
    case 'export-cash': exportCashCSV(); break;
    case 'export-players': exportPlayersCSV(); break;
    case 'load-demo': confirmAction('Substituir todos os dados atuais pelo exemplo?', () => {
      state = makeDemoState(); ui.sim = null; save(); render(); toast('Exemplo carregado.');
    }); break;
    case 'clear-demo': confirmAction('Remover todos os registros de demonstração? Suas premissas serão mantidas.', () => {
      ['players', 'payments', 'dayEntries', 'expenses', 'games', 'benefits', 'scores', 'awards'].forEach(k => state[k] = state[k].filter(x => !x.demo));
      save(); render(); toast('Dados de exemplo removidos.');
    }); break;
    case 'clear-all': confirmAction('Apagar TODOS os dados deste navegador? Esta ação não pode ser desfeita.', () => {
      state = emptyState(); ui.sim = null; save(); navigate('dashboard'); toast('Tudo apagado.');
    }); break;
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fd = new FormData(form);
  const v = (k) => String(fd.get(k) ?? '').trim();
  const type = form.dataset.form;

  if (type === 'player') {
    const data = {
      id: form.dataset.id || uid(), name: v('name'), type: v('type'), position: v('position'),
      phone: v('phone'), note: v('note'), active: fd.get('active') !== null
    };
    const idx = state.players.findIndex(p => p.id === data.id);
    if (idx >= 0) state.players[idx] = { ...state.players[idx], ...data, demo: false };
    else state.players.push(data);
    save(); closeModal(); render(); toast('Jogador salvo.');
  }
  else if (type === 'payment') {
    const playerId = v('playerId'), month = num(v('month')), y = year();
    state.payments = state.payments.filter(x => !(x.playerId === playerId && x.month === month && x.year === y));
    if (fd.get('paid') !== null) state.payments.push({ id: uid(), playerId, month, year: y, amount: num(v('amount')), paid: true });
    save(); closeModal(); render(); toast('Pagamento salvo.');
  }
  else if (type === 'game') {
    const date = v('date'), [y, m] = date.split('-').map(Number);
    state.games.push({ id: uid(), date, month: m, year: y, done: false });
    save(); closeModal(); render(); toast('Jogo criado.');
  }
  else if (type === 'checkin') {
    const gid = form.dataset.id;
    const g = state.games.find(x => x.id === gid);
    state.dayEntries = state.dayEntries.filter(d => d.gameId !== gid);
    activePlayers().forEach(p => {
      if (fd.get('present-' + p.id) === null) return;
      const amount = num(v('amount-' + p.id));
      if (amount <= 0) return;
      state.dayEntries.push({ id: uid(), gameId: gid, date: g.date, month: g.month, year: g.year, playerId: p.id, amount });
    });
    if (g) g.done = true;
    save(); closeModal(); render(); toast('Check-in salvo.');
  }
  else if (type === 'day') {
    const date = v('date'), [y, m] = date.split('-').map(Number);
    state.dayEntries.push({ id: uid(), date, month: m, year: y, playerId: v('playerId'), amount: num(v('amount')) });
    save(); closeModal(); render(); toast('Diária lançada.');
  }
  else if (type === 'expense') {
    const date = v('date'), [y, m] = date.split('-').map(Number);
    state.expenses.push({ id: uid(), date, month: m, year: y, category: v('category'), description: v('description'), amount: num(v('amount')) });
    save(); closeModal(); render(); toast('Despesa salva.');
  }
  else if (type === 'award') {
    const m = currentMonth(), y = year();
    let aw = state.awards.find(a => a.month === m && a.year === y);
    if (!aw) { aw = { id: uid(), month: m, year: y }; state.awards.push(aw); }
    Object.assign(aw, {
      bestGk: v('bestGk'), defender: v('defender'), fairPlay: v('fairPlay'), crack: v('crack'),
      vipCount: num(v('vipCount')), gift: v('gift'), cost: num(v('cost')), delivered: fd.get('delivered') !== null, demo: false
    });
    save(); render(); toast('Premiação salva.');
  }
  else if (type === 'benefit') {
    const date = v('date'), [y, m] = date.split('-').map(Number);
    const data = { id: form.dataset.id || uid(), date, month: m, year: y, playerId: v('playerId'), type: v('type'), amount: num(v('amount')), fromCash: fd.get('fromCash') !== null, note: v('note') };
    const idx = state.benefits.findIndex(x => x.id === data.id);
    if (idx >= 0) state.benefits[idx] = { ...state.benefits[idx], ...data, demo: false };
    else state.benefits.push(data);
    save(); closeModal(); render(); toast('Benefício salvo.');
  }
  else if (type === 'csv') {
    importCSV(v('entity'), v('content'));
    closeModal();
  }
  else if (type === 'settings') {
    const numeric = new Set(['year', 'monthlyFee', 'dayFee', 'fieldRent', 'goalkeepers', 'goalkeeperFee', 'refereeFee', 'gamesPerMonth', 'initialCash', 'plannedMembers', 'dayPlayersPerGame', 'bbqCostPerPerson', 'bbqPeople', 'bbqPerYear', 'giftsReserve', 'ptsGoal', 'ptsAssist', 'ptsPresence', 'ptsFairPlay', 'ptsPunctual', 'ptsCard']);
    Object.keys(defaultSettings()).forEach(k => { state.settings[k] = numeric.has(k) ? num(v(k)) : v(k); });
    ui.sim = null; save(); render(); toast('Premissas salvas.');
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'year-select') { state.settings.year = num(el.value); ui.sim = null; save(); render(); return; }
  if (el.id === 'pay-month') { ui.payMonth = num(el.value); render(); return; }
  if (el.id === 'score-month') { ui.scoreMonth = num(el.value); render(); return; }
  if (el.id === 'award-month') { ui.awardMonth = num(el.value); render(); return; }
  if (el.id === 'player-filter') { ui.playerFilter = el.value; render(); return; }
  if (el.id === 'import-file' && el.files?.[0]) {
    const file = el.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.settings || !Array.isArray(data.players)) throw new Error('Arquivo inválido');
        state = data; ui.sim = null; save(); render(); toast('Backup importado.');
      } catch (err) { toast('Não foi possível importar: ' + err.message, 'err'); }
      el.value = '';
    };
    reader.readAsText(file);
    return;
  }
  if (el.id === 'cobranca-month') { ui.cobrancaMonth = num(el.value); if (ui.cobrancaPlayer) modalCobranca(ui.cobrancaPlayer); return; }
  if (el.id === 'color-accent') { colors.accent = el.value; saveColors(); return; }
  if (el.id === 'color-secondary') { colors.secondary = el.value; saveColors(); return; }
  if (el.id === 'photo-file' && el.files?.[0]) {
    resizePhoto(el.files[0], (data) => {
      if (!data) { toast('Não foi possível ler esta imagem.', 'err'); return; }
      pendingPhoto = data;
      const prev = $('#photo-preview');
      if (prev) prev.innerHTML = avatarHTML({ photo: data, name: 'Foto' }, false).replace('class="avatar', 'class="avatar big');
    });
    return;
  }
  if (el.dataset.score) { upsertScore(el.dataset.player, el.dataset.score, el.type === 'checkbox' ? el.checked : el.value); return; }
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'player-search') {
    ui.search = el.value;
    $$('#players-table tbody tr').forEach(tr => {
      tr.style.display = tr.textContent.toLowerCase().includes(ui.search.toLowerCase()) ? '' : 'none';
    });
    return;
  }
  if (el.id === 'color-accent') { colors.accent = el.value; applyColors(); return; }
  if (el.id === 'color-secondary') { colors.secondary = el.value; applyColors(); return; }
  if (el.dataset.sim) {
    const v = simValues();
    v[el.dataset.sim] = num(el.value);
    const out = document.getElementById('out-' + el.dataset.sim);
    if (out) out.textContent = (el.dataset.sim === 'fee' || el.dataset.sim === 'dayFee' ? 'R$ ' : '') + v[el.dataset.sim];
    const res = document.getElementById('sim-result');
    if (res) res.innerHTML = simResultHTML();
    const heat = document.getElementById('sim-heat');
    if (heat) heat.innerHTML = simHeatHTML();
  }
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/* ------------------------------------------------------------
   Inicialização
   ------------------------------------------------------------ */
try {
  const savedTheme = localStorage.getItem('racha-theme');
  if (savedTheme) {
    document.body.dataset.theme = savedTheme;
    $('#theme-icon').textContent = savedTheme === 'light' ? '🌙' : '☀️';
    $('#theme-label').textContent = savedTheme === 'light' ? 'Tema escuro' : 'Tema claro';
  }
} catch (e) { /* ignore */ }

applyColors();
render();
handleHash();

window.addEventListener('hashchange', handleHash);

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });

window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY && e.newValue) {
    try {
      state = JSON.parse(e.newValue);
      if (ui.paymentPage) renderPaymentPage(); else render();
    } catch (err) { /* ignore */ }
  }
  if (e.key === 'racha-colors') {
    try { colors = { ...COLOR_PRESETS.padrao, ...(JSON.parse(e.newValue) || {}) }; applyColors(); } catch (err) { /* ignore */ }
  }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
