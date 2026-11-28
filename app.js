/* ============================================================
   Racha do Loló — aplicativo offline-first
   Todos os dados ficam no localStorage deste navegador.
   ============================================================ */
'use strict';

const STORAGE_KEY = 'racha-do-lolo-v1';
const VIEW_KEY = 'racha-view-token';
const PLAYER_LINKS_KEY = 'racha-player-links';
/* O histórico do cronômetro fica disponível por 24 horas e depois é apagado. */
const TIMER_RETENTION_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTH_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const TEAM_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];
const EXPENSE_CATS = ['Quadra', 'Goleiros', 'Arbitragem', 'Churrasco', 'Material', 'Brindes', 'Outros'];
const CASH_ROWS = ['Quadra', 'Goleiros', 'Arbitragem', 'Churrasco', 'Material', 'Outros', 'Brindes', 'Benefícios'];
/* Premiações: sempre 1º, 2º e 3º lugares, com brinde/custo por colocação. */
const AWARD_PLACES = [
  { place: 1, label: '1º lugar', ico: '🥇', weight: 0.5 },
  { place: 2, label: '2º lugar', ico: '🥈', weight: 0.3 },
  { place: 3, label: '3º lugar', ico: '🥉', weight: 0.2 }
];
/* Cargas da diretoria: pagam como mensalistas, com valor próprio por cargo.
   Limite só de Presidente e Vice; Diretor e Conselheiro não têm teto fixo. */
const BOARD_ROLES = [
  { type: 'Presidente', plural: 'Presidentes', feeKey: 'feePresidente', limit: 1 },
  { type: 'Vice-Presidente', plural: 'Vice-Presidentes', feeKey: 'feeVice', limit: 1 },
  { type: 'Diretor', plural: 'Diretores', feeKey: 'feeDiretor', limit: 0 },
  { type: 'Conselheiro', plural: 'Conselheiros', feeKey: 'feeConselheiro', limit: 0 }
];
const PLAYER_TYPES = ['Mensalista', ...BOARD_ROLES.map(r => r.type), 'Diarista'];

/* Texto padrão do convite enviado ao grupo. O administrador pode editar em
   Configurações → Link para o grupo. {racha} vira o nome cadastrado em
   Perfil do racha; {link} marca onde o endereço aparece. */
const GROUP_ACCESS_MESSAGE = '🏽 {racha}\nCheck-in Liberado! Acesse o link, procure o seu perfil e escolha a forma de pagamento para garantir a sua vaga.\n{link}';
/* Quem já tinha salvo o texto antigo recebe o novo padrão automaticamente. */
const LEGACY_GROUP_ACCESS_MESSAGE = '🏽 Racha do Loló\nCheck-in Liberado! Acesse o link, procure o seu perfil e escolha a forma de pagamento para garantir a sua vaga.\n{link}';

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
  sorteador:  { title: 'Sorteador',        sub: 'Monte as equipes do racha em sete modos diferentes', ico: '🎲' },
  timer:      { title: 'Cronômetro',       sub: 'Tempo das partidas, pausas, placar e gols', ico: '⏱️' },
  live:       { title: 'Ao vivo',          sub: 'Placar e lances do jogo, com atualização para o grupo', ico: '🔴' },
  ranking:    { title: 'Ranking',          sub: 'Campeonato interno trimestral e anual', ico: '🏆' },
  awards:     { title: 'Premiações',       sub: 'Vencedores do mês e brindes entregues', ico: '🎁' },
  subscription: { title: 'Assinatura',     sub: 'Período gratuito, plano e chave de licença', ico: '⭐' },
  settings:   { title: 'Configurações',    sub: 'Premissas, backup e limpeza de dados', ico: '⚙️' },
  comunidade: { title: 'Comunidade',       sub: 'Grupos fechados por cidade para donos de racha', ico: '🌍' }
};

const NAV = [
  { group: 'Gestão', items: ['dashboard', 'players', 'payments', 'games', 'sorteador', 'timer', 'expenses', 'benefits', 'cash'] },
  { group: 'Desempenho', items: ['scores', 'ranking', 'awards', 'live'] },
  { group: 'Planejamento', items: ['simulator', 'settings'] },
  { group: 'Conta', items: ['subscription'] },
  { group: 'Comunidade', items: ['comunidade'] }
];

/* Ações que alteram dados: ficam bloqueadas se a assinatura vencer.
   Navegar, consultar, copiar e baixar backup continuam liberados. */
const WRITE_ACTS = new Set([
  'quick-target', 'edit-player', 'delete-player', 'save-photo', 'remove-photo',
  'confirm-payment-modal', 'confirm-payment-link', 'edit-payment', 'delete-payment',
  'pay-all', 'clear-month', 'generate-games', 'generate-sessions', 'generate-sessions-year', 'session-delete', 'session-clear-selected', 'session-clear-all', 'game-cancel', 'delete-day',
  'delete-expense', 'delete-expense-series', 'expense-clear-selected', 'clear-expenses', 'launch-bbq', 'edit-benefit', 'delete-benefit', 'apply-sim',
  'load-demo', 'clear-demo', 'clear-all', 'import-json', 'import-csv',
  'toggle-confirm', 'confirm-all', 'confirm-none', 'remove-arrival', 'undo-arrival', 'clear-arrivals', 'move-arrival', 'do-draw', 'clear-draw-history',
  'apply-group-confirmations', 'save-manual-draw', 'edit-last-draw', 'move-draw-player', 'save-last-draw', 'cancel-last-draw',
  'timer-start', 'timer-pause', 'timer-resume', 'timer-finish', 'timer-delete', 'timer-clear-history',
  'connect-mp',
  'live-start', 'live-goal', 'live-assist', 'live-card', 'live-undo', 'live-stop',
  'ack-notices', 'add-goal', 'delete-goal',
  'bank-confirm', 'bank-ignore', 'bank-import', 'parse-bank',
  'cancel-daily-credit', 'cancel-daily-refund',
  'checkin', 'game-presence', 'cobranca', 'cobrar',
  'color-preset', 'reset-colors', 'remove-logo',
  'delete-game',
  'manual-confirm',
  'create-view-link', 'refresh-view-link', 'revoke-view',
  'reset-group-message', 'reset-reminders', 'save-view-expiry',
  'restore-backup',
  'send-player-link',
  'session-new', 'session-edit',
  'timer-add-goal', 'timer-remove-goal'
]);

function licenseLocked() {
  return !!(window.RachaLicense && window.RachaLicense.isLocked());
}

/* O link do grupo é um benefício de quem assinou o app: exige acesso ativo
   e o site principal (o espelho do GitHub não tem as funções). */
function viewBlockReason() {
  const L = window.RachaLicense;
  if (!L || !L.canUseServer()) return 'Disponível apenas no site principal. Aqui no teste local (ou no espelho do GitHub) não é possível gerar links.';
  if (!L.key) return 'Disponível para assinantes: assine para criar o link do grupo.';
  if (L.status().kind === 'pending') return 'Aguardando a confirmação do pagamento para liberar o link.';
  if (licenseLocked()) return 'Renove a assinatura para voltar a atualizar o link.';
  return '';
}
function canPublishView() { return !viewBlockReason(); }

function warnLocked() {
  toast('Período/assinatura encerrado. A edição está bloqueada; seus dados estão intactos.', 'err');
  navigate('subscription');
}

/* Porta de entrada para os recursos do PRO (antigo Intermediário). O teste
   grátis e a conta de administrador também passam aqui; o Básico cai na
   tela de assinatura. */
function licenseTier() { return window.RachaLicense?.tier() || 'basic'; }
function hasIntermediate() { return !!(window.RachaLicense?.can('intermediate')); }
function requireIntermediate(feature) {
  if (hasIntermediate()) return true;
  toast('Esse recurso é do Plano PRO: ' + (feature || 'assine para liberar.'), 'err');
  navigate('subscription');
  return false;
}

/* ------------------------------------------------------------
   Utilitários
   ------------------------------------------------------------ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeImageUrl = (v) => {
  if (typeof v !== 'string') return '';
  if (/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(v)) return v;
  if (/^https?:\/\/[^\s<>"'()\\]+$/i.test(v)) return v;
  return '';
};
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num(v));
/* O cartão cobra do jogador o valor líquido + taxa. O caixa do racha usa só o
   líquido: se alguém copiar o valor bruto da tela do jogador, o excesso não
   entra como receita. Descontos (valor menor) continuam valendo. */
const cashNet = (amount, expected) => {
  const wanted = num(expected);
  const typed = num(amount);
  return wanted > 0 && typed > wanted + 0.01 ? wanted : typed;
};
const isMpFeeDescription = (text) => /mercado\s*pago|taxa|tarifa/i.test(String(text || ''));
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
/* Data sugerida nos lançamentos: sempre dentro do ano que o app está controlando. */
const controlDateISO = () => {
  const d = new Date();
  const y = year();
  const m = Math.min(12, Math.max(1, currentMonth() || d.getMonth() + 1));
  const lastDay = new Date(y, m, 0).getDate();
  return isoDate(y, m, Math.min(d.getDate(), lastDay));
};
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
  ta.value = text; ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length);
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
/* Cores vêm do localStorage e podem ter sido alteradas por outro script.
   Só hex é aceito: valores arbitrários quebrariam HTML/CSS e abririam XSS. */
function safeColor(value, fallback) {
  const s = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return '#' + s.slice(1).split('').map((c) => c + c).join('');
  return fallback;
}
function cleanColors(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    ...COLOR_PRESETS.padrao,
    accent: safeColor(src.accent, COLOR_PRESETS.padrao.accent),
    secondary: safeColor(src.secondary, COLOR_PRESETS.padrao.secondary)
  };
}
let colors = (() => {
  try { return cleanColors(JSON.parse(localStorage.getItem('racha-colors')) || {}); }
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
/* BR Code genérico. Sem `amount`, o banco deixa o valor livre (doação). */
function brPixCode(key, name, city, txid, amount) {
  key = String(key || '').trim();
  if (!key) return '';
  const norm = (v, max) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, max);
  const payload =
    emvField('00', '01') +
    emvField('26', emvField('00', 'BR.GOV.BCB.PIX') + emvField('01', key)) +
    emvField('52', '0000') +
    emvField('53', '986') +
    (amount === undefined || amount === null ? '' : emvField('54', Number(amount).toFixed(2))) +
    emvField('58', 'BR') +
    emvField('59', norm(name || 'RACHA DO LOLO', 25)) +
    emvField('60', norm(city || 'SAO PAULO', 15)) +
    emvField('62', emvField('05', String(txid || 'RL').slice(0, 25))) +
    '6304';
  return payload + crc16(payload).toString(16).toUpperCase().padStart(4, '0');
}

/* Doação para o racha: chave configurada pelo administrador. */
function donationPixCode() {
  const s = settings();
  return brPixCode(s.pixKey, s.pixMerchant, s.pixCity, 'DOACAO');
}

/* Doação para o desenvolvedor: chave fixa, igual para todas as instalações. */
function developerDonationPixCode() {
  const d = window.RachaDevDonation || {};
  if (d.enabled === false) return '';
  return brPixCode(d.key, d.name || 'DESENVOLVEDOR', d.city || 'SAO PAULO', 'DEVDOACAO');
}

function pixCode(amount, txid) {
  const s = settings();
  return brPixCode(s.pixKey, s.pixMerchant, s.pixCity, txid || 'RL', amount);
}
function txidFor(playerId, month, paymentYear) {
  /* A dívida antiga mantém o ano em que foi lançada; só uma cobrança nova usa o ano de controle. */
  const y = num(paymentYear) || num(ui.paymentPage?.year) || year();
  return 'RL' + y + String(month).padStart(2, '0') + String(playerId).slice(-4).toUpperCase();
}
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
function toDateTimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromDateTimeLocal(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  return isNaN(d.getTime()) ? '' : d.toISOString();
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
    ['Vencimento', /^\d{4}-\d{2}-\d{2}$/.test(String(rec.dueDate || '')) ? fmtDate(rec.dueDate) : 'Não informado'],
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
      <button class="btn btn-ghost" data-act="copy-receipt" data-id="${esc(rec.id)}">📋 Copiar texto</button>
      <button class="btn btn-ghost" data-act="download-receipt" data-id="${esc(rec.id)}">🖼️ Baixar PNG</button>
      <button class="btn btn-primary" data-act="print-receipt" data-id="${esc(rec.id)}">🖨️ Salvar em PDF</button>
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

/* Relatório mensal para impressão ou "Salvar como PDF". */
function monthlyReportHTML(m) {
  const y = year(), rev = revenue(m), exp = expenses(m), goal = meta(m).withGifts;
  const bal = rev.total - exp.total;
  const pays = state.payments.filter(p => p.year === y && p.month === m);
  const scores = state.scores.filter(s => s.year === y && s.month === m);
  const rank = rankingFor(Math.ceil(m / 3));
  const cell = (v) => `<td>${esc(String(v ?? '—'))}</td>`;
  const moneyCell = (v) => `<td class="right mono">${money(v)}</td>`;
  const catRows = visibleCashRows().filter(c => num(exp.byCat[c]) > 0)
    .map(c => `<tr>${cell(c)}${moneyCell(exp.byCat[c])}</tr>`).join('');
  const payRows = pays.map(p => `<tr>${cell(playerName(p.playerId))}${cell(p.paid !== false ? 'Pago' : 'Em aberto')}${moneyCell(p.amount)}</tr>`).join('');
  const scoreRows = scores.map(s => `<tr>${cell(playerName(s.playerId))}${cell(num(s.presence))}${cell(num(s.goals))}${cell(num(s.assists))}${cell(scorePoints(s))}</tr>`).join('');
  const rankRows = rank.slice(0, 10).map(r => `<tr>${cell('#' + r.pos)}${cell(r.player?.name || playerName(r.playerId))}${cell(r.points)}${cell(r.goals)}</tr>`).join('');
  const extraRows = goals().filter(g => g.mode === 'monthly' && (!g.month || num(g.month) === m))
    .map(g => `<tr>${cell(g.name)}${moneyCell(g.amount)}</tr>`).join('');
  const empty = (span, text) => `<tr><td colspan="${span}" class="muted center">${esc(text)}</td></tr>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório ${m}/${y} · Racha do Loló</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #16213a; margin: 0; font-size: 13px; }
    .top { background: ${colors.accent}; color: #fff; padding: 22px; border-radius: 12px; display: flex; align-items: center; gap: 14px; }
    .logo { width: 50px; height: 50px; border-radius: 12px; background: rgba(255,255,255,.2); display: grid; place-items: center; font-weight: 900; }
    .top strong { font-size: 20px; display: block; }
    .top span { font-size: 12px; opacity: .9; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 20px 0; }
    .kpi { border: 1px solid #e3e9f2; border-radius: 10px; padding: 12px; }
    .kpi span { display: block; font-size: 10px; text-transform: uppercase; color: #64748b; letter-spacing: .6px; }
    .kpi strong { display: block; font-size: 18px; margin-top: 5px; }
    h2 { font-size: 14px; margin: 22px 0 8px; color: ${colors.accent}; text-transform: uppercase; letter-spacing: .6px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    th, td { padding: 7px 8px; border-bottom: 1px solid #e8edf5; text-align: left; }
    th { font-size: 10px; text-transform: uppercase; color: #64748b; background: #f6f8fc; }
    .right { text-align: right; }
    .mono { font-family: monospace; }
    .muted { color: #94a3b8; }
    .center { text-align: center; }
    .total td { font-weight: 800; border-top: 2px solid #16213a; }
    .foot { margin-top: 36px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e8edf5; padding-top: 12px; }
    @media print { .no-print { display: none; } }
  </style></head><body>
    <div class="top"><div class="logo">RL</div><div><strong>RACHA DO LOLO</strong><span>Relatório mensal · ${esc(monthName(m))}/${y}</span></div></div>
    <div class="kpis">
      <div class="kpi"><span>Receitas</span><strong>${money(rev.total)}</strong></div>
      <div class="kpi"><span>Despesas</span><strong>${money(exp.total)}</strong></div>
      <div class="kpi"><span>Resultado</span><strong style="color:${bal < 0 ? '#dc2626' : colors.accent}">${money(bal)}</strong></div>
      <div class="kpi"><span>Meta do mês</span><strong>${money(goal)}</strong></div>
    </div>
    <h2>Receitas</h2>
    <table><thead><tr><th>Origem</th><th class="right">Valor</th></tr></thead><tbody>
      <tr><td>Mensalidades</td>${moneyCell(rev.mens)}</tr>
      <tr><td>Diárias</td>${moneyCell(rev.dias)}</tr>
      <tr class="total"><td>Total</td>${moneyCell(rev.total)}</tr>
    </tbody></table>
    <h2>Despesas por categoria</h2>
    <table><thead><tr><th>Categoria</th><th class="right">Valor</th></tr></thead><tbody>
      ${catRows || empty(2, 'Sem despesas no mês.')}
      <tr class="total"><td>Total</td>${moneyCell(exp.total)}</tr>
    </tbody></table>
    <h2>Mensalidades</h2>
    <table><thead><tr><th>Jogador</th><th>Status</th><th class="right">Valor</th></tr></thead><tbody>
      ${payRows || empty(3, 'Sem lançamentos no mês.')}
    </tbody></table>
    <h2>Presença e pontuação</h2>
    <table><thead><tr><th>Jogador</th><th>Presenças</th><th>Gols</th><th>Assist.</th><th>Pontos</th></tr></thead><tbody>
      ${scoreRows || empty(5, 'Sem pontuação lançada no mês.')}
    </tbody></table>
    <h2>Ranking do trimestre</h2>
    <table><thead><tr><th>Pos.</th><th>Jogador</th><th class="right">Pontos</th><th class="right">Gols</th></tr></thead><tbody>
      ${rankRows || empty(4, 'Sem ranking no trimestre.')}
    </tbody></table>
    ${extraRows ? `<h2>Metas extras do mês</h2><table><thead><tr><th>Meta</th><th class="right">Valor</th></tr></thead><tbody>${extraRows}</tbody></table>` : ''}
    <div class="foot">Documento gerado pelo aplicativo Racha do Loló · registro interno<br>Emitido em ${esc(fmtDateTime(new Date().toISOString()))}</div>
  </body></html>`;
}

function printMonthlyReport(m) {
  const html = monthlyReportHTML(m);
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) { toast('Permita pop-ups para salvar o PDF.', 'err'); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 500);
}

/* Relatório mensal em CSV: mesmas seções do PDF, em colunas fixas para
   abrir no Excel. Os valores ficam como número com vírgula decimal. */
function downloadMonthlyReportCSV(m) {
  const y = year(), rev = revenue(m), exp = expenses(m), goal = meta(m).withGifts;
  const pays = state.payments.filter(p => p.year === y && p.month === m);
  const scores = state.scores.filter(s => s.year === y && s.month === m);
  const rank = rankingFor(Math.ceil(m / 3)).slice(0, 10);
  const extras = goals().filter(g => g.mode === 'monthly' && (!g.month || num(g.month) === m));
  const line = (cells) => cells.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';');
  const valor = (v) => num(v).toFixed(2).replace('.', ',');
  const head = ['Seção', 'Jogador/Item', 'Detalhe', 'Presenças', 'Gols', 'Assist.', 'Defesas', 'Paredões', 'Gols sofridos', 'Pontos', 'Valor', 'Status'];
  const linhas = [
    ['Resumo', 'Receitas', '', '', '', '', '', '', '', '', valor(rev.total), ''],
    ['Resumo', 'Despesas', '', '', '', '', '', '', '', '', valor(exp.total), ''],
    ['Resumo', 'Resultado', '', '', '', '', '', '', '', '', valor(rev.total - exp.total), ''],
    ['Resumo', 'Meta do mês', '', '', '', '', '', '', '', '', valor(goal), ''],
    ['Receitas', 'Mensalidades', '', '', '', '', '', '', '', '', valor(rev.mens), ''],
    ['Receitas', 'Diárias', '', '', '', '', '', '', '', '', valor(rev.dias), '']
  ];
  visibleCashRows().filter(c => num(exp.byCat[c]) > 0).forEach(c => {
    linhas.push(['Despesas', c, '', '', '', '', '', '', '', '', valor(exp.byCat[c]), '']);
  });
  pays.forEach(p => {
    linhas.push(['Mensalidades', playerName(p.playerId), '', '', '', '', '', '', '', '', valor(p.amount), p.paid !== false ? 'Pago' : 'Em aberto']);
  });
  scores.forEach(s => {
    linhas.push(['Pontuação', playerName(s.playerId), '', num(s.presence), num(s.goals), num(s.assists), num(s.defesas), num(s.paredoes), num(s.golsSofridos), scorePoints(s), '', '']);
  });
  rank.forEach(r => {
    linhas.push(['Ranking do trimestre', r.player?.name || playerName(r.playerId), '#' + r.pos, '', num(r.goals), '', '', '', '', r.points, '', '']);
  });
  extras.forEach(g => linhas.push(['Metas extras', g.name, '', '', '', '', '', '', '', '', valor(g.amount), '']));
  const out = [head, ...linhas].map(line).join('\r\n');
  download(`relatorio-${String(m).padStart(2, '0')}-${y}.csv`, '\ufeff' + out, 'text/csv;charset=utf-8');
  toast(`Relatório de ${monthName(m)}/${y} baixado em CSV.`);
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
    year: new Date().getFullYear(), monthlyFee: 60, dayFee: 20, fieldRent: 825,
    feePresidente: 0, feeVice: 0, feeDiretor: 0, feeConselheiro: 0,
    goalkeepers: 2, goalkeeperFee: 30, gamesPerMonth: 4,
    bbqEnabled: true, bbqCostPerPerson: 40, bbqPeople: 18, giftsReserve: 100, bbqPerYear: 3,
    ptsGoal: 3, ptsAssist: 2, ptsPresence: 1, ptsFairPlay: 5, ptsPunctual: 2, ptsCard: -3,
    ptsFarrapou: 3, ptsDesarme: 1, ptsAtrasado: 2,
    ptsDefesas: 0, ptsParedoes: 0, ptsGolsSofridos: 0,
    dayPlayersPerGame: 6, plannedMembers: 18, maxPlayers: 0, initialCash: 300, refereeFee: 0,
    pixKey: '', pixMerchant: 'RACHA DO LOLO', pixCity: 'SAO PAULO', viewExpiresAt: '', paymentMode: 'manual',
    donationEnabled: true, donationText: 'Ajude a manter o racha: qualquer quantia é bem-vinda!',
    rachaName: 'Racha do Loló', rachaFounded: '', rachaLocation: '', rachaTime: '',
    rachaDuration: '1h30', rachaRules: '',
    sessions: [], sessionsSeeded: false,
    dailyPaymentEnabled: true,
    groupAccessMessage: GROUP_ACCESS_MESSAGE,
    reminderGroup: '⚽ {jogo}: jogo em {data} ({horario})!\nAbra o link, vá em Jogadores, encontre seu nome e faça seu check-in/pagamento: {link}\nMensalista paga a mensalidade; diarista paga a diária na sua área.',
    reminderPlayer: '🏽 {jogo}: jogo em {data} ({horario})! Confirme sua presença (mensalidade/diária pelo PIX no seu link): {link}',
    reminderDueGroup: '📢 Mensalidade do racha: {aviso}. Vencimento: {vencimento}. Acesse seu link para regularizar: {link}',
    reminderDuePlayer: '🔔 {jogador}, mensalidade de {mes}/{ano}: {aviso}. Valor {valor}; vencimento {vencimento}. Pague pelo seu link: {link}'
  };
}

function emptyState() {
  return {
    version: 1,
    settings: defaultSettings(),
    players: [], payments: [], dayEntries: [], expenses: [], games: [],
    benefits: [], scores: [], awards: [], confirmations: {}, checkins: {}, arrivals: {}, drawHistory: [], audit: [], goals: [], bank: [],
    timer: { minutes: 10, startTime: '', sessionId: '', current: null, history: [] }
  };
}

function makeDemoState() {
  const s = emptyState();
  const demoYear = new Date().getFullYear();
  s.settings.year = demoYear;
  const p = (id, name, type, position, phone, note, attrs = {}) => ({ id, name, type, position, phone, note, active: true, demo: true, ...attrs });
  /* 18 mensalistas (meta) + 4 diaristas, todos os meses do ano atual quitados. */
  const memberData = [
    ['Rafael Souza', 'Linha', 'Capitão', 34, 178, 78, 80, 82],
    ['Diego Alves', 'Meia', '', 27, 172, 70, 72, 88],
    ['Bruno Lima', 'Zaga', '', 31, 185, 88, 86, 65],
    ['Lucas Prado', 'Ataque', '', 24, 176, 72, 74, 92],
    ['Thiago Nunes', 'Linha', '', 29, 174, 74, 70, 76],
    ['Marcos Gomes', 'Goleiro', 'Titular', 38, 188, 90, 78, 60],
    ['Felipe Rocha', 'Linha', '', 33, 180, 82, 76, 70],
    ['Gustavo Melo', 'Meia', '', 26, 170, 68, 68, 84],
    ['André Costa', 'Zaga', '', 30, 182, 80, 82, 68],
    ['Vinícius Barros', 'Ataque', '', 25, 175, 71, 73, 89],
    ['Rodrigo Pinto', 'Linha', '', 28, 179, 77, 75, 74],
    ['Leandro Dias', 'Meia', '', 32, 173, 73, 71, 80],
    ['Fernando Luz', 'Zaga', '', 36, 184, 85, 84, 62],
    ['Otávio Reis', 'Linha', '', 23, 177, 70, 69, 87],
    ['Samuel Braga', 'Goleiro', 'Reserva', 29, 187, 86, 77, 63],
    ['Tiago Moraes', 'Ataque', '', 27, 174, 72, 75, 90],
    ['Wesley Andrade', 'Meia', '', 26, 171, 69, 70, 85],
    ['Douglas Vieira', 'Zaga', '', 35, 183, 84, 83, 64]
  ];
  const dailyData = [
    ['Pedro Santos', 'Ataque', 22, 177, 71, 76, 90],
    ['João Pereira', 'Linha', 30, 175, 76, 72, 74],
    ['Neto Costa', 'Zaga', 35, 183, 86, 84, 62],
    ['Caio Ribeiro', 'Meia', 25, 171, 69, 70, 86],
    /* Beto e Igor completam os 6 diaristas do financeiro; os 4 abaixo são só perfil. */
    ['Beto Martins', 'Linha', 41, 179, 84, 74, 58],
    ['Igor Freitas', 'Goleiro', 28, 190, 92, 80, 64],
    ['Rafael Nogueira', 'Ataque', 29, 178, 75, 77, 86, true],
    ['Daniel Prado', 'Meia', 27, 172, 70, 71, 83, true],
    ['Eduardo Lima', 'Zaga', 33, 181, 82, 81, 66, true],
    ['Murilo Alves', 'Linha', 24, 176, 73, 72, 88, true]
  ];
  s.players = memberData.map((r, i) => p('p' + (i + 1), r[0], 'Mensalista', r[1],
    '1199999' + String(i + 1).padStart(4, '0'), r[2],
    { age: r[3], height: r[4], weight: r[5], strength: r[6], speed: r[7] }))
    .concat(dailyData.map((r, i) => p('p' + (19 + i), r[0], 'Diarista', r[1],
      '1198888' + String(i + 1).padStart(4, '0'), '',
      { age: r[2], height: r[3], weight: r[4], strength: r[5], speed: r[6], noFinance: !!r[7] })));
  const members = s.players.filter(x => x.type === 'Mensalista');
  const dailies = s.players.filter(x => x.type === 'Diarista' && !x.noFinance);

  for (let m = 1; m <= 12; m++) {
    members.forEach((pl) => {
      s.payments.push({ id: uid(), playerId: pl.id, month: m, year: demoYear, amount: s.settings.monthlyFee, paid: true, demo: true });
    });
    const days = [];
    let d = 1 + ((4 - new Date(demoYear, m - 1, 1).getDay() + 7) % 7);
    while (d <= new Date(demoYear, m, 0).getDate()) { days.push(d); d += 7; }
    days.forEach(day => {
      const date = isoDate(demoYear, m, day);
      const gid = 'g' + m + '-' + day;
      s.games.push({ id: gid, date, month: m, year: demoYear, done: true, demo: true });
      dailies.forEach((dp) => {
        s.dayEntries.push({ id: uid(), gameId: gid, date, month: m, year: demoYear, playerId: dp.id, amount: s.settings.dayFee, demo: true });
      });
    });
    s.expenses.push({ id: uid(), date: isoDate(demoYear, m, 5), month: m, year: demoYear, category: 'Quadra', description: `Aluguel de ${monthName(m)}`, amount: s.settings.fieldRent, fixed: 'fieldRent', demo: true });
    s.expenses.push({ id: uid(), date: isoDate(demoYear, m, 28), month: m, year: demoYear, category: 'Goleiros', description: `2 goleiros × ${days.length} jogos`, amount: 240, fixed: 'goalkeepers', demo: true });
    s.players.forEach((pl, i) => {
      s.scores.push({
        id: uid(), month: m, year: demoYear, playerId: pl.id,
        goals: (i * 7 + m * 3) % 4, assists: (i * 3 + m) % 3,
        presence: 2 + ((i + m) % 3), fairPlay: (i + m) % 5 !== 0 ? 1 : 0,
        punctual: (i + m) % 4 !== 0 ? 1 : 0, cards: (i + m) % 7 === 0 ? 1 : 0, demo: true
      });
    });
  }
  for (let m = 1; m <= 12; m++) {
    const tops = rankScores(s.scores.filter(sc => sc.year === demoYear && sc.month === m), s.settings).slice(0, 3);
    const baseGift = m === 12 ? 'Churrasco de encerramento' : (m % 3 === 0 ? 'Churrasco do trimestre' : 'Brinde do mês');
    s.awards.push({
      id: uid(), month: m, year: demoYear, demo: true, fixed: 'giftsReserve',
      places: AWARD_PLACES.map((meta, i) => ({
        place: meta.place,
        playerId: tops[i]?.playerId || '',
        points: num(tops[i]?.points),
        gift: i === 0 ? baseGift : `Brinde ${meta.label}`,
        cost: Math.round(num(s.settings.giftsReserve) * meta.weight * 100) / 100,
        delivered: m < 12
      }))
    });
  }
  s.expenses.push({ id: uid(), date: `${demoYear}-02-16`, month: 2, year: demoYear, category: 'Material', description: 'Bola e coletes', amount: 120, demo: true });
  [3, 6, 12].forEach(m => {
    s.expenses.push({ id: uid(), date: isoDate(demoYear, m, 20), month: m, year: demoYear, category: 'Churrasco', description: `Churrasco do racha — ${monthName(m)}`, amount: s.settings.bbqCostPerPerson * s.settings.bbqPeople, demo: true });
  });
  s.benefits.push({ id: uid(), date: `${demoYear}-01-14`, month: 1, year: demoYear, playerId: 'p1', type: 'Camisa/colete', amount: 45, fromCash: true, note: 'Primeiro uniforme', demo: true });
  return s;
}

let state;
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  state = raw ? JSON.parse(raw) : makeDemoState();
  if (!state || !state.settings) state = makeDemoState();
} catch (e) { state = makeDemoState(); }

/* IDs voltam de backup/restauração e de outro aba (storage). Restringir o
   alfabeto antes de qualquer render evita quebrar atributos data-*. */
function safeId(value, max = 60) {
  return String(value ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, max) || uid();
}

/* Garante que estados antigos (sem os campos novos) continuem funcionando. */
function normalizeState() {
  if (!state || typeof state !== 'object') state = emptyState();
  if (!state.settings) state.settings = defaultSettings();
  const defaults = defaultSettings();
  Object.keys(defaults).forEach(k => { if (state.settings[k] === undefined || state.settings[k] === null || state.settings[k] === '') state.settings[k] = defaults[k]; });
  if (state.settings.groupAccessMessage === LEGACY_GROUP_ACCESS_MESSAGE) state.settings.groupAccessMessage = GROUP_ACCESS_MESSAGE;
  ['players', 'payments', 'dayEntries', 'expenses', 'games', 'benefits', 'scores', 'awards'].forEach(k => {
    if (!Array.isArray(state[k])) state[k] = [];
    state[k].forEach(row => {
      if (!row || typeof row !== 'object') return;
      row.id = safeId(row.id);
      ['playerId', 'gameId'].forEach(f => { if (row[f] !== undefined) row[f] = safeId(row[f]); });
    });
  });
  state.games.forEach(g => { if (g && typeof g === 'object') g.canceled = !!g.canceled; });
  if (!state.confirmations || typeof state.confirmations !== 'object' || Array.isArray(state.confirmations)) state.confirmations = {};
  if (!state.checkins || typeof state.checkins !== 'object' || Array.isArray(state.checkins)) state.checkins = {};
  if (!state.arrivals || typeof state.arrivals !== 'object' || Array.isArray(state.arrivals)) state.arrivals = {};
  Object.keys(state.arrivals).forEach(k => {
    if (!Array.isArray(state.arrivals[k])) { delete state.arrivals[k]; return; }
    state.arrivals[k] = state.arrivals[k].map(x => typeof x === 'string' ? { id: x, at: '' } : x)
      .filter(x => x && x.id)
      .map(x => ({ id: String(x.id), at: String(x.at || '') }));
  });
  if (!Array.isArray(state.drawHistory)) state.drawHistory = [];
  /* Quem já usava só um racha recebe uma sessão inicial sem perder nada. */
  if (!Array.isArray(state.settings.sessions)) state.settings.sessions = [];
  if (state.settings.sessionsSeeded !== true) {
    if (!state.settings.sessions.length) state.settings.sessions.push({
      id: 'sessao-1', name: String(state.settings.rachaName || 'Racha principal').slice(0, 60),
      day: 4, time: String(state.settings.rachaTime || '19:00'),
      duration: String(state.settings.rachaDuration || '1h30'),
      location: String(state.settings.rachaLocation || '').slice(0, 140),
      notes: '', active: true, withGoalkeepers: true, withReferee: true
    });
    state.settings.sessionsSeeded = true;
  }
  state.settings.sessions = state.settings.sessions.filter(s => s && typeof s === 'object').map(s => ({
    id: safeId(s.id || uid()), name: String(s.name || 'Racha').slice(0, 60),
    day: Math.min(6, Math.max(0, Math.round(num(s.day)))),
    time: /^\d{2}:\d{2}$/.test(String(s.time || '')) ? String(s.time) : '19:00',
    duration: String(s.duration || '1h30').slice(0, 20),
    location: String(s.location || '').slice(0, 140),
    notes: String(s.notes || '').slice(0, 240), active: s.active !== false,
    withGoalkeepers: s.withGoalkeepers !== false, withReferee: s.withReferee !== false
  }));
  if (!state.timer || typeof state.timer !== 'object' || Array.isArray(state.timer)) state.timer = { minutes: 10, startTime: '', sessionId: '', current: null, history: [] };
  state.timer.sessionId = String(state.timer.sessionId || '');
  state.timer.minutes = Math.max(1, Math.round(num(state.timer.minutes) || 10));
  state.timer.startTime = /^\d{2}:\d{2}$/.test(String(state.timer.startTime || '')) ? String(state.timer.startTime) : '';
  if (!Array.isArray(state.timer.history)) state.timer.history = [];
  if (state.timer.current && typeof state.timer.current !== 'object') state.timer.current = null;
  pruneTimerHistory();
  if (!Number.isFinite(Number(state.settings.maxPlayers))) state.settings.maxPlayers = 0;
  if (typeof state.settings.bbqEnabled !== 'boolean') state.settings.bbqEnabled = true;
  if (!Array.isArray(state.audit)) state.audit = [];
  if (!Array.isArray(state.goals)) state.goals = [];
  if (!Array.isArray(state.bank)) state.bank = [];

  /* Migra premiações antigas (brinde único) para 1º/2º/3º lugar. */
  state.awards.forEach(a => {
    if (Array.isArray(a.places)) return;
    const tops = topWinners(num(a.month), num(a.year) || year());
    a.places = AWARD_PLACES.map((meta, i) => ({
      place: meta.place,
      playerId: tops[i]?.playerId || '',
      points: num(tops[i]?.points),
      gift: i === 0 ? String(a.gift || '') : '',
      cost: i === 0 ? num(a.cost) : 0,
      delivered: i === 0 ? !!a.delivered : false
    }));
    delete a.gift; delete a.cost; delete a.delivered;
  });
}

/* Despesas fixas controladas pelas premissas.
   Ao abrir o app ou salvar Configurações, realinha lançamentos e metas. */
function syncFixedExpenses() {
  const s = settings();
  const y = year();
  /* Só realinha o ano de controle. Despesas de outros anos ficam como lançamentos históricos. */
  const noAno = (e) => !num(e.year) || num(e.year) === y;
  const games = Math.max(0, num(s.gamesPerMonth));
  const gkGames = costGames('withGoalkeepers');
  const refGames = costGames('withReferee');
  const rent = num(s.fieldRent);
  const keepers = num(s.goalkeepers) * num(s.goalkeeperFee) * gkGames;
  const referee = num(s.refereeFee) * refGames;
  const bbqUnit = num(s.bbqCostPerPerson) * num(s.bbqPeople);
  const bbqCount = Math.min(12, Math.max(0, Math.round(num(s.bbqPerYear))));
  const bbqPool = [3, 6, 12, 9, 2, 5, 8, 11, 1, 4, 7, 10];
  const bbqMonths = bbqPool.slice(0, bbqCount);

  state.expenses.forEach((e) => {
    if (!e || typeof e !== 'object') return;
    if (num(e.year) && !noAno(e)) return;
    const desc = String(e.description || '');
    if (e.category === 'Quadra' && (e.fixed === 'fieldRent' || e.demo || /^Aluguel de /i.test(desc))) {
      e.amount = rent;
      e.fixed = 'fieldRent';
      e.description = `Aluguel de ${monthName(e.month)}`;
    }
    if (e.category === 'Goleiros' && (e.fixed === 'goalkeepers' || e.demo || /goleiros/i.test(desc))) {
      e.amount = keepers;
      e.fixed = 'goalkeepers';
      e.description = `${num(s.goalkeepers)} goleiros × ${gamesLabel(gkGames)} jogos · ${monthName(e.month)}`;
    }
  });
  if (keepers <= 0) state.expenses = state.expenses.filter(e => !(noAno(e) && e.category === 'Goleiros' && e.fixed === 'goalkeepers'));

  /* Cria/atualiza uma série mensal sem mexer em lançamentos manuais. */
  function syncSeries(category, key, amount, makeDescription, months, enabled) {
    let rows = state.expenses.filter(e => noAno(e) && e.category === category && e.fixed === key);
    if (!rows.length) {
      const adopt = state.expenses.filter(e => noAno(e) && e.category === category && (e.demo || e.seriesId));
      if (adopt.length && adopt.length <= months.length) rows = adopt;
      else if (!adopt.length && enabled && amount > 0) {
        rows = months.map(mo => {
          const row = { id: uid(), date: isoDate(y, mo, 20), month: mo, year: y, category, amount: 0, description: '' };
          state.expenses.push(row);
          return row;
        });
      }
    }
    if (!rows.length) return;
    if (!enabled || amount <= 0) {
      state.expenses = state.expenses.filter(e => !(noAno(e) && e.fixed === key));
      return;
    }
    /* Se a premissa pedir mais churrascos do que os lançamentos atuais,
       completa a série com os meses ainda não usados. */
    if (rows.length < months.length) {
      const used = new Set(rows.map(e => num(e.month)));
      for (const mo of months) {
        if (rows.length >= months.length) break;
        const m = num(mo);
        if (used.has(m)) continue;
        const row = { id: uid(), date: isoDate(y, m, 20), month: m, year: y, category, amount: 0, description: '' };
        state.expenses.push(row);
        rows.push(row);
        used.add(m);
      }
    }
    rows.forEach((e, i) => {
      const mo = num(months[i % months.length]) || num(e.month) || 1;
      e.fixed = key;
      e.year = y;
      e.month = mo;
      e.date = isoDate(y, mo, 20);
      e.amount = amount;
      e.description = makeDescription(mo);
    });
    if (rows.length > months.length) {
      const keep = new Set(rows.slice(0, months.length).map(e => e.id));
      state.expenses = state.expenses.filter(e => !noAno(e) || e.fixed !== key || keep.has(e.id));
    }
  }

  syncSeries('Arbitragem', 'refereeFee', referee,
    () => `${gamesLabel(refGames)} jogos × ${money(s.refereeFee)} de arbitragem`,
    Array.from({ length: 12 }, (_, i) => i + 1), num(s.refereeFee) > 0);
  syncSeries('Churrasco', 'bbq', bbqUnit,
    (mo) => `Churrasco do racha — ${monthName(mo)} (automático)`,
    bbqMonths, bbqCount > 0 && bbqUnit > 0);

  state.awards.forEach(a => {
    if (!a || num(a.year) !== y) return;
    if (a.fixed === 'giftsReserve' || a.demo) {
      const tops = topWinners(num(a.month), y);
      const old = awardPlaces(a);
      a.places = AWARD_PLACES.map((meta, i) => ({
        place: meta.place,
        playerId: tops[i]?.playerId || '',
        points: num(tops[i]?.points),
        gift: old[i].gift,
        cost: Math.round(num(s.giftsReserve) * meta.weight * 100) / 100,
        delivered: old[i].delivered
      }));
      a.fixed = 'giftsReserve';
    }
  });
}
normalizeState();
syncFixedExpenses();

/* ------------------------------------------------------------------
   Fotos em IndexedDB + cópias automáticas + trilha de auditoria.
   O localStorage tem cota de ~5 MB; fotos em data URL estouravam com
   poucas imagens. Se o navegador não tiver IDB, mantemos o modo antigo.
   ------------------------------------------------------------------ */
const PHOTO_DB = 'racha-fotos';
const PHOTO_STORE = 'fotos';
const RACHA_LOGO_ID = '__racha_logo__';
const BACKUP_KEY = 'racha-backups';
const BACKUP_MAX = 5;
const BACKUP_INTERVAL = 10 * 60 * 1000;
let photoDb = null;
let photoSupported = true;
let lastBackupAt = 0;

function openPhotoDb() {
  if (photoDb !== null) return Promise.resolve(photoDb);
  return new Promise((resolve) => {
    try {
      if (!window.indexedDB) { photoSupported = false; photoDb = false; return resolve(false); }
      const req = indexedDB.open(PHOTO_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE);
      };
      req.onsuccess = () => { photoDb = req.result; resolve(photoDb); };
      req.onerror = () => { photoSupported = false; photoDb = false; resolve(false); };
      req.onblocked = () => { photoSupported = false; photoDb = false; resolve(false); };
    } catch (e) { photoSupported = false; photoDb = false; resolve(false); }
  });
}

function photoTx(mode, fn) {
  return openPhotoDb().then((db) => {
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(PHOTO_STORE, mode);
        const req = fn(tx.objectStore(PHOTO_STORE));
        let result = null;
        if (req) req.onsuccess = () => { result = req.result; };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  });
}

function photoPut(id, data) { return photoTx('readwrite', s => s.put(data, String(id))); }
function photoDel(id) { return photoTx('readwrite', s => s.delete(String(id))); }
function photoClear() { return photoTx('readwrite', s => s.clear()); }

function photoGetAll() {
  return openPhotoDb().then((db) => {
    if (!db) return {};
    return new Promise((resolve) => {
      const out = {};
      try {
        const tx = db.transaction(PHOTO_STORE, 'readonly');
        const req = tx.objectStore(PHOTO_STORE).openCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (cur) { out[String(cur.key)] = cur.value; cur.continue(); }
        };
        tx.oncomplete = () => resolve(out);
        tx.onerror = () => resolve(out);
      } catch (e) { resolve(out); }
    });
  });
}

/* Estado gravado no localStorage: sem fotos quando o IDB está disponível. */
function persistedState() {
  if (!photoSupported) return state;
  const settings = { ...state.settings };
  delete settings.rachaLogo;
  return {
    ...state,
    settings,
    players: (state.players || []).map((p) => {
      const copy = { ...p };
      delete copy.photo;
      return copy;
    })
  };
}

async function storePhoto(id, data) {
  const ok = await photoPut(id, data);
  if (ok === null) photoSupported = false;
  return ok !== null;
}

/* Reduz a logo antes de guardar: evita estourar o limite do link público. */
function readLogoImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(png|jpeg|webp)$/i.test(file.type)) { reject(new Error('Escolha uma imagem JPG, PNG ou WebP.')); return; }
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Não consegui ler a imagem.'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagem inválida.'));
      img.onload = () => {
        const scale = Math.min(1, 512 / Math.max(img.width, img.height) || 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        let out = canvas.toDataURL('image/jpeg', 0.8);
        if (out.length > 150000) out = canvas.toDataURL('image/jpeg', 0.6);
        resolve(out);
      };
      img.src = String(fr.result);
    };
    fr.readAsDataURL(file);
  });
}

async function persistPhotosFromState() {
  if (!photoSupported) return;
  const ids = new Set((state.players || []).map(p => p.id));
  ids.add(RACHA_LOGO_ID);
  const stored = await photoGetAll();
  Object.keys(stored).forEach(id => { if (!ids.has(id)) photoDel(id); });
  for (const p of (state.players || [])) {
    if (typeof p.photo === 'string' && p.photo.length > 32) {
      await storePhoto(p.id, p.photo);
    } else if (!stored[p.id]) {
      delete p.photo;
    }
  }
  if (typeof state.settings?.rachaLogo === 'string' && state.settings.rachaLogo.length > 32) {
    await storePhoto(RACHA_LOGO_ID, state.settings.rachaLogo);
  } else if (!stored[RACHA_LOGO_ID]) {
    delete state.settings.rachaLogo;
  }
}

async function hydratePhotos() {
  const stored = await photoGetAll();
  if (!photoSupported) return;
  let migrated = false;
  for (const p of (state.players || [])) {
    if (stored[p.id]) {
      p.photo = stored[p.id];
      delete p.legacyPhoto;
    } else if (typeof p.photo === 'string' && p.photo.length > 32) {
      if (await storePhoto(p.id, p.photo)) migrated = true;
    }
  }
  if (stored[RACHA_LOGO_ID]) state.settings.rachaLogo = stored[RACHA_LOGO_ID];
  const ids = new Set((state.players || []).map(p => p.id));
  ids.add(RACHA_LOGO_ID);
  Object.keys(stored).forEach(id => { if (!ids.has(id)) photoDel(id); });
  if (migrated) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState())); } catch (e) { /* ignore */ }
  }
}

function logAudit(action, detail) {
  try {
    state.audit = Array.isArray(state.audit) ? state.audit : [];
    state.audit.unshift({
      at: new Date().toISOString(),
      action: String(action || '').slice(0, 60),
      detail: String(detail || '').slice(0, 160)
    });
    state.audit = state.audit.slice(0, 100);
  } catch (e) { /* ignore */ }
}

function backupList() {
  try {
    const list = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

function rememberBackup(reason) {
  try {
    const entry = { at: new Date().toISOString(), reason: String(reason || 'Alteração').slice(0, 60), data: persistedState() };
    const list = [entry, ...backupList()].slice(0, BACKUP_MAX);
    localStorage.setItem(BACKUP_KEY, JSON.stringify(list));
  } catch (e) {
    /* Sem espaço: tenta guardar só as três cópias mais recentes. */
    try {
      const entry = { at: new Date().toISOString(), reason: String(reason || 'Alteração').slice(0, 60), data: persistedState() };
      localStorage.setItem(BACKUP_KEY, JSON.stringify([entry, ...backupList().slice(0, 2)]));
    } catch (e2) { /* descarta */ }
  }
}

function maybeBackup(reason) {
  const now = Date.now();
  if (now - lastBackupAt < BACKUP_INTERVAL) return;
  lastBackupAt = now;
  rememberBackup(reason);
}

let viewToken = '';
try { viewToken = String(localStorage.getItem(VIEW_KEY) || '').trim().toUpperCase(); } catch (e) { viewToken = ''; }
let playerLinks = {};
try { playerLinks = JSON.parse(localStorage.getItem(PLAYER_LINKS_KEY) || '{}') || {}; } catch (e) { playerLinks = {}; }
let liveState = null;
let liveSignature = '';
let viewData = null;
let viewTimer = null;
let viewPublishing = false;
let dailySummary = null;
let mpStatus = { loading: true, connected: false, configured: false };

/* Publicação automática: cada alteração salva agenda um envio do retrato ao grupo. */
function scheduleViewPublish() {
  if (!viewToken || !navigator.onLine || !canPublishView()) return;
  clearTimeout(viewTimer);
  viewTimer = setTimeout(() => { publishView(true); }, 2500);
}

function save(reason, detail) {
  if (reason) logAudit(reason, detail);
  if (reason) maybeBackup(reason);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState())); }
  catch (e) { toast('Não foi possível salvar no navegador.', 'err'); }
  scheduleViewPublish();
}

function viewUrl(token) {
  const base = location.origin && location.origin !== 'null' ? location.origin : location.href.split('/').slice(0, 3).join('/');
  return base + '/visualizar.html?v=' + encodeURIComponent(token || viewToken);
}

/* Retrato público: só o que o grupo deve ver. Telefone, PIX, comprovantes,
   observações e despesas individuais ficam de fora. */
function publicSnapshot() {
  const paidByMonth = {};
  const dues = {};
  const paidDues = {};
  let paid = 0, open = 0;
  (state.payments || []).forEach((p) => {
    const key = (num(p.year) || 0) + '-' + (num(p.month) || 0);
    const row = paidByMonth[key] || (paidByMonth[key] = { year: num(p.year), month: num(p.month), paid: 0, open: 0 });
    const amount = num(p.amount);
    const pid = String(p.playerId || '');
    if (p.paid) {
      row.paid += amount; paid += amount;
      if (pid) {
        (paidDues[pid] || (paidDues[pid] = [])).push({
          month: num(p.month), year: num(p.year), amount, paid: true,
          dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(p.dueDate || '')) ? String(p.dueDate) : '',
          paidAt: String(p.paidAt || ''), receiptId: p.receiptId || ''
        });
      }
    } else {
      row.open += amount; open += amount;
      if (pid) {
        const txid = txidFor(pid, num(p.month), num(p.year));
        (dues[pid] || (dues[pid] = [])).push({
          month: num(p.month), year: num(p.year), amount, paid: false,
          dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(p.dueDate || '')) ? String(p.dueDate) : '',
          paidAt: '', pix: pixCode(amount, txid), txid, receiptId: p.receiptId || ''
        });
      }
    }
  });
  return {
    publishedAt: new Date().toISOString(),
    settings: {
      year: num(settings().year), monthlyFee: num(settings().monthlyFee), dayFee: num(settings().dayFee),
      feePresidente: playerFee({ type: 'Presidente' }), feeVice: playerFee({ type: 'Vice-Presidente' }),
      feeDiretor: playerFee({ type: 'Diretor' }), feeConselheiro: playerFee({ type: 'Conselheiro' }),
      goalkeepers: num(settings().goalkeepers), gamesPerMonth: num(settings().gamesPerMonth),
      ptsGoal: num(settings().ptsGoal), ptsAssist: num(settings().ptsAssist), ptsPresence: num(settings().ptsPresence),
      ptsFairPlay: num(settings().ptsFairPlay), ptsPunctual: num(settings().ptsPunctual), ptsCard: num(settings().ptsCard),
      ptsFarrapou: num(settings().ptsFarrapou), ptsDesarme: num(settings().ptsDesarme),
      ptsAtrasado: num(settings().ptsAtrasado),
      ptsDefesas: num(settings().ptsDefesas), ptsParedoes: num(settings().ptsParedoes), ptsGolsSofridos: num(settings().ptsGolsSofridos),
      plannedMembers: num(settings().plannedMembers), maxPlayers: num(settings().maxPlayers),
      dailyPaymentEnabled: settings().dailyPaymentEnabled !== false,
      paymentMode: settings().paymentMode === 'mp' ? 'mp' : 'manual',
      donationEnabled: settings().donationEnabled !== false,
      donationText: String(settings().donationText || '').slice(0, 160),
      donationPix: donationPixCode(),
      pixKey: String(settings().pixKey || '').slice(0, 200),
      pixMerchant: String(settings().pixMerchant || '').slice(0, 25),
      pixCity: String(settings().pixCity || '').slice(0, 15),
      rachaName: String(settings().rachaName || '').slice(0, 90),
      rachaFounded: String(settings().rachaFounded || '').slice(0, 20),
      rachaLocation: String(settings().rachaLocation || '').slice(0, 120),
      rachaTime: String(settings().rachaTime || '').slice(0, 10),
      rachaDuration: String(settings().rachaDuration || '').slice(0, 40),
      rachaRules: String(settings().rachaRules || '').slice(0, 4000),
      rachaLogo: typeof settings().rachaLogo === 'string' && /^data:image\/(png|jpeg|webp);base64,/i.test(settings().rachaLogo) ? settings().rachaLogo.slice(0, 160000) : ''
    },
    players: (state.players || []).map((p) => ({
      id: p.id, name: p.name, type: p.type, position: p.position, active: p.active !== false,
      age: num(p.age), height: num(p.height), weight: num(p.weight),
      strength: num(p.strength), speed: num(p.speed), photo: typeof p.photo === 'string' ? p.photo : ''
    })),
    games: (state.games || []).map((g) => ({ id: g.id, date: g.date, month: num(g.month), year: num(g.year), done: !!g.done, canceled: !!g.canceled, name: String(g.name || '').slice(0, 90), time: String(g.time || '').slice(0, 10) })),
    confirmations: state.confirmations || {},
    drawHistory: (state.drawHistory || []).map((h) => ({
      id: h.id, createdAt: h.createdAt, gameKey: h.gameKey, gameLabel: h.gameLabel,
      mode: h.mode, teamSize: num(h.teamSize), teams: h.teams || []
    })),
    scores: (state.scores || []).map((s) => ({
      id: s.id, playerId: s.playerId, month: num(s.month), year: num(s.year),
      goals: num(s.goals), assists: num(s.assists), presence: num(s.presence),
      fairPlay: num(s.fairPlay), punctual: num(s.punctual), farrapou: num(s.farrapou),
      desarmes: num(s.desarmes), atrasado: num(s.atrasado), cards: num(s.cards),
      defesas: num(s.defesas), paredoes: num(s.paredoes), golsSofridos: num(s.golsSofridos)
    })),
    finance: { paid, open, byMonth: Object.values(paidByMonth) },
    /* dues/paidDues NÃO vão no retrato público: o get-view remove antes de servir.
       Cada jogador vê apenas o que é dele em jogador.html. */
    dues,
    paidDues
  };
}

async function publishView(silent) {
  if (viewPublishing) return { ok: false, error: 'Publicação em andamento.' };
  const blocked = viewBlockReason();
  if (blocked) {
    if (!silent) toast(blocked, 'err');
    return { ok: false, error: blocked };
  }
  const first = !viewToken;
  if (first && !silent) toast('Criando link…');
  viewPublishing = true;
  try {
    const res = await fetch('/.netlify/functions/publish-view', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        licenseKey: window.RachaLicense.key,
        deviceId: window.RachaLicense.deviceId(),
        token: viewToken || undefined,
        expiresAt: settings().viewExpiresAt || null,
        reminderTexts: {
          group: settings().reminderGroup, player: settings().reminderPlayer,
          dueGroup: settings().reminderDueGroup, duePlayer: settings().reminderDuePlayer
        },
        /* Telefones NÃO entram no retrato público: vão separados, só para o
           servidor confirmar o perfil do jogador e abrir o chat do lembrete. */
        playerPhones: Object.fromEntries((state.players || [])
          .filter(p => p && p.id && p.phone)
          .map(p => [p.id, String(p.phone)])),
        snapshot: publicSnapshot()
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Não foi possível publicar.');
    if (data.token && data.token !== viewToken) {
      viewToken = data.token;
      try { localStorage.setItem(VIEW_KEY, viewToken); } catch (e) { /* ignore */ }
    }
    if (data.playerLinks && typeof data.playerLinks === 'object') {
      playerLinks = data.playerLinks;
      try { localStorage.setItem(PLAYER_LINKS_KEY, JSON.stringify(playerLinks)); } catch (e) { /* ignore */ }
    }
    await fetchViewData(true);
    await fetchDailySummary(true);
    if (!silent) toast(first ? 'Link do grupo gerado! Já pode enviar ao grupo.' : 'Link do grupo atualizado!', 'ok');
    return { ok: true, url: data.url || viewUrl(viewToken) };
  } catch (err) {
    if (!silent) toast(err.message || 'Não foi possível publicar.', 'err');
    return { ok: false, error: err.message || 'Não foi possível publicar.' };
  } finally {
    viewPublishing = false;
  }
}

async function revokeView() {
  if (!viewToken) { toast('Não há link para revogar.', 'err'); return; }
  try {
    const res = await fetch('/.netlify/functions/revoke-view', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        licenseKey: window.RachaLicense.key,
        deviceId: window.RachaLicense.deviceId(),
        token: viewToken
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Não foi possível revogar.');
    viewToken = ''; playerLinks = {}; dailySummary = null;
    try { localStorage.removeItem(VIEW_KEY); localStorage.removeItem(PLAYER_LINKS_KEY); } catch (e) { /* ignore */ }
    viewData = null;
    save('revogou link do grupo', data.token || '');
    render();
    toast('Link revogado. O antigo não funciona mais.', 'ok');
  } catch (err) {
    toast(err.message || 'Não foi possível revogar.', 'err');
  }
}

/* Lê o retrato público (respostas, fila, notas e placar) para o painel do admin. */
async function fetchViewData(silent) {
  if (!viewToken || !navigator.onLine || !window.RachaLicense?.canUseServer()) return null;
  try {
    const res = await fetch('/.netlify/functions/get-view?v=' + encodeURIComponent(viewToken), { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    if (!data || !data.token) return null;
    viewData = data;
    const sig = JSON.stringify(data.live || null);
    if (sig !== liveSignature) { liveSignature = sig; liveState = data.live || null; }
    return data;
  } catch (e) { if (!silent) toast('Sem conexão com o link do grupo.', 'err'); return null; }
}

/* Resumo das diárias pagas no servidor (somente contagens, sem dados pessoais). */
async function fetchDailySummary(silent) {
  if (!viewToken || !navigator.onLine || !window.RachaLicense?.canUseServer()) return null;
  try {
    const res = await fetch('/.netlify/functions/manage-daily-payments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        licenseKey: window.RachaLicense.key,
        deviceId: window.RachaLicense.deviceId(),
        token: viewToken,
        action: 'summary'
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Não foi possível consultar as diárias.');
    dailySummary = data;
    return data;
  } catch (err) {
    if (!silent) toast(err.message || 'Não foi possível consultar as diárias.', 'err');
    return null;
  }
}

async function cancelDailyPaidGame(gameId, policy) {
  if (!gameId || !viewToken || !window.RachaLicense?.canUseServer()) {
    toast('Atualize o link do grupo antes de cancelar.', 'err');
    return;
  }
  toast('Aplicando cancelamento…');
  try {
    const res = await fetch('/.netlify/functions/manage-daily-payments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        licenseKey: window.RachaLicense.key,
        deviceId: window.RachaLicense.deviceId(),
        token: viewToken,
        action: 'cancel',
        gameId,
        policy
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Não foi possível cancelar.');
    toast(data.message || 'Cancelamento aplicado.', data.failed ? 'err' : 'ok');
    await fetchDailySummary(true);
    render();
  } catch (err) {
    toast(err.message || 'Não foi possível cancelar.', 'err');
  }
}

/* Limpa os avisos enviados pelos jogadores no plano Básico. */
async function ackPaymentNotices() {
  if (!viewToken || !window.RachaLicense?.canUseServer()) {
    toast('Atualize o link do grupo antes de marcar os avisos.', 'err');
    return;
  }
  try {
    const res = await fetch('/.netlify/functions/manage-daily-payments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        licenseKey: window.RachaLicense.key,
        deviceId: window.RachaLicense.deviceId(),
        token: viewToken,
        action: 'ack-notices'
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Não foi possível marcar os avisos.');
    toast(data.message || 'Avisos marcados como vistos.', 'ok');
    await fetchDailySummary(true);
    render();
  } catch (err) {
    toast(err.message || 'Não foi possível marcar os avisos.', 'err');
  }
}

/* Vínculo da conta Mercado Pago do administrador. Tokens nunca vêm para o
   navegador: aqui só consultamos um status e abrimos a URL de autorização. */
async function loadMpStatus(force) {
  const L = window.RachaLicense;
  if (!L || !L.key || !L.canUseServer()) {
    mpStatus = { loading: false, connected: false, configured: false, unavailable: true };
    return;
  }
  if (!force && !mpStatus.loading && Date.now() - num(mpStatus.checkedAt) < 60000) return;
  const before = JSON.stringify(mpStatus);
  mpStatus = { ...mpStatus, loading: true };
  try {
    const res = await fetch('/.netlify/functions/mp-connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'status', licenseKey: L.key, deviceId: L.deviceId() })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Não foi possível consultar o vínculo.');
    mpStatus = { ...data, loading: false, checkedAt: Date.now() };
  } catch (err) {
    mpStatus = { loading: false, connected: false, configured: false, checkedAt: Date.now(), error: err.message };
  }
  if (ui.page === 'settings' && JSON.stringify(mpStatus) !== before) render();
}

async function startMpConnect() {
  const L = window.RachaLicense;
  if (!L || !L.key || !L.canUseServer()) {
    toast('Use o site principal com a assinatura ativa para conectar.', 'err');
    return;
  }
  toast('Abrindo o Mercado Pago…');
  try {
    const res = await fetch('/.netlify/functions/mp-connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'start', licenseKey: L.key, deviceId: L.deviceId() })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.authorizationUrl) {
      throw new Error(data.error || 'Não foi possível iniciar a conexão.');
    }
    window.location.href = data.authorizationUrl;
  } catch (err) {
    toast(err.message || 'Não foi possível conectar. Tente novamente.', 'err');
  }
}

/* Marca presença e/ou pagamento direto no link privado, sem depender do PIX. */
async function applyManualConfirm(playerId, gameId, presence, payment) {
  if (!viewToken || !window.RachaLicense?.canUseServer()) {
    toast('Atualize o link do grupo antes de confirmar.', 'err');
    return;
  }
  toast('Aplicando confirmação manual…');
  try {
    const res = await fetch('/.netlify/functions/admin-confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        licenseKey: window.RachaLicense.key,
        deviceId: window.RachaLicense.deviceId(),
        token: viewToken,
        playerId,
        gameId,
        presence,
        payment
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Não foi possível confirmar.');
    toast(data.message || 'Confirmação manual aplicada.', 'ok');
    await Promise.all([fetchViewData(true), fetchDailySummary(true)]);
    render();
  } catch (err) {
    toast(err.message || 'Não foi possível confirmar.', 'err');
  }
}

function liveUrl() {
  const base = location.origin && location.origin !== 'null' ? location.origin : location.href.split('/').slice(0, 3).join('/');
  return base + '/ao-vivo.html?v=' + encodeURIComponent(viewToken);
}

function waLink(text) { return 'https://wa.me/?text=' + encodeURIComponent(String(text || '')); }

/* Número do WhatsApp já com o código do Brasil. Aceita 10/11 dígitos ou 55+DDD. */
function waNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return /^55\d{10,11}$/.test(d) ? d : '';
}

/* Abre o chat do jogador quando há telefone cadastrado; senão deixa escolher. */
function waDirect(phone, message) {
  const number = waNumber(phone);
  const text = String(message || '');
  return number ? 'https://wa.me/' + number + '?text=' + encodeURIComponent(text) : waLink(text);
}

function shareMessage(kind) {
  /* Texto único para os botões 📤 Enviar ao grupo e 📋 Copiar p/ grupo.
     Editável em Configurações; se não houver {link}, ele é acrescentado no fim. */
  if (kind === 'view') return renderReminderText(settings().groupAccessMessage || GROUP_ACCESS_MESSAGE, { link: viewUrl() });
  if (kind === 'team') {
    const last = state.drawHistory[0];
    if (!last) return '';
    const lines = (last.teams || []).map((t, i) => `Time ${i + 1}: ${t.map(id => playerName(id)).join(', ')}`);
    return `🎲 Times do racha (${last.gameLabel || 'jogo'})\n${lines.join('\n')}`;
  }
  return '';
}

async function shareWhatsApp(kind) {
  const text = shareMessage(kind);
  if (!text) { toast('Ainda não há nada para compartilhar.', 'err'); return; }
  window.open(waLink(text), '_blank', 'noopener');
  toast('Mensagem pronta no WhatsApp!');
}

/* Para navegadores antigos onde o WhatsApp Web pede atualização: copia o
   mesmo link para o usuário colar no Chrome/Edge e abrir o app por lá. */
async function copyWhatsApp(kind) {
  const text = shareMessage(kind);
  if (!text) { toast('Ainda não há nada para compartilhar.', 'err'); return; }
  const url = waLink(text);
  if (await copyText(url)) { toast('Link do WhatsApp copiado! Cole no Chrome/Edge para abrir o app.'); return; }
  openModal('Copiar link do WhatsApp', 'Cole no Chrome/Edge para abrir o app', `
    <label class="field">Link<input id="wa-copy-input" readonly value="${esc(url)}" /></label>
    <p class="tiny muted mt">O texto já está marcado. Pressione <strong>Ctrl+C</strong> (ou ⌘+C) e cole na barra do Chrome/Edge.</p>`);
  const input = $('#wa-copy-input');
  if (input) { input.focus(); input.select(); input.setSelectionRange(0, input.value.length); }
}

/* Lembretes manuais: usam os links individuais já publicados.
   Em produção, a função agendada send-reminders faz o mesmo automaticamente. */
/* Frases editáveis. Placeholders: {racha} (nome do cliente), {jogo}, {data},
   {horario}, {link} e {jogador}. Sem {link}, o destino é acrescentado no fim. */
function gameNameForReminder(g) {
  return String(g?.name || '').trim().slice(0, 90) || 'Racha do Loló';
}
function gameTimeForReminder(g) {
  return String(g?.time || '').trim().slice(0, 10) || 'horário a definir';
}
function renderReminderText(template, ctx) {
  const raw = String(template || '').replace(/\r\n?/g, '\n').slice(0, 700);
  const hasLink = /\{link\}/i.test(raw);
  const out = raw
    .replace(/\{racha\}/gi, String(ctx.rachaName || settings().rachaName || 'Racha do Loló').slice(0, 90))
    .replace(/\{jogo\}/gi, String(ctx.gameName || 'Racha do Loló').slice(0, 90))
    .replace(/\{data\}/gi, String(ctx.date || '').slice(0, 30))
    .replace(/\{horario\}/gi, String(ctx.time || 'horário a definir').slice(0, 20))
    .replace(/\{jogador\}/gi, String(ctx.playerName || '').split(' ')[0].slice(0, 40))
    .replace(/\{link\}/gi, String(ctx.link || ''));
  return hasLink ? out.trim() : [out.trim(), ctx.link].filter(Boolean).join('\n').trim();
}

/* Mensalidade: vencimento manual e cobrança só no vencimento e 3 dias depois. */
function shiftDateISO(iso, days) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  const d = new Date(Date.UTC(num(m[1]), num(m[2]) - 1, num(m[3])));
  if (isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
function renderDueText(template, ctx) {
  const raw = String(template || '').replace(/\r\n?/g, '\n').slice(0, 700);
  const hasLink = /\{link\}/i.test(raw);
  const out = raw
    .replace(/\{jogador\}/gi, String(ctx.playerName || '').split(' ')[0].slice(0, 40))
    .replace(/\{mes\}/gi, String(num(ctx.month)).padStart(2, '0'))
    .replace(/\{ano\}/gi, String(num(ctx.year)))
    .replace(/\{vencimento\}/gi, String(ctx.dueLabel || '—').slice(0, 30))
    .replace(/\{valor\}/gi, money(ctx.amount))
    .replace(/\{aviso\}/gi, String(ctx.notice || '').slice(0, 80))
    .replace(/\{link\}/gi, String(ctx.link || '').slice(0, 400));
  return hasLink ? out.trim() : [out.trim(), ctx.link].filter(Boolean).join('\n').trim();
}
function monthlyReminderLinks() {
  const today = todayISO(), late = shiftDateISO(today, -3), out = [];
  if (!today) return out;
  const paid = new Set();
  (dailySummary?.monthlyPaid || {}) && Object.entries(dailySummary.monthlyPaid).forEach(([pid, months]) => {
    (Array.isArray(months) ? months : []).forEach(k => paid.add(pid + '|' + k));
  });
  const rows = [];
  (state.payments || []).forEach(p => {
    if (p.paid !== false) return;
    const due = /^\d{4}-\d{2}-\d{2}$/.test(String(p.dueDate || '')) ? String(p.dueDate) : '';
    if (due !== today && due !== late) return;
    if (paid.has(p.playerId + '|' + p.year + '-' + String(num(p.month)).padStart(2, '0'))) return;
    rows.push({ ...p, due });
  });
  if (!rows.length) return out;
  const ctxBase = {
    dueLabel: fmtDate(rows[0].due),
    notice: rows[0].due === today ? 'vence hoje' : 'está em atraso',
    link: viewToken ? viewUrl(viewToken) : ''
  };
  if (ctxBase.link) out.push({
    when: rows[0].due === today ? 'vencimento' : '3 dias depois',
    name: 'Grupo do racha', group: true, url: waLink(renderDueText(settings().reminderDueGroup, ctxBase)), direct: false
  });
  Object.entries(playerLinks || {}).forEach(([pid, url]) => {
    const row = rows.find(r => r.playerId === pid);
    const p = playerById(pid);
    if (!row || !p || !url) return;
    out.push({
      when: row.due === today ? 'vencimento' : '3 dias depois',
      name: p.name,
      url: waDirect(p.phone, renderDueText(settings().reminderDuePlayer, {
        ...ctxBase, link: url, playerName: p.name,
        month: row.month, year: row.year, amount: num(row.amount),
        notice: row.due === today ? 'vence hoje' : 'está em atraso desde ' + fmtDate(row.due)
      })),
      direct: !!waNumber(p.phone)
    });
  });
  return out;
}
function reminderLinks() {
  const now = Date.now();
  const games = (viewData?.snapshot?.games || []).filter(g => g.date && !g.done && !g.canceled).slice(0, 20);
  const entries = Object.entries(playerLinks || {});
  const out = monthlyReminderLinks();
  games.forEach(g => {
    const hours = (new Date(g.date + 'T12:00:00').getTime() - now) / 3600000;
    const when = hours >= 23 && hours <= 25 ? '24h' : hours >= 1 && hours <= 3 ? '2h' : '';
    if (!when) return;
    if (viewToken) {
      const groupText = renderReminderText(settings().reminderGroup, {
        gameName: gameNameForReminder(g), date: fmtDate(g.date),
        time: gameTimeForReminder(g), link: viewUrl(viewToken)
      });
      out.push({ when, name: 'Grupo do racha', group: true, url: waLink(groupText), direct: false });
    }
    entries.forEach(([pid, url]) => {
      const p = playerById(pid);
      if (!p || !url) return;
      const text = renderReminderText(settings().reminderPlayer, {
        gameName: gameNameForReminder(g), date: fmtDate(g.date),
        time: gameTimeForReminder(g), link: url, playerName: p.name
      });
      out.push({ when, name: p.name, url: waDirect(p.phone, text), direct: !!waNumber(p.phone) });
    });
  });
  return out.slice(0, 100);
}

function modalReminders() {
  const list = reminderLinks();
  openModal('Lembretes para o grupo', 'Jogos em 24h/2h e mensalidade no vencimento + 3 dias', list.length ? `
    <p class="small muted"><strong>📢 Grupo</strong> avisa todo mundo com o link público (sem nomes, valores, telefones ou links individuais). <strong>🔔</strong> abre o chat privado de cada jogador. Quem não tem telefone cadastrado abre o WhatsApp para você escolher o contato. As frases podem ser editadas em Configurações → Lembretes automáticos; a função agendada usa as mesmas frases.</p>
    <div class="stack mt">${list.map(r => `<a class="btn ${r.group ? 'btn-primary' : 'btn-ghost'}" href="${esc(r.url)}" target="_blank" rel="noopener">${r.group ? '📢 Grupo' : '🔔 ' + esc(r.name)} · ${esc(r.when)}</a>`).join('')}</div>` : `
    <p class="small muted">Nenhum lembrete cai nas janelas de agora. Volte mais perto do jogo ou do vencimento.</p>`);
}

async function publishLive(body) {
  try {
    const res = await fetch('/.netlify/functions/publish-live', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({
        licenseKey: window.RachaLicense.key, deviceId: window.RachaLicense.deviceId(), v: viewToken
      }, body || {}))
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Não foi possível atualizar o placar.');
    liveState = data.live || null;
    liveSignature = JSON.stringify(liveState);
    toast('Placar atualizado!', 'ok');
    await fetchViewData(true);
    render(true);
    return data;
  } catch (err) { toast(err.message || 'Não foi possível atualizar o placar.', 'err'); return { ok: false }; }
}

function runLiveAction(action) {
  const gameId = $('#live-game')?.value || '';
  const playerId = $('#live-player')?.value || '';
  const selectedTeam = $('#live-team')?.value || ui.liveTeam;
  const team = TEAM_KEYS.includes(selectedTeam) ? selectedTeam : 'A';
  if ((action === 'start' || action === 'goal' || action === 'assist' || action === 'card') && !$('#live-game')) return;
  if ((action === 'goal' || action === 'assist' || action === 'card') && !playerId) { toast('Escolha o jogador.', 'err'); return; }
  publishLive({ action, gameId, playerId, team });
}

function settings() { return state.settings; }
function year() { return num(state.settings.year) || new Date().getFullYear(); }

const ui = {
  page: 'dashboard',
  payMonth: null,
  scoreMonth: null,
  awardMonth: null,
  cashMonth: null,
  gameTab: 'games',
  gameMonth: 0,
  rankFilter: 'year',
  sim: null,
  search: '',
  playerFilter: 'all',
  drawGame: null,
  drawMode: 'balanced',
  drawSize: 6,
  editingDraw: false,
  draftTeams: null,
  liveTeam: 'A',
  bankRows: [],
  bankText: ''
};

/* ------------------------------------------------------------
   Cálculos derivados
   ------------------------------------------------------------ */
function activePlayers() { return state.players.filter(p => p.active !== false); }
function playerById(id) { return state.players.find(p => p.id === id) || null; }
function playerName(id) { return playerById(id)?.name || 'Jogador removido'; }
/* Diarista é o único que paga por jogo; todos os demais pagam mensalidade. */
function isMonthlyPlayer(p) { return !!p && String(p.type || '') !== 'Diarista'; }
function roleDef(type) { return BOARD_ROLES.find(r => r.type === type) || null; }
function sessionsList() { return Array.isArray(settings().sessions) ? settings().sessions : []; }
function activeSessions() { return sessionsList().filter(s => s && s.active !== false); }
function sessionById(id) { return sessionsList().find(s => s.id === id) || null; }
/* Quantos "jogos por mês" entram no custo de goleiros/arbitragem.
   Cada racha ativo pode desligar o custo; sem rachas, vale gamesPerMonth. */
function costGames(field) {
  const base = Math.max(0, num(settings().gamesPerMonth));
  const list = activeSessions();
  if (!list.length) return base;
  const on = list.filter(s => s[field] !== false).length;
  if (!on) return 0;
  return Math.round(base * on / list.length * 100) / 100;
}
function gamesLabel(n) {
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}
/* Valor do cargo nunca fica abaixo da mensalista: 0 ou vazio = usa a base. */
function playerFee(p) {
  const base = num(settings().monthlyFee), def = roleDef(p?.type);
  return def ? Math.max(base, num(settings()[def.feeKey])) : base;
}
function feeForPlayerId(id) { return playerFee(playerById(id)); }
function roleCount(type, exceptId) { return activePlayers().filter(p => p.type === type && p.id !== exceptId).length; }
function roleLimitError(type, exceptId) {
  const def = roleDef(type);
  if (!def || !def.limit) return '';
  return roleCount(type, exceptId) >= def.limit
    ? `Já existe ${def.limit} ${def.type} cadastrado. Só pode haver ${def.limit}.`
    : '';
}
function parsePlayerType(raw) {
  const t = String(raw || '').trim().toLowerCase();
  const exact = PLAYER_TYPES.find(x => x.toLowerCase() === t);
  if (exact) return exact;
  if (t.includes('diar')) return 'Diarista';
  if (t.includes('vice')) return 'Vice-Presidente';
  if (t.includes('presi')) return 'Presidente';
  if (t.includes('diretor')) return 'Diretor';
  if (t.includes('conselh')) return 'Conselheiro';
  return 'Mensalista';
}
function bbqHidden() { return state.settings.bbqEnabled === false; }
function visibleExpenseCats() { return bbqHidden() ? EXPENSE_CATS.filter(c => c !== 'Churrasco') : EXPENSE_CATS; }
function visibleCashRows() { return bbqHidden() ? CASH_ROWS.filter(c => c !== 'Churrasco') : CASH_ROWS; }
function displayExpenseCat(cat) { return bbqHidden() && cat === 'Churrasco' ? 'Outros' : cat; }

function goals() { return Array.isArray(state.goals) ? state.goals : []; }

/* Metas mensais extras: sem mês = recorrente; com mês = apenas aquele mês. */
function monthlyGoalFor(m) {
  return sum(goals().filter(g => g.mode === 'monthly' && (!g.month || num(g.month) === m)), g => num(g.amount));
}

function annualGoals() {
  return goals().filter(g => g.mode === 'annual' && (!g.year || num(g.year) === year()));
}

function goalProgress(g) {
  const pct = num(g.amount) > 0 ? (num(g.progress) / num(g.amount)) * 100 : 0;
  return Math.max(0, Math.min(100, pct));
}

function meta(month = currentMonth()) {
  const s = settings();
  const fixed = num(s.fieldRent) + num(s.goalkeepers) * num(s.goalkeeperFee) * costGames('withGoalkeepers') + num(s.refereeFee) * costGames('withReferee');
  const bbqAnnual = s.bbqEnabled === false ? 0 : num(s.bbqCostPerPerson) * num(s.bbqPeople) * num(s.bbqPerYear);
  const bbqMonthly = bbqAnnual / 12;
  const customMonthly = monthlyGoalFor(month);
  return {
    fixed, bbqAnnual, bbqMonthly, customMonthly,
    base: fixed + bbqMonthly + customMonthly,
    withGifts: fixed + bbqMonthly + customMonthly + num(s.giftsReserve)
  };
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
    byCat[displayExpenseCat(cat)] += num(e.amount);
  });
  byCat['Benefícios'] = sum(state.benefits.filter(b => b.year === y && b.month === m && b.fromCash), b => b.amount);
  byCat['Brindes'] = sum(state.awards.filter(a => a.year === y && a.month === m), awardTotal)
    + sum(state.expenses.filter(e => e.year === y && e.month === m && e.category === 'Brindes'), e => e.amount);
  const total = visibleCashRows().reduce((a, c) => a + byCat[c], 0);
  return { byCat, total };
}

function cashRows() {
  let acc = num(settings().initialCash), paidBbq = 0;
  const m = meta();
  const rows = [];
  for (let i = 1; i <= 12; i++) {
    const rev = revenue(i), exp = expenses(i);
    const mm = meta(i);
    const balance = rev.total - exp.total;
    acc += balance;
    paidBbq += exp.byCat['Churrasco'];
    rows.push({
      month: i, rev, exp, balance, acc,
      reserveTarget: m.bbqMonthly * i, reservePaid: paidBbq,
      reserveDiff: paidBbq - m.bbqMonthly * i,
      metaTarget: mm.withGifts, metaDiff: rev.total - mm.withGifts
    });
  }
  return rows;
}

function currentMonth() {
  if (ui.page === 'scores' && ui.scoreMonth) return num(ui.scoreMonth);
  if (ui.page === 'awards' && ui.awardMonth) return num(ui.awardMonth);
  if (ui.page === 'payments' && ui.payMonth) return num(ui.payMonth);
  const y = year();
  const sameYear = (x) => (num(x.year) || y) === y;
  const candidates = [
    ...state.payments.filter(sameYear).map(x => x.month),
    ...state.dayEntries.filter(sameYear).map(x => x.month),
    ...state.expenses.filter(sameYear).map(x => x.month),
    ...state.scores.filter(sameYear).map(x => x.month)
  ].filter(m => m >= 1 && m <= 12);
  return candidates.length ? Math.max(...candidates) : (new Date().getMonth() + 1);
}

function scorePointsWith(sc, cfg) {
  return num(sc.goals) * num(cfg.ptsGoal) + num(sc.assists) * num(cfg.ptsAssist) + num(sc.presence) * num(cfg.ptsPresence)
    + num(sc.fairPlay) * num(cfg.ptsFairPlay) + num(sc.punctual) * num(cfg.ptsPunctual)
    - num(sc.farrapou) * num(cfg.ptsFarrapou) - num(sc.atrasado) * num(cfg.ptsAtrasado)
    + num(sc.desarmes) * num(cfg.ptsDesarme) + num(sc.cards) * num(cfg.ptsCard)
    + num(sc.defesas) * num(cfg.ptsDefesas) + num(sc.paredoes) * num(cfg.ptsParedoes)
    + num(sc.golsSofridos) * num(cfg.ptsGolsSofridos);
}
function scorePoints(sc) { return scorePointsWith(sc, settings()); }

/* Ranking do mês: maiores pontuadores primeiro. */
function rankScores(list, cfg) {
  return list.slice().sort((a, b) =>
    scorePointsWith(b, cfg) - scorePointsWith(a, cfg)
    || num(b.goals) - num(a.goals)
    || String(a.playerId || '').localeCompare(String(b.playerId || ''))
  ).map((sc, i) => ({ ...sc, points: scorePointsWith(sc, cfg), pos: i + 1 }));
}
function topWinners(m, y = year()) {
  return rankScores((state.scores || []).filter(sc => num(sc.year) === y && num(sc.month) === m), settings()).slice(0, 3);
}

function awardPlaces(a) {
  const old = Array.isArray(a?.places) ? a.places : [];
  return AWARD_PLACES.map((meta, i) => {
    const p = old[i] || {};
    return {
      place: meta.place, playerId: String(p.playerId || ''), points: num(p.points),
      gift: String(p.gift || ''), cost: num(p.cost), delivered: !!p.delivered
    };
  });
}
function awardTotal(a) { return sum(awardPlaces(a), p => p.cost); }
function awardDelivered(a) { const ps = awardPlaces(a); return ps.filter(p => p.delivered).length; }

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
  const photo = safeImageUrl(p?.photo);
  const cls = 'avatar' + (small ? ' sm' : '') + (photo ? ' photo' : '');
  return photo
    ? `<span class="${cls}" style="background-image:url('${esc(photo)}')"></span>`
    : `<span class="${cls}">${esc(initials(p?.name))}</span>`;
};
const playerCell = (p, sub) => p
  ? `<div class="player-cell">${avatarHTML(p, true)}<span><strong>${esc(p.name)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</span></div>`
  : '<span class="muted">—</span>';

function empty(title, text, action = '') {
  return `<div class="empty"><div class="emoji">⚽</div><h3>${esc(title)}</h3><p class="small">${esc(text)}</p>${action ? `<div class="mt">${action}</div>` : ''}</div>`;
}
function section(title, sub = '', right = '') {
  return `<div class="card-head"><div><h2>${esc(title)}</h2>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>${right ? `<div class="right">${right}</div>` : ''}</div>`;
}
function selectMonths(id, value, all = false) {
  const opts = all ? `<option value="all" ${value === 'all' ? 'selected' : ''}>Ano todo</option>` : '';
  const label = id === 'score-month' ? 'Mês da pontuação' : id === 'award-month' ? 'Mês das premiações' : id === 'pay-month' ? 'Mês das mensalidades' : 'Mês';
  return `<select id="${id}" aria-label="${label}">${opts}${MONTHS.map((m, i) => `<option value="${i + 1}" ${num(value) === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select>`;
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
/* Atalho da Visão geral: criar ou enviar o link do grupo sem precisar abrir
   Configurações. Os botões usam as mesmas ações já testadas da tela de config. */
function dashboardGroupLinkCard() {
  const reason = viewBlockReason();
  const nota = reason || 'O link abre na aba 👥 Jogadores. Envie somente ao grupo — ele é secreto. A mensagem pode ser editada em Configurações.';
  return `
    <div class="card" style="margin-bottom:16px">
      ${section('Link do grupo', 'Check-in e pagamento sem senha', `<button class="btn btn-sm btn-ghost" data-act="nav" data-page="settings">Configurações</button>`)}
      <div class="card-body stack" style="gap:10px">
        ${viewToken ? `
          <div class="row">
            <button class="btn btn-primary" type="button" data-act="share-whatsapp" data-kind="view">📤 Enviar ao grupo</button>
            <button class="btn btn-ghost" type="button" data-act="copy-whatsapp" data-kind="view">📋 Copiar p/ grupo</button>
          </div>
        ` : `
          <div class="row">
            <button class="btn btn-primary" type="button" data-act="create-view-link">🔗 Gerar Acesso</button>
          </div>
        `}
        <p class="tiny ${reason ? '' : 'muted'}" ${reason ? 'style="color:var(--amber)"' : ''}>${esc(nota)}</p>
      </div>
    </div>`;
}

function pageDashboard() {
  const rows = cashRows(), m = currentMonth(), r = rows[m - 1], mm = meta();
  const membersPaid = state.payments.filter(p => p.year === year() && p.month === m && p.paid !== false).length;
  const membersTotal = activePlayers().filter(isMonthlyPlayer).length;
  const progress = Math.min(100, Math.max(0, r.rev.total / mm.withGifts * 100));
  const reservePct = mm.bbqAnnual ? Math.min(100, Math.max(0, r.reservePaid / mm.bbqAnnual * 100)) : 0;

  const hoje = todayISO();
  const nextGames = state.games.filter(g => g.year === year() && !g.canceled && String(g.date || '') >= hoje).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const pending = activePlayers().filter(p => isMonthlyPlayer(p) && !state.payments.some(x => x.playerId === p.id && x.month === m && x.year === year() && x.paid !== false)).slice(0, 5);

  const activities = [];
  const ay = year();
  const sameYear = (x) => (num(x.year) || ay) === ay;
  state.expenses.filter(sameYear).forEach(e => activities.push({ date: e.date, text: `${e.description} · ${money(e.amount)}`, kind: 'Despesa', ico: '🧾' }));
  state.payments.filter(p => p.paid !== false && sameYear(p)).forEach(p => activities.push({ date: p.date || `${num(p.year) || ay}-${String(p.month).padStart(2, '0')}-01`, text: `Mensalidade de ${shortMonth(p.month)} · ${playerName(p.playerId)}`, kind: 'Receita', ico: '💳' }));
  state.dayEntries.filter(sameYear).forEach(d => activities.push({ date: d.date, text: `Diária · ${playerName(d.playerId)}`, kind: 'Receita', ico: '🎟️' }));
  activities.sort((a, b) => b.date.localeCompare(a.date));

  return `
    ${hasDemo() ? `<div class="banner">🎯 <span>Você está vendo <strong>dados de demonstração</strong>. Apague-os quando quiser começar de verdade.</span><button class="btn btn-sm" data-act="clear-demo">Limpar demonstração</button></div>` : ''}
    ${dashboardGroupLinkCard()}
    <div class="grid grid-4">
      <div class="card kpi ${r.acc < 0 ? 'red' : ''}"><div class="label">Saldo acumulado</div><div class="value ${r.acc < 0 ? 'negative' : 'positive'} mono">${money(r.acc)}</div><div class="foot">inclui saldo inicial de ${money(settings().initialCash)}</div></div>
      <div class="card kpi blue"><div class="label">Receita · ${shortMonth(m)}</div><div class="value mono">${money(r.rev.total)}</div><div class="foot">${money(r.rev.mens)} mensalidades · ${money(r.rev.dias)} diárias</div></div>
      <div class="card kpi amber"><div class="label">Despesas · ${shortMonth(m)}</div><div class="value mono">${money(r.exp.total)}</div><div class="foot">meta mensal ${money(mm.withGifts)}</div></div>
      <div class="card kpi"><div class="label">Mensalistas pagantes</div><div class="value mono">${membersPaid}<span class="muted" style="font-size:15px">/${membersTotal}</span></div><div class="foot">meta de jogadores: ${settings().plannedMembers}</div></div>
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
            ${mm.bbqAnnual ? `
            <hr style="border:0;border-top:1px solid var(--border-soft);margin:18px 0">
            <div class="spread small"><span>Reserva do churrasco</span><strong class="mono">${money(r.reservePaid)} / ${money(mm.bbqAnnual)}</strong></div>
            <div class="progress mt"><span style="width:${reservePct}%"></span></div>
            <p class="tiny muted mt">Provisão mensal de ${money(mm.bbqMonthly)} · ${r.reservePaid > mm.bbqAnnual ? `<span class="warn">${money(r.reservePaid - mm.bbqAnnual)} acima da reserva anual</span>` : r.reserveDiff >= 0 ? '<span class="positive">reserva em dia</span>' : `<span class="warn">faltam ${money(-r.reserveDiff)}</span>`}</p>` : ''}
          </div>
        </div>
        <div class="card">
          ${section('Próximos jogos', 'Agenda do racha', `<button class="btn btn-sm btn-ghost" data-act="nav" data-page="games">Ver agenda</button>`)}
          <div class="card-body stack" style="gap:9px">
            ${nextGames.length ? nextGames.map(g => `
              <div class="spread" style="padding:9px 11px;background:var(--panel-2);border-radius:10px">
                <div><strong class="small">${fmtDate(g.date)}</strong><div class="tiny muted">${state.dayEntries.filter(d => d.gameId === g.id).length} diaristas · ${money(sum(state.dayEntries.filter(d => d.gameId === g.id), d => d.amount))}</div></div>
                <button class="btn btn-sm ${g.done ? 'btn-ghost' : 'btn-primary'}" data-act="checkin" data-id="${esc(g.id)}">${g.done ? 'Editar' : 'Check-in'}</button>
              </div>`).join('') : empty('Sem jogos agendados', 'Crie jogos na aba Jogos & Diárias.')}
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-2 mt">
      <div class="card">
        ${section('Mensalidades pendentes', shortMonth(m) + '/' + year(), `<button class="btn btn-sm btn-ghost" data-act="nav" data-page="payments">Ver todas</button>`)}
        <div class="table-wrap">${pending.length ? `<table><thead><tr><th>Jogador</th><th>Contato</th><th class="right">Ação</th></tr></thead><tbody>${pending.map(p => `
          <tr><td>${playerCell(p, p.position)}</td><td class="tiny muted">${esc(p.phone || '—')}</td><td class="right"><button class="btn btn-sm ${p.phone ? '' : 'btn-ghost'}" data-act="cobrar" data-id="${esc(p.id)}" ${p.phone ? '' : 'disabled title="Sem telefone cadastrado"'}>📲 Cobrar</button></td></tr>`).join('')}</tbody></table>` : empty('Tudo em dia!', 'Nenhuma mensalidade pendente neste mês.')}</div>
      </div>
      <div class="card">
        ${section('Atividade recente', 'Últimos lançamentos')}
        <div class="table-wrap">${activities.length ? `<table><thead><tr><th scope="col">Tipo</th><th scope="col">Atividade</th><th scope="col" class="right">Data</th></tr></thead><tbody>${activities.slice(0, 6).map(a => `<tr><th scope="row" style="width:30px">${a.ico}</th><td><strong class="small">${esc(a.text)}</strong><div class="tiny muted">${esc(a.kind)}</div></td><td class="right tiny muted">${fmtDate(a.date)}</td></tr>`).join('')}</tbody></table>` : empty('Sem atividades', 'Os lançamentos aparecerão aqui.')}</div>
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
          ${BOARD_ROLES.map(r => `<option value="${r.type}" ${ui.playerFilter === r.type ? 'selected' : ''}>${r.plural}</option>`).join('')}
          <option value="Diarista" ${ui.playerFilter === 'Diarista' ? 'selected' : ''}>Diaristas</option>
        </select>
        <button class="btn btn-primary" data-act="open-modal" data-modal="player">＋ Jogador</button>`)}
      <div class="table-wrap" id="players-table">
        ${list.length ? `<table><thead><tr><th>Jogador</th><th>Tipo</th><th>Posição</th><th>Contato</th><th class="right">Pontos</th><th class="right">Ações</th></tr></thead><tbody>
          ${list.map(p => { const r = rankMap.get(p.id); return `<tr>
            <td>${playerCell(p, p.note || p.type)}</td>
            <td>${badge(p.type, !isMonthlyPlayer(p) ? 'blue' : roleDef(p.type) ? 'amber' : 'green')}</td>
            <td class="small">${esc(p.position || '—')}</td>
            <td class="tiny muted">${esc(p.phone || '—')}</td>
            <td class="right mono"><strong>${r ? r.points : 0}</strong></td>
            <td class="right">
              <button class="icon-btn" data-act="photo" data-id="${esc(p.id)}" title="Foto">📷</button>
              <button class="icon-btn" data-act="cobranca" data-id="${esc(p.id)}" title="Link de cobrança">🔗</button>
              <button class="icon-btn" data-act="profile" data-id="${esc(p.id)}" title="Perfil">👤</button>
              <button class="icon-btn" data-act="edit-player" data-id="${esc(p.id)}" title="Editar">✏️</button>
              <button class="icon-btn danger" data-act="delete-player" data-id="${esc(p.id)}" title="Excluir">🗑️</button>
            </td></tr>`; }).join('')}
        </tbody></table>` : empty('Nenhum jogador encontrado', 'Cadastre jogadores ou ajuste o filtro.', `<button class="btn btn-primary" data-act="open-modal" data-modal="player">＋ Cadastrar jogador</button>`)}
      </div>
    </div>`;
}

/* ------------------------------------------------------------
   Sorteador de equipes
   ------------------------------------------------------------ */
function playerCategory(p) {
  return p?.type || (isMonthlyPlayer(p) ? 'Mensalista' : 'Diarista');
}

function playerRating(p) {
  if (!p) return 50;
  const s = p.strength == null ? null : num(p.strength);
  const v = p.speed == null ? null : num(p.speed);
  if (s == null && v == null) return 50;
  if (s == null) return v;
  if (v == null) return s;
  return Math.round((s + v) / 2);
}

function meterRow(label, value) {
  const v = value == null ? null : Math.max(0, Math.min(100, num(value)));
  return `<div class="meter"><div class="spread tiny"><span class="muted">${esc(label)}</span><strong>${v == null ? '—' : v + '%'}</strong></div><div class="progress"><span style="width:${v == null ? 0 : v}%"></span></div></div>`;
}

function drawGameOptions() {
  const y = year();
  return state.games.filter(g => g.year === y && !g.canceled).sort((a, b) => b.date.localeCompare(a.date));
}
function defaultDrawGameKey() {
  const y = year();
  const inYear = state.games.filter(g => g.year === y && !g.canceled).sort((a, b) => a.date.localeCompare(b.date));
  const pool = inYear.length ? inYear : state.games.filter(g => !g.canceled).sort((a, b) => a.date.localeCompare(b.date));
  const today = todayISO();
  const next = pool.find(g => g.date >= today);
  if (next) return next.id;
  const last = pool[pool.length - 1];
  return last ? last.id : '__manual__';
}
function drawGameKey() {
  const key = ui.drawGame || defaultDrawGameKey();
  ui.drawGame = key;
  return key;
}
function confirmedIds(gameKey) {
  const list = state.confirmations[gameKey];
  return Array.isArray(list) ? list : [];
}
function gameConfirmedPlayers(g) {
  if (!g) return [];
  const allowed = new Set(eligibleForGame(g).map(p => p.id));
  return sortByArrival(confirmedIds(g.id).map(playerById).filter(Boolean).filter(p => allowed.has(p.id)), g.id);
}
function gameCheckinIds(g) {
  if (!g) return [];
  const list = state.checkins?.[g.id];
  return Array.isArray(list) ? list.filter(Boolean) : [];
}
function gameCheckinPlayers(g) {
  return gameCheckinIds(g).map(playerById).filter(Boolean);
}

/* Regra do painel: mensalista precisa estar em dia e ter respondido “Vou jogar”;
   diarista precisa ter a diária paga. O link público continua mostrando todos. */
function monthlyPaidKeys() {
  const out = new Set();
  (state.payments || []).forEach(p => {
    if (p && p.paid !== false && p.playerId && num(p.month) > 0 && num(p.year) > 0) {
      out.add(String(p.playerId) + '|' + num(p.year) + '-' + String(num(p.month)).padStart(2, '0'));
    }
  });
  const map = dailySummary && dailySummary.monthlyPaid;
  if (map && typeof map === 'object') {
    Object.keys(map).forEach(pid => {
      (Array.isArray(map[pid]) ? map[pid] : []).forEach(k => out.add(String(pid) + '|' + String(k)));
    });
  }
  return out;
}
function monthlyUpToDate(p, month, y) {
  if (!p) return false;
  const paid = monthlyPaidKeys();
  return !(state.payments || []).some(x => x && x.playerId === p.id && num(x.year) === y && num(x.month) <= month &&
    x.paid === false && !paid.has(String(p.id) + '|' + num(x.year) + '-' + String(num(x.month)).padStart(2, '0')));
}
function paidDailyIds(key) {
  const out = new Set();
  const map = dailySummary && dailySummary.paidByGame;
  if (map && typeof map === 'object') {
    (Array.isArray(map[key]) ? map[key] : []).forEach(id => out.add(String(id)));
  }
  (state.dayEntries || []).forEach(d => {
    if (d && d.gameId === key && num(d.amount) > 0 && d.playerId) out.add(String(d.playerId));
  });
  return out;
}
function respondedYes(key, playerId) {
  return (viewData?.responses?.[key] || {})[playerId] === 'yes';
}
function eligibleForGame(g) {
  if (!g) return [];
  const key = String(g.id || '__manual__');
  const month = num(g.month) || currentMonth();
  const y = num(g.year) || year();
  const daily = paidDailyIds(key);
  return activePlayers().filter(p => {
    if (p.active === false) return false;
    if (isMonthlyPlayer(p)) return respondedYes(key, p.id) && monthlyUpToDate(p, month, y);
    return daily.has(p.id);
  });
}
function drawGameLabel(key) {
  if (key === '__manual__') return 'Avulso';
  const g = state.games.find(x => x.id === key);
  return g ? fmtDate(g.date) : 'Avulso';
}

/* Chamada: ordem em que cada jogador chegou, salva por jogo. */
function arrivalList(key) {
  const raw = state.arrivals && state.arrivals[key];
  return Array.isArray(raw) ? raw.filter(x => x && x.id) : [];
}
function setArrivalList(key, list) {
  if (!state.arrivals || typeof state.arrivals !== 'object') state.arrivals = {};
  state.arrivals[key] = list;
}
function sortByArrival(players, key) {
  const order = new Map(arrivalList(key).map((x, i) => [x.id, i]));
  return players.slice().map((p, i) => ({ p, i, at: order.has(p.id) ? order.get(p.id) : Infinity }))
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map(x => x.p);
}

function drawTeamsRandom(players, teamsCount) {
  const shuffled = players.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const teams = Array.from({ length: teamsCount }, () => []);
  shuffled.forEach((p, i) => teams[i % teamsCount].push(p));
  return teams;
}

function drawTeamsBalanced(players, teamsCount) {
  const sorted = players.slice().sort((a, b) => playerRating(b) - playerRating(a) || Math.random() - 0.5);
  const teams = Array.from({ length: teamsCount }, () => []);
  let idx = 0, dir = 1;
  sorted.forEach(pl => {
    teams[idx].push(pl);
    if (dir === 1) { if (idx === teamsCount - 1) dir = -1; else idx++; }
    else { if (idx === 0) dir = 1; else idx--; }
  });
  balanceGoalkeepers(teams);
  return teams;
}

/* Novos modos pedidos pelo grupo:
   - position: goleiro em cada equipe antes de distribuir os demais
   - rating: ordem estrita pela nota (força + velocidade)
   - avoid: prioriza duplas que ainda não jogaram juntas
   - manual: o administrador monta as equipes na tela */
function drawTeamsByPosition(players, teamsCount) {
  const gks = players.filter(p => p.position === 'Goleiro').sort((a, b) => playerRating(b) - playerRating(a));
  const others = players.filter(p => p.position !== 'Goleiro').sort((a, b) => playerRating(b) - playerRating(a));
  const teams = Array.from({ length: teamsCount }, () => []);
  gks.forEach((p, i) => teams[i % teamsCount].push(p));
  let idx = 0, dir = 1;
  others.forEach(p => {
    teams[idx].push(p);
    if (dir === 1) { if (idx === teamsCount - 1) dir = -1; else idx++; }
    else { if (idx === 0) dir = 1; else idx--; }
  });
  return teams;
}

function drawTeamsByRating(players, teamsCount) {
  return drawTeamsBalanced(players, teamsCount);
}

function pairKey(a, b) { return [a, b].sort().join('+'); }

function usedPairSet() {
  const set = new Set();
  state.drawHistory.forEach(h => (h.teams || []).forEach(team => {
    const ids = team.map(id => String(id));
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) set.add(pairKey(ids[i], ids[j]));
  }));
  return set;
}

function drawTeamsAvoid(players, teamsCount) {
  const used = usedPairSet();
  let best = null, bestRepeats = Infinity;
  for (let attempt = 0; attempt < 250; attempt++) {
    const teams = drawTeamsRandom(players, teamsCount);
    let repeats = 0;
    teams.forEach(team => {
      for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) {
        if (used.has(pairKey(team[i].id, team[j].id))) repeats++;
      }
    });
    if (repeats < bestRepeats) { bestRepeats = repeats; best = teams; }
    if (!repeats) break;
  }
  balanceGoalkeepers(best);
  return best;
}

function balanceGoalkeepers(teams) {
  const gkCount = (t) => t.filter(p => p.position === 'Goleiro').length;
  for (let pass = 0; pass < 6; pass++) {
    const over = teams.filter(t => gkCount(t) > 1).sort((a, b) => gkCount(b) - gkCount(a))[0];
    const under = teams.filter(t => gkCount(t) === 0)[0];
    if (!over || !under) break;
    const gk = over.find(p => p.position === 'Goleiro');
    const partner = under.slice().sort((a, b) => Math.abs(playerRating(a) - playerRating(gk)) - Math.abs(playerRating(b) - playerRating(gk)))[0];
    if (!gk || !partner) break;
    over.splice(over.indexOf(gk), 1); under.splice(under.indexOf(partner), 1);
    over.push(partner); under.push(gk);
  }
}

function avgRating(team) {
  return team.length ? Math.round(sum(team, p => playerRating(p)) / team.length) : 0;
}

/* Ordem de chegada + Equilibrado: respeita quem chegou primeiro e, dentro
   disso, coloca cada jogador na equipe mais leve (menos jogadores e menor
   soma de força/velocidade). Quem ainda não chegou fica no fim da fila. */
function drawTeamsArrivalBalanced(players, teamsCount, key) {
  const ordered = sortByArrival(players, key);
  const teams = Array.from({ length: teamsCount }, () => []);
  ordered.forEach(p => {
    const minSize = Math.min(...teams.map(t => t.length));
    const candidates = teams.map((_, i) => i).filter(i => teams[i].length === minSize)
      .sort((a, b) => sum(teams[a], playerRating) - sum(teams[b], playerRating) || a - b);
    teams[candidates[0]].push(p);
  });
  balanceGoalkeepers(teams);
  return teams;
}

function drawTeamsForMode(players, teamsCount, key) {
  switch (ui.drawMode) {
    case 'random': return drawTeamsRandom(players, teamsCount);
    case 'position': return drawTeamsByPosition(players, teamsCount);
    case 'rating': return drawTeamsByRating(players, teamsCount);
    case 'avoid': return drawTeamsAvoid(players, teamsCount);
    case 'arrival': return drawTeamsArrivalBalanced(players, teamsCount, key);
    default: return drawTeamsBalanced(players, teamsCount);
  }
}

function drawModeLabel(mode) {
  return ({ balanced: 'Equilibrado', random: 'Aleatório', position: 'Por posição', rating: 'Por nota', avoid: 'Sem repetir duplas', arrival: 'Ordem de chegada + Equilibrado', manual: 'Manual' })[mode] || 'Equilibrado';
}

function doDraw() {
  const key = drawGameKey();
  const game = state.games.find(x => x.id === key) || { id: '__manual__', month: currentMonth(), year: year() };
  const allowed = new Set(eligibleForGame(game).map(p => p.id));
  const players = confirmedIds(key).map(playerById).filter(Boolean).filter(p => p.active !== false && allowed.has(p.id));
  const size = Math.max(2, Math.min(20, Math.round(num(ui.drawSize) || 6)));
  ui.drawSize = size;
  if (players.length < 4) { toast('Confirme pelo menos 4 jogadores para sortear.', 'err'); return; }
  const teamsCount = Math.max(2, Math.round(players.length / size));

  if (ui.drawMode === 'manual') { toast('Use o formulário “Equipes manuais” abaixo.', 'err'); return; }

  const usedTeamSigs = new Set();
  state.drawHistory.forEach(h => (h.teamSigs || []).forEach(s => usedTeamSigs.add(s)));

  let best = null, bestRepeats = Infinity;
  for (let attempt = 0; attempt < 150; attempt++) {
    const teams = drawTeamsForMode(players, teamsCount, key);
    const teamSigs = teams.map(t => t.map(p => p.id).sort().join('+'));
    const repeats = teamSigs.filter(s => usedTeamSigs.has(s)).length;
    if (repeats < bestRepeats) { bestRepeats = repeats; best = { teams, teamSigs }; }
    if (repeats === 0) break;
  }

  const entry = {
    id: uid(),
    createdAt: new Date().toISOString(),
    gameKey: key,
    gameLabel: drawGameLabel(key),
    mode: ui.drawMode,
    teamSize: size,
    arrivals: arrivalList(key).map(x => x.id),
    teams: best.teams.map(t => t.map(p => p.id)),
    teamSigs: best.teamSigs
  };
  state.drawHistory.unshift(entry);
  if (state.drawHistory.length > 60) state.drawHistory.length = 60;
  save('sortequipou times', `${drawGameLabel(key)} · ${ui.drawMode}`);
  if (bestRepeats > 0) toast('Já não havia combinações inéditas suficientes — algumas equipes se repetem.', 'err');
  else toast('Equipes sorteadas!');
  render();
}

function renderDrawResult(entry) {
  const editing = ui.editingDraw && Array.isArray(ui.draftTeams);
  const teams = (editing ? ui.draftTeams : entry.teams || []).map(t => t.map(playerById).filter(Boolean));
  const acoes = editing
    ? `<button class="btn btn-sm btn-primary" data-act="save-last-draw" type="button">💾 Salvar ajuste</button> <button class="btn btn-sm btn-ghost" data-act="cancel-last-draw" type="button">Cancelar</button>`
    : `<button class="btn btn-sm btn-ghost" data-act="edit-last-draw" type="button">✏️ Ajustar times</button> <button class="btn btn-sm btn-ghost" data-act="share-whatsapp" data-kind="team">📤 WhatsApp</button> <button class="btn btn-sm btn-ghost" data-act="copy-whatsapp" data-kind="team">📋 Copiar p/ WhatsApp</button>`;
  return `<div class="card mt">
    ${section('Equipes · ' + (entry.gameLabel || 'Avulso'), drawModeLabel(entry.mode) + ' · ' + teams.length + ' equipes', `${acoes} <span class="tiny muted">${new Date(entry.createdAt).toLocaleString('pt-BR')}</span>`)}
    <div class="card-body">
      ${editing ? `<p class="tiny muted" style="margin-bottom:12px"><strong>Ajustando as equipes deste sorteio.</strong> Toque em “Mover” para escolher outro time. Salvar altera apenas este resultado — não cria novo sorteio nem mexe em pagamento.</p>` : ''}
      <div class="grid grid-3">
        ${teams.map((t, i) => `
          <div class="card card-pad team-card">
            <div class="spread"><strong>Equipe ${i + 1}</strong><span class="badge ${['green', 'blue', 'amber', 'purple'][i % 4]}">${t.length} jogadores</span></div>
            <div class="tiny muted" style="margin:4px 0 10px">Nota média ${avgRating(t)}</div>
            <ul class="team-list">
              ${t.map(p => `<li>${avatarHTML(p, true)}<span class="team-name">${esc(p.name)}</span><span class="tiny muted">${esc(playerCategory(p))} · ${esc(p.position || '—')} · ${playerRating(p)}</span>${editing ? `<button type="button" class="btn btn-sm btn-ghost" data-act="move-draw-player" data-player="${esc(p.id)}" data-from="${i}" title="Mover para outra equipe" style="margin-left:auto">Mover</button>` : ''}</li>`).join('')}
            </ul>
          </div>`).join('')}
      </div>
      ${entry.mode === 'arrival' && (entry.arrivals || []).length ? `<p class="tiny muted mt">Ordem de chegada: ${entry.arrivals.map((pid, i) => `${i + 1}º ${playerName(pid)}`).join(' · ')}</p>` : ''}
    </div>
  </div>`;
}

function openDrawEditor(entry) {
  ui.draftTeams = (entry.teams || []).map(t => t.slice());
  ui.editingDraw = true;
  render(true);
  toast('Escolha os times e salve o ajuste.');
}

function moveDrawPlayer(playerId, from) {
  if (!ui.editingDraw || !Array.isArray(ui.draftTeams)) return;
  const teams = ui.draftTeams;
  const destinos = teams.map((_, i) => i).filter(i => i !== from);
  if (!destinos.length) { toast('É preciso ter pelo menos 2 equipes.', 'err'); return; }
  openModal('Mover jogador', 'Escolha a equipe de destino', `<div class="stack">
    ${destinos.map(i => `<button class="btn btn-ghost btn-block" type="button" data-act="pick-draw-team" data-to="${i}" data-player="${esc(playerId)}" data-from="${from}">Equipe ${i + 1} →</button>`).join('')}
    <button class="btn btn-ghost btn-block" data-act="close-modal" type="button">Cancelar</button>
  </div>`);
}

function pickDrawTeam(playerId, from, to) {
  if (!ui.editingDraw || !Array.isArray(ui.draftTeams)) return;
  const teams = ui.draftTeams;
  const idx = (teams[from] || []).indexOf(playerId);
  if (idx < 0 || !teams[to] || from === to) return;
  teams[from].splice(idx, 1);
  teams[to].push(playerId);
  closeModal();
  render(true);
  toast(`${playerName(playerId)} movido para a equipe ${to + 1}.`);
}

function saveDrawEditor() {
  const entry = state.drawHistory[0];
  if (!entry || !ui.editingDraw || !Array.isArray(ui.draftTeams)) return;
  const teams = ui.draftTeams.filter(t => t.length).map(t => t.slice());
  if (teams.length < 2 || teams.some(t => !t.length)) { toast('Deixe pelo menos 2 equipes com jogadores.', 'err'); return; }
  const total = teams.reduce((n, t) => n + t.length, 0);
  const original = (entry.teams || []).reduce((n, t) => n + t.length, 0);
  if (total !== original) { toast('Nenhum jogador pode ser perdido no ajuste.', 'err'); return; }
  entry.teams = teams;
  entry.teamSigs = teams.map(t => t.slice().sort().join('+'));
  entry.adjustedAt = new Date().toISOString();
  ui.editingDraw = false;
  ui.draftTeams = null;
  save('ajustou equipes do sorteio', drawGameLabel(entry.gameKey));
  render(true);
  toast('Ajuste salvo no sorteio!');
}

function renderDrawHistory() {
  return `<div class="card mt">
    ${section('Histórico de sorteios', 'O sorteio evita repetir equipes já montadas', `<button class="btn btn-sm btn-danger" data-act="clear-draw-history">Limpar histórico</button>`)}
    <div class="table-wrap"><table><thead><tr><th>Quando</th><th>Jogo</th><th>Modo</th><th>Equipes</th></tr></thead><tbody>
      ${state.drawHistory.slice(0, 15).map(h => `<tr>
        <td class="tiny muted">${new Date(h.createdAt).toLocaleString('pt-BR')}</td>
        <td>${esc(h.gameLabel || 'Avulso')}</td>
        <td>${drawModeLabel(h.mode)}</td>
        <td class="tiny">${(h.teams || []).map((t, i) => `<div><strong>E${i + 1}:</strong> ${t.map(id => esc(playerName(id))).join(', ')}</div>`).join('')}</td>
      </tr>`).join('')}
    </tbody></table></div>
  </div>`;
}

function cancelDrawEditor() {
  ui.editingDraw = false;
  ui.draftTeams = null;
  render(true);
}

function renderGroupResponses(key) {
  if (!viewToken || !viewData) return '';
  const resp = (viewData.responses || {})[key] || {};
  const wait = (viewData.waitlist || {})[key] || [];
  const yes = Object.keys(resp).filter(id => resp[id] === 'yes');
  const no = Object.keys(resp).filter(id => resp[id] === 'no');
  if (!yes.length && !no.length && !wait.length) return '';
  const line = (ico, label, ids, cls) => ids.length ? `<div class="person"><span>${ico}</span><span style="flex:1"><strong>${label}: ${ids.length}</strong><div class="tiny muted">${ids.map(id => esc(playerName(id))).join(', ')}</div></span></div>` : '';
  return `<div class="card mt">
    ${section('Respostas do grupo', 'Enviadas pelo próprio jogador, pelo link individual', `
      <button class="btn btn-sm btn-ghost" data-act="refresh-view-data">🔄 Atualizar</button>
      <button class="btn btn-sm btn-primary" data-act="apply-group-confirmations" data-game="${esc(key)}">✅ Aplicar confirmações</button>`)}
    <div class="card-body stack">
      ${line('🟢', 'Vou jogar', yes)}
      ${line('🔴', 'Não vou', no)}
      ${line('🟡', 'Fila de espera', wait)}
      <p class="tiny muted">“Aplicar” mantém quem você marcou manualmente e remove quem respondeu “Não vou”.</p>
    </div>
  </div>`;
}

function renderManualDrawForm(players, teamsCount) {
  const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return `<div class="card mt">
    ${section('Equipes manuais', 'Escolha em qual equipe cada jogador confirmado vai jogar')}
    <div class="card-body">
      <div class="form-grid">
        ${players.map((p, i) => `<label class="field">${esc(p.name)}<select data-manual-player="${esc(p.id)}">
          ${Array.from({ length: teamsCount }, (_, t) => `<option value="${t}" ${i % teamsCount === t ? 'selected' : ''}>Equipe ${labels[t] || (t + 1)}</option>`).join('')}
        </select></label>`).join('')}
      </div>
      <button class="btn btn-primary mt" type="button" data-act="save-manual-draw">💾 Salvar equipes manuais</button>
    </div>
  </div>`;
}

function renderArrivalOrder(key) {
  const arrived = arrivalList(key).filter(x => playerById(x.id));
  const itens = arrived.map((x, i) => {
    const p = playerById(x.id);
    const time = x.at ? new Date(x.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    return `<span style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;border:1px solid var(--border-soft);border-radius:999px;padding:3px 8px">
      <span class="badge green">${i + 1}º</span><strong>${esc(p.name)}</strong>
      <button type="button" class="btn btn-sm btn-ghost" style="padding:0 4px" data-act="move-arrival" data-id="${esc(p.id)}" data-dir="-1" title="Mover para trás" ${i === 0 ? 'disabled' : ''}>←</button>
      <button type="button" class="btn btn-sm btn-ghost" style="padding:0 4px" data-act="move-arrival" data-id="${esc(p.id)}" data-dir="1" title="Mover para frente" ${i === arrived.length - 1 ? 'disabled' : ''}>→</button>
      <button type="button" class="btn btn-sm btn-ghost" style="padding:0 4px" data-act="remove-arrival" data-id="${esc(p.id)}" title="${esc(time || 'Sem horário')} · tirar da chamada">✕</button>
    </span>`;
  }).join('');
  return `<div style="margin-bottom:12px">
    <div class="spread" style="gap:8px;flex-wrap:wrap;margin-bottom:6px">
      <span class="tiny muted"><strong>Ordem de chegada</strong> ${arrived.length ? '· use ← → para ajustar' : '· toque nos nomes abaixo para registrar'}</span>
      <span class="row" style="gap:6px">
        <button class="btn btn-sm btn-ghost" data-act="undo-arrival" ${arrived.length ? '' : 'disabled'}>↩ Desfazer</button>
        <button class="btn btn-sm btn-ghost" data-act="clear-arrivals" ${arrived.length ? '' : 'disabled'}>🧹 Limpar</button>
      </span>
    </div>
    <div style="display:flex;gap:8px;overflow-x:auto;padding:2px 2px 8px">${itens || '<span class="tiny muted">Ninguém registrado ainda.</span>'}</div>
  </div>`;
}

function pageSorteador() {
  const games = drawGameOptions();
  if (ui.drawGame && ui.drawGame !== '__manual__' && !games.some(g => g.id === ui.drawGame)) ui.drawGame = null;
  const key = drawGameKey();
  const game = state.games.find(x => x.id === key) || { id: '__manual__', month: currentMonth(), year: year() };
  const ids = new Set(confirmedIds(key));
  const players = eligibleForGame(game);
  const confirmed = players.filter(p => ids.has(p.id));
  const last = state.drawHistory[0] || null;

  const gameOptions = [`<option value="__manual__" ${key === '__manual__' ? 'selected' : ''}>Avulso (sem data)</option>`,
    ...games.map(g => `<option value="${g.id}" ${key === g.id ? 'selected' : ''}>${fmtDate(g.date)} · ${g.done ? 'realizado' : 'agendado'}</option>`)].join('');

  const modes = [
    ['balanced', 'Equilibrado (força + velocidade)'], ['random', 'Aleatório'],
    ['position', 'Por posição (goleiro em cada time)'], ['rating', 'Por nota (maior primeiro)'],
    ['avoid', 'Evitar repetir duplas'], ['arrival', 'Ordem de chegada + Equilibrado'], ['manual', 'Manual (eu monto as equipes)']
  ];
  const manual = ui.drawMode === 'manual';
  const drawControls = `
    <div style="border-top:1px solid var(--border-soft);padding-top:12px;margin-bottom:14px">
      <div class="spread" style="gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <strong class="small">🎲 Montagem das equipes</strong>
        <span class="tiny muted">Escolha o formato e sortee antes de ver a lista de nomes.</span>
      </div>
      <div class="row" style="align-items:flex-end;flex-wrap:wrap">
        <label class="field" style="max-width:170px">Jogadores por equipe<input id="draw-size" type="number" min="2" max="20" value="${num(ui.drawSize) || 6}" /></label>
        <label class="field" style="max-width:300px">Modo do sorteio<select id="draw-mode">
          ${modes.map(([k, l]) => `<option value="${k}" ${ui.drawMode === k ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
        ${manual ? '' : `<button class="btn btn-primary" data-act="do-draw" type="button">🎲 ${last ? 'Refazer sorteio' : 'Sortear equipes'}</button>`}
      </div>
      <p class="tiny muted mt">Equilibrado usa força e velocidade; por posição garante um goleiro por time; evitar duplas consulta o histórico; ordem de chegada + equilibrado respeita a fila compacta acima e ainda distribui a força; manual você define na tela. Todo sorteio tenta não repetir equipes anteriores.</p>
    </div>`;

  return `
    <div class="card">
      ${section('Jogadores confirmados', 'Mensalista em dia + “Vou jogar”; diarista pago · toque para confirmar a chegada', `
        <select id="draw-game" style="width:200px">${gameOptions}</select>
        <button class="btn btn-sm btn-ghost" data-act="refresh-view-data">🔄 Atualizar respostas</button>
        <button class="btn btn-sm btn-ghost" data-act="confirm-all">Marcar todos</button>
        <button class="btn btn-sm btn-ghost" data-act="confirm-none">Limpar</button>`)}
      <div class="card-body">
        <p class="tiny muted" style="margin-bottom:12px"><strong>${confirmed.length}</strong> de ${players.length} jogadores elegíveis confirmados. Quem não está em dia, não respondeu “Vou jogar” ou não pagou a diária não aparece aqui. O número no selo é a ordem de chegada; a nota usa força ou velocidade quando informada.</p>
        ${renderArrivalOrder(key)}
        ${drawControls}
        ${players.length ? `<div class="chip-grid">
          ${(() => { const ordem = new Map(arrivalList(key).map((x, i) => [x.id, i + 1])); return players.map(p => {
            const at = ordem.get(p.id);
            return `<button class="chip ${ids.has(p.id) ? 'on' : ''}" data-act="toggle-confirm" data-id="${esc(p.id)}" type="button">
              ${at ? `<span class="badge green">${at}º</span>` : ''}
              ${avatarHTML(p, true)}<span class="chip-name">${esc(p.name)}</span><span class="chip-cat">${esc(playerCategory(p))}</span><span class="chip-rating">${playerRating(p)}</span></button>`;
          }).join(''); })()}
        </div>` : empty('Sem jogadores elegíveis', 'Mensalista precisa estar em dia e ter respondido “Vou jogar”; diarista precisa ter a diária paga.')}
        ${!manual && confirmed.length >= 2 ? `<div class="row mt" style="justify-content:flex-end"><button class="btn btn-primary" data-act="do-draw" type="button">🎲 ${last ? 'Refazer sorteio' : 'Sortear equipes'}</button></div>` : ''}
      </div>
    </div>

    ${manual && confirmed.length >= 4 ? renderManualDrawForm(confirmed, Math.max(2, Math.round(confirmed.length / (num(ui.drawSize) || 6)))) : ''}

    ${renderGroupResponses(key)}

    ${last ? renderDrawResult(last) : `<div class="card mt">${empty('Nenhum sorteio ainda', 'Confirme os jogadores e toque em “Sortear equipes”.')}</div>`}
    ${state.drawHistory.length > 1 ? renderDrawHistory() : ''}`;
}

/* ------------------------------------------------------------
   Cronômetro das partidas (local, sem depender do link do grupo)
   ------------------------------------------------------------ */
function parseDurationMinutes(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (!s) return 90;
  let h = 0, m = 0;
  const colon = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (colon) {
    h = num(colon[1]); m = num(colon[2]);
  } else {
    const hh = s.match(/(\d+(?:[.,]\d+)?)\s*(?:h|hora|horas)/i);
    if (hh) h = num(hh[1].replace(',', '.'));
    const afterH = s.match(/h\s*(?:e\s*)?(\d+(?:[.,]\d+)?)/i);
    if (afterH) m = num(afterH[1].replace(',', '.'));
    const onlyMin = s.match(/(\d+(?:[.,]\d+)?)\s*(?:min|minuto|minutos|m)\b/i);
    if (onlyMin && !afterH) m = num(onlyMin[1].replace(',', '.'));
    if (!hh && !afterH && !onlyMin) {
      const n = Number(s.replace(/[^\d.,]/g, '').replace(',', '.'));
      if (Number.isFinite(n)) m = n;
    }
  }
  const total = Math.round(h * 60 + m);
  return total > 0 ? total : 90;
}
function timerSession() { return sessionById(state.timer?.sessionId || '') || null; }
function timerDurationRaw() { return timerSession()?.duration || String(settings().rachaDuration || '1h30'); }
function timerMinutes() { return Math.max(1, Math.round(num(state.timer?.minutes) || 10)); }
function timerStartTime() {
  const own = String(state.timer?.startTime || '');
  return /^\d{2}:\d{2}$/.test(own) ? own : (timerSession()?.time || String(settings().rachaTime || '') || '19:00');
}
function timerStartISO() {
  const [h, m] = timerStartTime().split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toISOString();
}
function timerPlanned(no) {
  const min = timerMinutes(), start = Date.parse(timerStartISO()) + (Math.max(1, num(no)) - 1) * min * 60000;
  return { start: new Date(start).toISOString(), end: new Date(start + min * 60000).toISOString() };
}
function pruneTimerHistory() {
  if (!state?.timer || !Array.isArray(state.timer.history)) return 0;
  const cut = Date.now() - TIMER_RETENTION_MS;
  const antes = state.timer.history.length;
  state.timer.history = state.timer.history.filter(h => {
    const t = Date.parse(String(h?.endedAt || h?.startedAt || ''));
    return Number.isFinite(t) && t > cut;
  });
  return antes - state.timer.history.length;
}
function fmtClock(ms) {
  const total = Math.max(0, Math.ceil(num(ms) / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const pad = (v) => String(v).padStart(2, '0');
  return h ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
function fmtHour(iso) {
  const d = new Date(String(iso || ''));
  return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function timerRemaining(cur) {
  if (!cur) return 0;
  if (cur.pausedAt) return Math.max(0, num(cur.remainingMs));
  const end = Date.parse(String(cur.plannedEnd || ''));
  return Number.isFinite(end) ? Math.max(0, end - Date.now()) : 0;
}
function timerBeep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    [0, 220, 440].forEach((delay) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay / 1000);
      gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + delay / 1000 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay / 1000 + 0.16);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay / 1000);
      osc.stop(ctx.currentTime + delay / 1000 + 0.18);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch (err) { /* áudio é opcional */ }
}
function timerTeamLines(teams) {
  if (!Array.isArray(teams) || !teams.length) return '<p class="tiny muted">Sem times salvos nesta partida.</p>';
  return teams.map((t, i) => `<div class="tiny"><strong>Time ${i ? 'B' : 'A'}:</strong> ${(t || []).map(id => esc(playerName(id))).join(', ') || '—'}</div>`).join('');
}
function timerGoalLine(goals) {
  if (!Array.isArray(goals) || !goals.length) return '—';
  return goals.map(g => `${esc(g.playerName || playerName(g.playerId) || 'Jogador')} (Time ${esc(g.team || 'A')}${num(g.minute) ? ` · ${num(g.minute)}'` : ''})`).join(' · ');
}
function pageTimer() {
  pruneTimerHistory();
  const t = state.timer, total = parseDurationMinutes(timerDurationRaw()), min = timerMinutes();
  const count = Math.max(1, Math.floor(total / min));
  const used = new Set((t.history || []).map(h => num(h.no)));
  if (t.current) used.add(num(t.current.no));
  const schedule = Array.from({ length: count }, (_, i) => {
    const no = i + 1, p = timerPlanned(no);
    return `<tr><td class="mono">${no}</td><td>${fmtHour(p.start)}</td><td>${fmtHour(p.end)}</td><td>${used.has(no)
      ? '<span class="tiny muted">Já usada</span>'
      : `<button class="btn btn-sm btn-ghost" type="button" data-act="timer-start" data-no="${no}">▶ Iniciar</button>`}</td></tr>`;
  }).join('');
  const cur = t.current;
  const status = !cur ? 'Nenhuma partida em andamento.' : (cur.pausedAt ? '⏸ Pausada' : (cur.alarmFired ? '⏰ Tempo esgotado — encerre e salve' : '🔴 Em andamento'));
  const history = (t.history || []).slice().sort((a, b) => String(b.endedAt || '').localeCompare(String(a.endedAt || ''))).map(h => `
    <div class="card mt">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap">
        <strong>Partida ${num(h.no)} · ${num(h.scoreA)} × ${num(h.scoreB)}</strong>
        <button class="btn btn-sm btn-ghost" type="button" data-act="timer-delete" data-id="${esc(h.id)}">🗑️ Excluir</button>
      </div>
      <p class="tiny muted">Início real: ${fmtDateTime(h.startedAt)} · Fim real: ${fmtDateTime(h.endedAt)} · Previsto: ${fmtHour(h.plannedStart)} → ${fmtHour(h.plannedEnd)} · Pausa: ${fmtClock(h.pausedMs)} · ${num(h.minutes)} min/partida</p>
      <div class="grid grid-2">${Array.isArray(h.teamNames) && h.teamNames.some(n => String(n || '').trim())
        ? h.teamNames.map((n, i) => `<div class="tiny"><strong>Time ${i ? 'B' : 'A'}:</strong> ${esc(n || '—')}</div>`).join('')
        : timerTeamLines(h.teams)}</div>
      <p class="tiny">⚽ Gols: ${timerGoalLine(h.goals)}</p>
    </div>`).join('');
  return `
    <div class="grid grid-2">
      <div class="card">
        ${section('Tempo das partidas', 'Sugestão a partir da duração cadastrada em Configurações')}
        <div class="card-body stack">
          <p class="small">${timerSession() ? `Racha: <strong>${esc(timerSession().name)}</strong>${timerSession().notes ? ` · ${esc(timerSession().notes)}` : ''}<br>` : ''}Duração: <strong>${esc(timerDurationRaw() || '—')}</strong> (${total} min). Com <strong>${min} min</strong> por partida, cabem <strong>${count}</strong> partidas.</p>
          <form data-form="timer-config" class="form-grid one">
            <label class="field">Racha da semana<select name="sessionId"><option value="">— usar perfil de Configurações —</option>${activeSessions().map(s => `<option value="${esc(s.id)}" ${state.timer.sessionId === s.id ? 'selected' : ''}>${esc(s.name)} · ${esc(WEEKDAYS[num(s.day)] || '')} ${esc(s.time)}</option>`).join('')}</select></label>
            <label class="field">Minutos por partida<input name="minutes" type="number" min="1" max="240" step="1" value="${min}" required /></label>
            <label class="field">Início previsto<input name="startTime" type="time" value="${esc(timerStartTime())}" required /></label>
            <div class="form-actions"><button class="btn btn-primary" type="submit">💾 Salvar tempo</button></div>
          </form>
          <p class="tiny muted">Troque os minutos se quiser partidas mais curtas ou mais longas. O horário inicial também pode ser alterado aqui, sem mexer em Configurações.</p>
        </div>
      </div>
      <div class="card">
        ${section('Controle', 'Inicie, pause, retome e encerre', cur ? `<span class="tiny muted">Partida ${num(cur.no)}</span>` : '')}
        <div class="card-body center">
          <div class="timer-display mono" id="timer-display">${cur ? fmtClock(timerRemaining(cur)) : '--:--'}</div>
          <p class="small" id="timer-status">${status}</p>
          ${cur ? `
            <p class="tiny muted">Início real: ${fmtDateTime(cur.startedAt)} · Previsto: ${fmtHour(cur.plannedStart)} → ${fmtHour(cur.plannedEnd)} · Pausa acumulada: ${fmtClock(cur.pausedMs)}</p>
            <div class="timer-teams">${timerTeamLines(cur.teams)}</div>
            <div class="row mt" style="justify-content:center;flex-wrap:wrap">
              <button class="btn btn-primary" type="button" data-act="timer-${cur.pausedAt ? 'resume' : 'pause'}">${cur.pausedAt ? '▶ Retomar' : '⏸ Pausar'}</button>
              <button class="btn btn-ghost" type="button" data-act="timer-finish">⏹ Encerrar e salvar</button>
            </div>`
            : '<p class="small muted">Escolha uma partida prevista ao lado e toque em “Iniciar”.</p>'}
        </div>
      </div>
    </div>
    <div class="card mt">
      ${section('Partidas previstas', `${count} partidas de ${min} min a partir de ${timerStartTime()}`)}
      <div class="table-wrap"><table><thead><tr><th>Nº</th><th>Início previsto</th><th>Término previsto</th><th></th></tr></thead><tbody>${schedule}</tbody></table></div>
    </div>
    <div class="card mt">
      ${section('Histórico das partidas', `Registros salvos por 24h · ${(t.history || []).length} partida(s)`, `<button class="btn btn-sm btn-ghost" type="button" data-act="timer-clear-history" ${(t.history || []).length ? '' : 'disabled'}>🧹 Limpar histórico</button>`)}
      ${history || '<p class="small muted center">Nenhuma partida encerrada nas últimas 24 horas.</p>'}
    </div>`;
}

function startTimerMatch(no) {
  if (state.timer.current) { toast('Já há uma partida em andamento.', 'err'); return; }
  const n = Math.max(1, Math.round(num(no) || 1));
  const used = new Set((state.timer.history || []).map(h => num(h.no)));
  if (used.has(n)) { toast(`A partida ${n} já foi encerrada hoje.`, 'err'); return; }
  const now = new Date(), p = timerPlanned(n), last = state.drawHistory[0];
  state.timer.current = {
    id: uid(), no: n, startedAt: now.toISOString(), plannedStart: p.start, plannedEnd: p.end,
    pausedAt: '', pausedMs: 0, remainingMs: 0, alarmFired: false,
    minutes: timerMinutes(), teams: (last?.teams || []).map(t => Array.isArray(t) ? t.slice() : [])
  };
  save('iniciou partida no cronômetro', `Partida ${n}`);
  render(); toast(`Partida ${n} iniciada. Bom jogo!`);
}
function pauseTimerMatch() {
  const cur = state.timer.current;
  if (!cur || cur.pausedAt) return;
  cur.remainingMs = timerRemaining(cur);
  cur.pausedAt = new Date().toISOString();
  save('pausou o cronômetro', `Partida ${cur.no}`);
  render(); toast('Cronômetro pausado.');
}
function resumeTimerMatch() {
  const cur = state.timer.current;
  if (!cur || !cur.pausedAt) return;
  const pausedAt = Date.parse(String(cur.pausedAt));
  if (Number.isFinite(pausedAt)) cur.pausedMs = num(cur.pausedMs) + Math.max(0, Date.now() - pausedAt);
  const restante = num(cur.remainingMs);
  cur.plannedEnd = new Date(Date.now() + restante).toISOString();
  cur.pausedAt = ''; cur.remainingMs = 0;
  if (restante > 0) cur.alarmFired = false;
  save('retomou o cronômetro', `Partida ${cur.no}`);
  render(); toast('Cronômetro retomado.');
}
function tickTimer() {
  if (pruneTimerHistory() && ui.page === 'timer') render(true);
  const cur = state.timer?.current;
  if (!cur || cur.pausedAt) return;
  const rest = timerRemaining(cur);
  const display = $('#timer-display');
  if (display) display.textContent = fmtClock(rest);
  const status = $('#timer-status');
  if (status) status.textContent = rest <= 0 ? '⏰ Tempo esgotado — encerre e salve' : '🔴 Em andamento';
  if (rest <= 0 && !cur.alarmFired) {
    cur.alarmFired = true;
    save('tempo da partida esgotou', `Partida ${cur.no}`);
    timerBeep(); toast(`⏰ Fim do tempo da partida ${cur.no}!`);
  }
}
function modalFinishMatch() {
  const cur = state.timer?.current;
  if (!cur) return;
  const opcoes = activePlayers().map(p => `<option value="${esc(p.id)}" data-name="${esc(p.name)}">${esc(p.name)}</option>`).join('');
  const linhaGol = () => `<div class="row goal-row" style="flex-wrap:wrap">
    <label class="field" style="flex:2;min-width:150px">Jogador<select name="goalPlayer">${opcoes}</select></label>
    <label class="field" style="flex:1;min-width:90px">Time<select name="goalTeam"><option value="A">A</option><option value="B">B</option></select></label>
    <label class="field" style="flex:1;min-width:80px">Minuto<input name="goalMinute" type="number" min="1" max="120" placeholder="Ex.: 12" /></label>
    <button class="btn btn-sm btn-ghost" type="button" data-act="timer-remove-goal" title="Remover gol">✕</button>
  </div>`;
  openModal('Encerrar partida', `Partida ${num(cur.no)} · informe placar e gols`, `
    <form data-form="timer-finish" class="form-grid one">
      <div class="row" style="flex-wrap:wrap">
        <label class="field" style="flex:1">Gols Time A<input name="scoreA" type="number" min="0" step="1" value="0" required /></label>
        <label class="field" style="flex:1">Gols Time B<input name="scoreB" type="number" min="0" step="1" value="0" required /></label>
      </div>
      <div class="row" style="flex-wrap:wrap">
        <label class="field" style="flex:1">Time A<input name="teamA" value="${esc((cur.teams?.[0] || []).map(id => playerName(id)).join(', '))}" placeholder="Jogadores separados por vírgula" /></label>
        <label class="field" style="flex:1">Time B<input name="teamB" value="${esc((cur.teams?.[1] || []).map(id => playerName(id)).join(', '))}" placeholder="Jogadores separados por vírgula" /></label>
      </div>
      <div class="mt"><strong class="small">Quem marcou os gols</strong><div id="timer-goals">${linhaGol()}</div></div>
      <div class="row"><button class="btn btn-sm btn-ghost" type="button" data-act="timer-add-goal">＋ Adicionar gol</button></div>
      <label class="field">Duração desta partida<input name="duration" type="number" min="1" max="240" step="1" value="${num(cur.minutes) || timerMinutes()}" /></label>
      <p class="tiny muted">Início real ${fmtDateTime(cur.startedAt)} · término previsto ${fmtHour(cur.plannedEnd)} · pausa ${fmtClock(cur.pausedMs)}. Se mudar a duração aqui, o horário previsto e o relógio são ajustados antes de salvar.</p>
      <div class="form-actions"><button class="btn btn-ghost" type="button" data-act="close-modal">Cancelar</button><button class="btn btn-primary" type="submit">💾 Salvar partida</button></div>
    </form>`, true);
}

function pageLive() {
  const reason = viewBlockReason();
  if (reason) return `<div class="card">${empty('Placar ao vivo indisponível', reason)}</div>`;
  if (!viewToken) return `<div class="card">${empty('Crie o link do grupo primeiro', 'Vá em Configurações → Link para o grupo e depois volte aqui.')}</div>`;

  const snap = viewData?.snapshot || {};
  const games = (snap.games || []).filter(g => !g.done && !g.canceled).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 8);
  const players = (snap.players || []).filter(p => p.active !== false);
  const live = liveState;
  const events = (live?.events || []).slice(-12).reverse();
  const ico = { goal: '⚽', assist: '🅰️', card: '🟨' };
  const lastDraw = (snap.drawHistory || [])[0];
  const teamCount = Math.min(TEAM_KEYS.length, Math.max(2, (lastDraw?.teams || []).length || 2));
  const teamKeys = TEAM_KEYS.slice(0, teamCount);
  const score = Object.assign({ A: 0, B: 0 }, live?.score || {});
  const selectedTeam = TEAM_KEYS.includes(ui.liveTeam) && teamKeys.includes(ui.liveTeam) ? ui.liveTeam : 'A';

  const board = live ? `
    <div class="live-board">
      ${teamKeys.map((k, i) => `<div class="live-side"><span class="tiny muted">Equipe ${k}</span><strong>${num(score[k])}</strong></div>${i < teamKeys.length - 1 ? '<span class="live-x">×</span>' : ''}`).join('')}
    </div>
    <p class="tiny muted center">Iniciado em ${live.startedAt ? new Date(live.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}${live.endedAt ? ' · encerrado' : ''}</p>
    ${events.length ? `<div class="mt">${events.map(ev => {
      const p = players.find(x => x.id === ev.playerId);
      return `<div class="person"><span>${ico[ev.type] || '•'}</span><span style="flex:1"><strong>${esc(p?.name || 'Jogador')}</strong> <span class="tiny muted">· equipe ${esc(ev.team || 'A')}${ev.minute ? ' · ' + esc(ev.minute) + "'" : ''}</span></span><span class="tiny muted">${ev.at ? new Date(ev.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</span></div>`;
    }).join('')}</div>` : '<p class="tiny muted center">Nenhum lance registrado ainda.</p>'}` : `
    <p class="small muted center">A partida ainda não começou. Escolha o jogo e toque em “Iniciar placar”.</p>`;

  return `
    <div class="card">
      ${section('Comandos do placar', 'Cada lance é publicado para o grupo; a página atualiza a cada 15 s com a aba aberta', `
        <button class="btn btn-sm btn-ghost" data-act="open-live-link">🔗 Abrir no grupo</button>`)}
      <div class="card-body">
        <div class="row" style="flex-wrap:wrap">
          <label class="field" style="min-width:190px">Jogo<select id="live-game">
            <option value="">Avulso / sem data</option>
            ${games.map(g => `<option value="${esc(g.id)}" ${live?.gameId === g.id ? 'selected' : ''}>${fmtDate(g.date)}</option>`).join('')}
          </select></label>
          <label class="field" style="min-width:190px">Jogador<select id="live-player">
            <option value="">— escolha —</option>
            ${players.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
          </select></label>
          <label class="field" style="max-width:120px">Equipe<select id="live-team">${teamKeys.map(k => `<option value="${k}" ${k === selectedTeam ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        </div>
        <div class="row mt">
          <button class="btn btn-primary" data-act="live-start" type="button">▶ Iniciar</button>
          <button class="btn btn-primary" data-act="live-goal" type="button">⚽ Gol</button>
          <button class="btn btn-ghost" data-act="live-assist" type="button">🅰️ Assistência</button>
          <button class="btn btn-ghost" data-act="live-card" type="button">🟨 Cartão</button>
          <button class="btn btn-ghost" data-act="live-undo" type="button">↩ Desfazer</button>
          <button class="btn btn-danger" data-act="live-stop" type="button">⏹ Encerrar</button>
        </div>
        ${lastDraw ? `<p class="tiny muted mt">Times do último sorteio: ${(lastDraw.teams || []).map((t, i) => `<strong>${TEAM_KEYS[i] || i + 1}:</strong> ${t.map(id => esc(playerName(id))).slice(0, 5).join(', ')}`).join(' · ')}</p>` : ''}
      </div>
    </div>
    <div class="card mt">${section('Placar', 'Somente leitura para o grupo', `<button class="btn btn-sm btn-ghost" data-act="refresh-view-data">🔄 Atualizar</button>`)}
      <div class="card-body">${board}</div>
    </div>`;
}

function pagePayments() {
  const m = currentMonth(), players = activePlayers().filter(isMonthlyPlayer);
  const y = year(), base = num(settings().monthlyFee);
  const totals = MONTHS.map((_, i) => {
    const list = state.payments.filter(p => p.year === y && p.month === i + 1 && p.paid !== false);
    return { received: sum(list, p => p.amount), count: list.length };
  });
  const expected = sum(players, p => playerFee(p));
  const cargos = BOARD_ROLES.map(r => `${r.type} ${money(playerFee({ type: r.type }))}`).join(' · ');
  return `
    <div class="card">
      ${section('Mensalidades ' + y, `${players.length} pagantes · base ${money(base)}${cargos ? ' · ' + cargos : ''}`, `
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
              return `<td><button class="pay-cell ${rec ? 'paid' : ''}" data-act="edit-payment" data-player="${esc(p.id)}" data-month="${i + 1}" title="${rec ? 'Pago: ' + money(rec.amount) + ' (clique para editar)' : 'Marcar como pago'}">${rec ? '✓' : '—'}</button></td>`;
            }).join('');
            return `<tr><td>${playerCell(p, roleDef(p.type) && num(playerFee(p)) !== base ? `${p.type} · ${money(playerFee(p))}/mês` : '')}</td>${cells}<td class="num"><strong>${money(total)}</strong></td></tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="total-row"><td>Recebido</td>${totals.map(t => `<td class="num">${compactMoney(t.received)}</td>`).join('')}<td class="num">${money(totals.reduce((a, t) => a + t.received, 0))}</td></tr>
          <tr><td>Pagantes</td>${totals.map(t => `<td class="num">${t.count}</td>`).join('')}<td></td></tr>
          <tr><td>Previsto</td>${MONTHS.map(() => `<td class="num">${compactMoney(expected)}</td>`).join('')}<td class="num">${money(expected * 12)}</td></tr>
          <tr><td>Em aberto</td>${totals.map(t => `<td class="num warn">${compactMoney(Math.max(0, expected - t.received))}</td>`).join('')}<td></td></tr>
        </tfoot>
      </table></div>
    </div>
    <div class="card mt">
      ${section('Datas de ' + monthName(num(ui.payMonth) || m) + '/' + y, 'Vencimento e data da baixa · clique no nome para editar')}
      <div class="card-body stack">
        ${players.map(p => {
          const rec = state.payments.find(x => x.playerId === p.id && x.month === (num(ui.payMonth) || m) && x.year === y);
          const venc = /^\d{4}-\d{2}-\d{2}$/.test(String(rec?.dueDate || '')) ? fmtDate(rec.dueDate) : '—';
          const pago = rec?.paidAt ? fmtDateTime(rec.paidAt) : '—';
          return `<div class="person"><span>${rec && rec.paid !== false ? '✅' : '◻️'}</span><button class="btn btn-sm btn-ghost" data-act="edit-payment" data-player="${esc(p.id)}" data-month="${num(ui.payMonth) || m}" style="flex:1;text-align:left;justify-content:flex-start"><strong>${esc(p.name)}</strong><div class="tiny muted">Vencimento ${esc(venc)} · pago em ${esc(pago)}</div></button></div>`;
        }).join('') || '<p class="small muted">Nenhum mensalista ativo.</p>'}
      </div>
    </div>`;
}

function generateSessionGames(months) {
  const y = year();
  let created = 0;
  months.forEach(m => {
    const lastDay = new Date(y, m, 0).getDate();
    activeSessions().forEach(s => {
      let d = 1 + ((num(s.day) - new Date(y, m - 1, 1).getDay() + 7) % 7);
      while (d <= lastDay) {
        const date = isoDate(y, m, d);
        if (!state.games.some(g => g.date === date && g.year === y && g.sessionId === s.id)) {
          state.games.push({ id: uid(), date, month: m, year: y, done: false, sessionId: s.id, sessionName: s.name, name: s.name, time: s.time, location: s.location || '', notes: s.notes || '' });
          created++;
        }
        d += 7;
      }
    });
  });
  return created;
}

function toggleGameCancel(gameId) {
  const g = state.games.find(x => x.id === gameId);
  if (!g) return;
  if (g.canceled) {
    g.canceled = false;
    save('reativou jogo', fmtDate(g.date)); render(); toast('Jogo reativado.');
    return;
  }
  confirmAction(`Cancelar o jogo de ${fmtDate(g.date)}? Ele continuará na agenda com status Cancelado.`, () => {
    g.canceled = true;
    save('cancelou jogo', fmtDate(g.date)); render(); toast('Jogo cancelado.');
  });
}

function pageGames() {
  const y = year();
  const gamesYear = state.games.filter(g => g.year === y).sort((a, b) => a.date.localeCompare(b.date));
  const games = ui.gameMonth ? gamesYear.filter(g => num(g.month) === ui.gameMonth) : gamesYear;
  const tabs = `<div class="row" style="margin-bottom:16px">
      <button class="btn ${ui.gameTab === 'games' ? 'btn-primary' : 'btn-ghost'}" data-act="game-tab" data-tab="games">📅 Jogos (${gamesYear.length})</button>
      <button class="btn ${ui.gameTab === 'days' ? 'btn-primary' : 'btn-ghost'}" data-act="game-tab" data-tab="days">🎟️ Diárias (${state.dayEntries.filter(d => d.year === y).length})</button>
    </div>`;
  if (ui.gameTab === 'games') {
    return tabs + `<div class="card">
      ${section('Agenda de jogos', `${gamesYear.length} jogo(s) em ${y} · rachas cadastrados em Configurações`, `
        <label class="field" style="max-width:140px">Ver<select id="game-filter-month"><option value="all" ${ui.gameMonth ? '' : 'selected'}>Ano todo</option>${MONTHS.map((m, i) => `<option value="${i + 1}" ${ui.gameMonth === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        ${selectMonths('gen-month', currentMonth())}
        <button class="btn btn-sm btn-ghost" data-act="generate-sessions">Gerar rachas do mês</button>
        <button class="btn btn-sm btn-ghost" data-act="generate-sessions-year">Gerar ano todo</button>
        <button class="btn btn-sm btn-primary" data-act="open-modal" data-modal="game">＋ Jogo</button>`)}
      <div class="table-wrap">${games.length ? `<table><thead><tr><th>Data</th><th>Mês</th><th>Status</th><th>Presença</th><th class="right">Diaristas</th><th class="right">Receita</th><th class="right">Ações</th></tr></thead><tbody>
        ${games.map(g => { const ds = state.dayEntries.filter(d => d.gameId === g.id); const conf = gameConfirmedPlayers(g); const pres = gameCheckinPlayers(g); return `<tr>
          <td><strong>${fmtDate(g.date)}</strong>${g.time ? `<div class="tiny muted">${esc(g.time)}</div>` : ''}${g.name ? `<div class="tiny muted">${esc(g.name)}</div>` : ''}${g.location ? `<div class="tiny muted">📍 ${esc(g.location)}</div>` : ''}${g.notes ? `<div class="tiny muted">${esc(g.notes)}</div>` : ''}</td><td>${shortMonth(g.month)}</td>
          <td>${g.canceled ? badge('Cancelado', 'red') : g.done ? badge('Realizado', 'green') : badge('Agendado', 'amber')}</td>
          <td><button class="btn btn-sm btn-ghost" type="button" data-act="game-presence" data-id="${esc(g.id)}">👥 ${conf.length} confirm. · ${pres.length} check-in</button>
            ${conf.length ? `<div class="tiny muted">${conf.slice(0, 3).map(p => esc(p.name)).join(', ')}${conf.length > 3 ? '…' : ''}</div>` : ''}</td>
          <td class="right mono">${ds.length}</td><td class="right mono">${money(sum(ds, d => d.amount))}</td>
          <td class="right"><div class="stack" style="gap:6px;align-items:flex-end">
            <button class="btn btn-sm ${g.canceled ? 'btn-ghost' : g.done ? 'btn-ghost' : 'btn-primary'}" data-act="checkin" data-id="${esc(g.id)}" ${g.canceled ? 'disabled title="Reative o jogo para fazer check-in"' : ''}>${g.canceled ? 'Check-in indisponível' : g.done ? 'Editar presença' : 'Fazer check-in'}</button>
            <button class="btn btn-sm btn-ghost" type="button" data-act="game-cancel" data-id="${esc(g.id)}">${g.canceled ? '↩ Reativar' : '🚫 Cancelar'}</button>
            <button class="icon-btn danger" data-act="delete-game" data-id="${esc(g.id)}" title="Excluir jogo">🗑️</button>
          </div></td></tr>`; }).join('')}
      </tbody></table>` : empty('Nenhum jogo neste filtro', 'Gere os rachas do ano ou cadastre um jogo manualmente.')}</div>
    </div>`;
  }
  const days = state.dayEntries.filter(d => d.year === y).sort((a, b) => b.date.localeCompare(a.date));
  return tabs + `<div class="card">
    ${section('Diárias recebidas', 'Uma linha por diarista por jogo', `<button class="btn btn-sm btn-primary" data-act="open-modal" data-modal="day">＋ Diária</button>`)}
    <div class="table-wrap">${days.length ? `<table><thead><tr><th>Data</th><th>Jogador</th><th>Tipo</th><th class="right">Valor</th><th class="right">Ações</th></tr></thead><tbody>
      ${days.slice(0, 300).map(d => `<tr><td>${fmtDate(d.date)}</td><td>${playerCell(playerById(d.playerId))}</td><td>${badge('Diarista', 'blue')}</td><td class="right mono">${money(d.amount)}</td><td class="right"><button class="icon-btn danger" data-act="delete-day" data-id="${esc(d.id)}">🗑️</button></td></tr>`).join('')}
    </tbody></table>` : empty('Sem diárias', 'Faça o check-in de um jogo para lançar as diárias em lote.')}</div>
  </div>`;
}

function pageExpenses() {
  const y = year();
  const all = state.expenses.filter(e => e.year === y).sort((a, b) => b.date.localeCompare(a.date));
  const byCat = {};
  all.forEach(e => { const c = displayExpenseCat(e.category); byCat[c] = (byCat[c] || 0) + num(e.amount); });
  /* Quadra e Goleiros ficam sempre; qualquer outra categoria com lançamento
     ganha seu próprio cartão "total no ano", na mesma ordem do fluxo de caixa. */
  const cardCats = visibleCashRows().filter(c => ['Quadra', 'Goleiros'].includes(c) || num(byCat[c]) > 0);
  return `
    <div class="grid grid-4">
      ${cardCats.map((c, i) => `
        <div class="card kpi ${i % 2 ? 'blue' : ''}"><div class="label">${esc(c)}</div><div class="value mono">${money(byCat[c] || 0)}</div><div class="foot">total no ano</div></div>`).join('')}
    </div>
    <div class="card mt">
      ${section(`${all.length} despesas em ${y}`, `Total: ${money(sum(all, e => e.amount))}`, `
        <button class="btn btn-sm btn-primary" data-act="open-modal" data-modal="expense">＋ Despesa</button>
        <button class="btn btn-sm btn-ghost" data-act="expense-clear-selected" type="button" ${all.length ? '' : 'disabled'}>🧹 Limpar selecionados</button>
        <button class="btn btn-sm btn-danger" data-act="clear-expenses" type="button" ${state.expenses.length ? '' : 'disabled'} title="Apagar todas as despesas de todos os anos">🧹 Limpar todas</button>`)}
      <div class="table-wrap">${all.length ? `<table><thead><tr><th style="width:34px"><input type="checkbox" id="expense-all" data-act="expense-select-all" title="Selecionar todas" style="width:16px" /></th><th>Data</th><th>Categoria</th><th>Descrição</th><th>Mês</th><th class="right">Valor</th><th class="right">Ações</th></tr></thead><tbody>
        ${all.map(e => `<tr><td><input type="checkbox" class="expense-check" value="${esc(e.id)}" style="width:16px" /></td><td>${fmtDate(e.date)}</td><td>${badge(displayExpenseCat(e.category), displayExpenseCat(e.category) === 'Quadra' ? 'green' : displayExpenseCat(e.category) === 'Goleiros' ? 'blue' : 'amber')}</td><td>${esc(e.description || '—')}${e.fixed ? '<span class="tiny muted"> · fixo</span>' : ''}${e.seriesId ? '<span class="tiny muted"> · repetição</span>' : ''}</td><td>${shortMonth(e.month)}</td><td class="right mono">${money(e.amount)}</td><td class="right"><button class="icon-btn danger" data-act="delete-expense" data-id="${esc(e.id)}" title="Excluir este lançamento">🗑️</button>${e.seriesId ? ` <button class="icon-btn danger" data-act="delete-expense-series" data-series="${esc(e.seriesId)}" title="Excluir toda esta repetição">🧹</button>` : ''}</td></tr>`).join('')}
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
        ${list.map(b => `<tr><td>${fmtDate(b.date)}</td><td>${playerCell(playerById(b.playerId))}</td><td class="small">${esc(b.type || '—')}</td><td class="right mono">${money(b.amount)}</td><td>${badge(b.fromCash ? 'Sim' : 'Não', b.fromCash ? 'red' : 'blue')}</td><td>${shortMonth(b.month)}</td><td class="small muted">${esc(b.note || '—')}</td><td class="right"><button class="icon-btn" data-act="edit-benefit" data-id="${esc(b.id)}">✏️</button> <button class="icon-btn danger" data-act="delete-benefit" data-id="${esc(b.id)}">🗑️</button></td></tr>`).join('')}
      </tbody></table>` : empty('Sem benefícios', 'Lance incentivos e descontos concedidos aos mensalistas.')}</div>
    </div>`;
}

function pageCash() {
  const rows = cashRows(), m = meta();
  const cashCats = visibleCashRows().filter(c => ['Quadra', 'Goleiros'].includes(c) || rows.some(r => num(r.exp.byCat[c]) > 0));
  const total = rows[11];
  const annualRevenue = rows.reduce((a, r) => a + r.rev.total, 0);
  const annualExpenses = rows.reduce((a, r) => a + r.exp.total, 0);
  const annualTarget = rows.reduce((a, r) => a + r.metaTarget, 0);
  return `
    <div class="grid grid-4">
      <div class="card kpi blue"><div class="label">Receitas do ano</div><div class="value mono">${money(annualRevenue)}</div><div class="foot">mensalidades + diárias</div></div>
      <div class="card kpi amber"><div class="label">Despesas do ano</div><div class="value mono">${money(annualExpenses)}</div><div class="foot">inclui brindes e benefícios</div></div>
      <div class="card kpi ${total.acc < 0 ? 'red' : ''}"><div class="label">Saldo final previsto</div><div class="value mono ${total.acc < 0 ? 'negative' : 'positive'}">${money(total.acc)}</div><div class="foot">com saldo inicial</div></div>
      <div class="card kpi"><div class="label">Meta anual</div><div class="value mono">${money(annualTarget)}</div><div class="foot">média ${money(annualTarget / 12)} / mês</div></div>
    </div>
    ${annualGoals().length ? `
    <div class="card mt">
      ${section('Metas anuais', 'Acompanhamento separado da meta de receita')}
      <div class="card-body stack">
        ${annualGoals().map(g => `
          <div>
            <div class="row" style="justify-content:space-between;gap:8px">
              <span><strong>${esc(g.name)}</strong> <span class="tiny muted">${esc(g.year || year())}</span></span>
              <span class="mono small">${money(g.progress)} / ${money(g.amount)}</span>
            </div>
            <div class="progress"><span style="width:${goalProgress(g)}%"></span></div>
            <div class="row mt" style="gap:8px;align-items:center">
              <input type="number" min="0" step="0.01" value="${num(g.progress)}" data-goal-progress="${esc(g.id)}" aria-label="Progresso de ${esc(g.name)}" style="width:120px" />
              <span class="tiny muted">atualizar valor arrecadado</span>
            </div>
          </div>`).join('')}
      </div>
    </div>` : ''}
    <div class="card mt">
      ${section('Fluxo de caixa · ' + year(), 'Valores automáticos a partir dos lançamentos; progresso das metas é digitado', `
        <select id="report-month" aria-label="Mês do relatório" style="max-width:120px">
          ${MONTHS.map((n, i) => `<option value="${i + 1}" ${i + 1 === currentMonth() ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
        <button class="btn btn-sm btn-ghost" type="button" data-act="monthly-report">🖨 Relatório PDF</button>
        <button class="btn btn-sm btn-ghost" type="button" data-act="report-month-csv" title="Baixa um CSV com receitas, despesas, mensalidades, pontuação e ranking do mês escolhido">⬇ Relatório do mês (CSV)</button>`)}
      <div class="table-wrap"><table>
        <thead><tr><th>Item</th>${MONTHS.map(x => `<th class="right">${x}</th>`).join('')}<th class="right">Total</th></tr></thead>
        <tbody>
          <tr class="section-row"><td colspan="14">RECEITAS</td></tr>
          <tr><td>Mensalidades</td>${rows.map(r => `<td class="right mono">${money(r.rev.mens)}</td>`).join('')}<td class="right mono">${money(total.rev.mens)}</td></tr>
          <tr><td>Diárias</td>${rows.map(r => `<td class="right mono">${money(r.rev.dias)}</td>`).join('')}<td class="right mono">${money(total.rev.dias)}</td></tr>
          <tr class="total-row"><td>Total de receitas</td>${rows.map(r => `<td class="right mono">${money(r.rev.total)}</td>`).join('')}<td class="right mono">${money(total.rev.total)}</td></tr>
          <tr class="section-row"><td colspan="14">DESPESAS</td></tr>
          ${cashCats.map(c => `<tr><td>${c}</td>${rows.map(r => `<td class="right mono">${money(r.exp.byCat[c])}</td>`).join('')}<td class="right mono">${money(rows.reduce((a, r) => a + r.exp.byCat[c], 0))}</td></tr>`).join('')}
          <tr class="total-row"><td>Total de despesas</td>${rows.map(r => `<td class="right mono">${money(r.exp.total)}</td>`).join('')}<td class="right mono">${money(total.exp.total)}</td></tr>
          <tr class="total-row"><td>SALDO DO MÊS</td>${rows.map(r => `<td class="right mono ${r.balance < 0 ? 'negative' : 'positive'}">${money(r.balance)}</td>`).join('')}<td class="right mono ${total.balance < 0 ? 'negative' : 'positive'}">${money(total.balance)}</td></tr>
          <tr><td>Saldo acumulado</td>${rows.map(r => `<td class="right mono ${r.acc < 0 ? 'negative' : 'positive'}">${money(r.acc)}</td>`).join('')}<td class="right mono">${money(total.acc)}</td></tr>
          ${m.bbqAnnual ? `
          <tr class="section-row"><td colspan="14">RESERVA DO CHURRASCO</td></tr>
          <tr><td>Meta acumulada</td>${rows.map(r => `<td class="right mono">${money(r.reserveTarget)}</td>`).join('')}<td class="right mono">${money(m.bbqAnnual)}</td></tr>
          <tr><td>Já pago</td>${rows.map(r => `<td class="right mono">${money(r.reservePaid)}</td>`).join('')}<td class="right mono">${money(total.reservePaid)}</td></tr>
          <tr><td>Folga / falta</td>${rows.map(r => `<td class="right mono ${r.reserveDiff < 0 ? 'negative' : 'positive'}">${money(r.reserveDiff)}</td>`).join('')}<td class="right mono">${money(total.reserveDiff)}</td></tr>` : ''}
          <tr class="section-row"><td colspan="14">META DE RECEITA</td></tr>
          <tr><td>Meta mensal</td>${rows.map(r => `<td class="right mono">${money(r.metaTarget)}</td>`).join('')}<td class="right mono">${money(rows.reduce((a, r) => a + r.metaTarget, 0))}</td></tr>
          <tr><td>Metas extras</td>${rows.map(r => `<td class="right mono">${money(monthlyGoalFor(r.month))}</td>`).join('')}<td class="right mono">${money(rows.reduce((a, r) => a + monthlyGoalFor(r.month), 0))}</td></tr>
          <tr><td>Acima / abaixo</td>${rows.map(r => `<td class="right mono ${r.metaDiff < 0 ? 'negative' : 'positive'}">${money(r.metaDiff)}</td>`).join('')}<td class="right mono">${money(rows.reduce((a, r) => a + r.metaDiff, 0))}</td></tr>
        </tbody>
      </table></div>
    </div>${donationCardHtml()}`;
}

function developerDonationCardHtml() {
  const d = window.RachaDevDonation || {};
  const code = developerDonationPixCode();
  if (!code) return '';
  return `
    <div class="card mt">
      ${section('💚 Apoie o desenvolvedor', d.text || 'Gostou do app? Faça uma doação voluntária.')}
      <div class="card-body stack">
        <p class="small muted">Esta doação é para quem criou e mantém o aplicativo. Ela é totalmente opcional, funciona no período grátis e depois da assinatura, e não muda sua licença nem seus dados. O valor é escolhido por você no banco.</p>
        <textarea id="dev-donate-code" readonly rows="3" style="width:100%;font-size:11px;resize:vertical">${esc(code)}</textarea>
        <div><button class="btn btn-ghost btn-sm" type="button" data-act="copy-dev-donation">📋 Copiar PIX do desenvolvedor</button></div>
      </div>
    </div>`;
}

function donationCardHtml() {
  const s = settings();
  if (s.donationEnabled === false) return '';
  const code = donationPixCode();
  if (!code) return '';
  return `
    <div class="card mt">
      ${section('💚 PIX de doação', s.donationText || 'Ajude a manter o racha: qualquer quantia é bem-vinda!')}
      <div class="card-body stack">
        <p class="small muted">Use a mesma chave PIX do racha, sem valor fixo. Quem quiser ajudar escolhe o valor no banco. Essa doação não conta como mensalidade nem diária e aparece também no link do grupo. Para esconder, desmarque a opção em Configurações.</p>
        <textarea id="donate-code" readonly rows="3" style="width:100%;font-size:11px;resize:vertical">${esc(code)}</textarea>
        <div><button class="btn btn-ghost btn-sm" type="button" data-act="copy-donation-app">📋 Copiar código PIX</button></div>
      </div>
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
          <p class="tiny muted">Ao aplicar, mensalidade, diária, diaristas por jogo, jogos por mês e meta de jogadores passam a valer nas premissas do app.</p>
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
  const scoreLabels = { goals: 'Gols', assists: 'Assistências', presence: 'Presenças', desarmes: 'Desarmes', defesas: 'Defesas', paredoes: 'Paredões', golsSofridos: 'Gols sofridos', fairPlay: 'Fair play', punctual: 'Pontual', farrapou: 'Farrapou', atrasado: 'Atrasado', cards: 'Cartões' };
  return `
    <div class="card">
      ${section('Pontuação · ' + shortMonth(m) + '/' + y, 'Digite a quantidade de cada item. Farrapou/Faltou tira pontos. Defesas, paredões e gols sofridos valem 0 até você configurar os pontos em Configurações.', selectMonths('score-month', m))}
      <div class="table-wrap"><table><thead><tr><th>Jogador</th><th class="right">Gols</th><th class="right">Assist.</th><th class="right">Presenças</th><th class="right">Desarmes</th><th class="right">Defesas</th><th class="right">Paredões</th><th class="right">Gols sofridos</th><th class="right">Fair play</th><th class="right">Pontual</th><th class="right">Farrapou / Faltou</th><th class="right">Atrasado</th><th class="right">Cartões</th><th class="right">Pontos</th></tr></thead><tbody>
        ${players.map(p => {
          const s = existing.get(p.id) || { goals: 0, assists: 0, presence: 0, desarmes: 0, defesas: 0, paredoes: 0, golsSofridos: 0, fairPlay: 0, punctual: 0, farrapou: 0, atrasado: 0, cards: 0 };
          const pts = scorePoints(s);
          return `<tr data-score-row="${esc(p.id)}">
            <td>${playerCell(p)}</td>
            ${['goals', 'assists', 'presence', 'desarmes', 'defesas', 'paredoes', 'golsSofridos', 'fairPlay', 'punctual', 'farrapou', 'atrasado', 'cards'].map(k => `<td class="right"><input type="number" min="0" value="${num(s[k])}" data-score="${k}" data-player="${esc(p.id)}" aria-label="${esc(playerName(p.id))} — ${scoreLabels[k] || k}" style="width:66px;text-align:right" /></td>`).join('')}
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
  const yearScores = state.scores.filter(s => s.year === year());
  const xerifao = yearScores.slice().sort((a, b) => num(b.cards) - num(a.cards))[0];
  const artilheiro = rankingFor('year')[0] || null;
  const withAvatar = (p, name, foot) => `<div class="value" style="font-size:16px;display:flex;align-items:center;justify-content:center;gap:8px">${avatarHTML(p, true)}${esc(name || '—')}</div><div class="foot">${esc(foot)}</div>`;
  const count = (n, one, many) => `${num(n)} ${num(n) === 1 ? one : many}`;
  const highlights = `
    <div class="card" style="margin-bottom:16px">
      ${section('Destaques do grupo', 'Cartões e gols no ano')}
      <div class="card-body">
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
          <div class="card kpi red"><div class="label">🪓 Xerifão</div>${withAvatar(playerById(xerifao?.playerId), playerName(xerifao?.playerId), count(xerifao?.cards, 'cartão', 'cartões') + ' no ano')}</div>
          <div class="card kpi blue"><div class="label">⚽ Artilheiro</div>${withAvatar(artilheiro?.player, playerName(artilheiro?.playerId), count(artilheiro?.goals, 'gol', 'gols') + ' no ano')}</div>
        </div>
      </div>
    </div>`;
  return `
    ${highlights}
    <div class="card">
      ${section('Ranking ' + label, 'Pontos calculados na aba Pontuação.', 
        filters.map(([k, l]) => `<button class="btn btn-sm ${String(ui.rankFilter) === String(k) ? 'btn-primary' : 'btn-ghost'}" data-act="rank-filter" data-filter="${k}">${l}</button>`).join(''))}
      <div class="card-body">
        ${rank.length ? `<div class="podium">
          ${[1, 0, 2].map(idx => { const r = top3[idx]; return r ? `<div class="podium-item ${idx === 0 ? 'first' : ''}"><div class="medal">${['🥇', '🥈', '🥉'][idx]}</div>${avatarHTML(r.player)}<div class="name">${esc(r.player?.name || '—')}</div><div class="pts">${r.points} pts</div><div class="tiny muted">${r.goals} gols · ${r.assists} assist.</div></div>` : ''; }).join('')}
        </div>` : ''}
        <div class="table-wrap">${rank.length ? `<table><thead><tr><th class="right">#</th><th>Jogador</th><th class="right">Gols</th><th class="right">Assist.</th><th class="right">Presenças</th><th class="right">Meses</th><th class="right">Pontos</th></tr></thead><tbody>
          ${rank.map(r => `<tr><td class="right"><strong>${r.pos}</strong></td><td>${playerCell(r.player, r.player?.position)}</td><td class="right mono">${r.goals}</td><td class="right mono">${r.assists}</td><td class="right mono">${r.presence}</td><td class="right mono">${r.games}</td><td class="right mono"><strong class="positive">${r.points}</strong></td></tr>`).join('')}
        </tbody></table>` : empty('Sem pontuação lançada', 'Vá em Pontuação e registre o mês para montar o ranking.')}</div>
      </div>
    </div>`;
}

function pageAwards() {
  const m = currentMonth(), tops = topWinners(m);
  const aw = state.awards.find(a => num(a.month) === m && num(a.year) === year()) || { month: m, year: year(), places: [] };
  const places = awardPlaces(aw);
  const history = state.awards.filter(a => num(a.year) === year()).sort((a, b) => num(a.month) - num(b.month));
  const winner = (id) => id ? playerName(id) : '—';

  const podium = AWARD_PLACES.map((meta, i) => {
    const t = tops[i];
    return `<div class="card kpi blue"><div class="label">${meta.ico} ${meta.label}</div><div class="value" style="font-size:16px">${esc(winner(t?.playerId))}</div><div class="foot">${t ? num(t.points) + ' pontos' : 'Sem pontuação no mês'}</div></div>`;
  }).join('');

  const placeFields = (i) => {
    const meta = AWARD_PLACES[i], p = places[i], t = tops[i];
    return `<div class="field" style="grid-column:1/-1;border-top:1px solid var(--border-soft);padding-top:10px">
      <div class="row" style="justify-content:space-between;gap:8px"><strong>${meta.ico} ${meta.label}</strong><span class="small muted">${t ? esc(winner(t.playerId)) + ' · ' + num(t.points) + ' pontos' : 'Sem pontuação'}</span></div>
      <div class="grid grid-3 mt">
        <label class="field">Brinde<input name="g${i}" value="${esc(p.gift)}" placeholder="Ex.: camisa, bola..." /></label>
        <label class="field">Custo (R$)<input name="c${i}" type="number" step="0.01" min="0" value="${num(p.cost)}" /></label>
        <label class="field" style="justify-content:flex-end"><span style="display:flex;align-items:center;gap:8px"><input name="d${i}" type="checkbox" ${p.delivered ? 'checked' : ''} style="width:16px" /> Entregue?</span></label>
      </div>
    </div>`;
  };

  return `
    <div class="row" style="margin-bottom:16px">${selectMonths('award-month', m)}</div>
    <div class="grid grid-3">${podium}</div>
    <div class="grid grid-2 mt">
      <div class="card">
        ${section('Premiação de ' + shortMonth(m), 'Somente 1º, 2º e 3º lugares · vencedores automáticos pela pontuação do mês')}
        <div class="card-body">
          <p class="tiny muted">Os vencedores são os maiores pontuadores de ${shortMonth(m)}/${year()}, calculados na aba Pontuação. Não é preciso digitar nomes — ajuste apenas brinde, custo e entrega de cada colocação.</p>
          <form data-form="award" class="form-grid mt">
            ${AWARD_PLACES.map((_, i) => placeFields(i)).join('')}
            <div class="form-actions" style="grid-column:1/-1"><button class="btn btn-primary" type="submit">Salvar premiação</button></div>
          </form>
        </div>
      </div>
      <div class="card">
        ${section('Histórico de premiações', 'Custos entram no fluxo de caixa em Brindes')}
        <div class="table-wrap">${history.length ? `<table><thead><tr><th>Mês</th><th>1º lugar</th><th>2º lugar</th><th>3º lugar</th><th class="right">Custo</th><th>Status</th></tr></thead><tbody>
          ${history.map(a => {
            const p = awardPlaces(a), entregues = awardDelivered(a);
            return `<tr><td>${shortMonth(a.month)}</td><td class="small">${esc(winner(p[0].playerId))}</td><td class="small">${esc(winner(p[1].playerId))}</td><td class="small">${esc(winner(p[2].playerId))}</td><td class="right mono">${money(awardTotal(a))}</td><td>${badge(entregues === 3 ? 'Entregue' : `Pendente ${entregues}/3`, entregues === 3 ? 'green' : 'amber')}</td></tr>`;
          }).join('')}
        </tbody></table>` : empty('Sem premiações', 'Salve a premiação do mês para aparecer aqui.')}</div>
      </div>
    </div>`;
}

function paymentModeHtml() {
  const mode = settings().paymentMode === 'mp' ? 'mp' : 'manual';
  const status = mpStatus || {};
  const can = !!viewToken && !viewBlockReason() && !!window.RachaLicense?.canUseServer();
  let statusText = 'Disponível no site principal, com o link do grupo criado.';
  if (can) {
    if (status.loading) statusText = 'Consultando o vínculo…';
    else if (!status.configured) statusText = 'O vínculo ainda não foi habilitado pelo administrador do app.';
    else if (status.connected) {
      statusText = status.expired
        ? 'Conta conectada, mas o acesso ao Mercado Pago expirou. Toque em conectar novamente.'
        : 'Conta conectada' + (status.email ? ' · ' + status.email : '') + '.';
    } else statusText = 'Nenhuma conta do Mercado Pago conectada ainda.';
  }
  return `
    <div class="stack">
      <label class="field">Meio de pagamento dos jogadores<select name="paymentMode">
        <option value="manual" ${mode === 'manual' ? 'selected' : ''}>PIX manual (padrão)</option>
        <option value="mp" ${mode === 'mp' ? 'selected' : ''}>Mercado Pago (PIX, cartão e cobrança automática)</option>
      </select></label>
      <p class="tiny muted">O PIX da sua chave continua disponível como alternativa mesmo depois de escolher o Mercado Pago. Salve as premissas e atualize o link do grupo para publicar a escolha.</p>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" type="button" data-act="connect-mp" ${can ? '' : 'disabled'}>🔗 Conectar com Mercado Pago</button>
        <a class="btn btn-ghost" href="https://www.mercadopago.com.br/hub/registration/landing" target="_blank" rel="noopener">Criar conta no Mercado Pago</a>
      </div>
      <p class="tiny ${status.connected && !status.expired ? '' : 'muted'}">${esc(statusText)}</p>
      <details>
        <summary class="small">Passo a passo para conectar</summary>
        <div class="stack" style="margin-top:8px">
          <p class="tiny muted">1. Se ainda não tem conta, toque em <strong>Criar conta no Mercado Pago</strong>. Se já tem, pode pular.</p>
          <p class="tiny muted">2. Entre no Mercado Pago com a conta que vai receber o dinheiro do racha (a mesma do e-mail da sua conta).</p>
          <p class="tiny muted">3. Volte aqui e toque em <strong>Conectar com Mercado Pago</strong>. Você será levado ao Mercado Pago.</p>
          <p class="tiny muted">4. Confira os dados e autorize. O app volta sozinho para esta página com a confirmação.</p>
          <p class="tiny muted">5. Escolha <strong>Mercado Pago</strong> acima, salve as premissas e toque em <strong>Atualizar agora</strong> no link do grupo.</p>
          <p class="tiny muted">Seus dados de acesso ficam salvos no servidor. Não é preciso copiar token, senha ou chave para cá.</p>
        </div>
      </details>
    </div>`;
}

function dailyPaymentsHtml() {
  const s = settings();
  const enabled = s.dailyPaymentEnabled !== false;
  const summary = dailySummary || { games: [], totalCredit: 0 };
  const rows = Array.isArray(summary.games) ? summary.games.slice(0, 8) : [];
  const map = Object.create(null);
  rows.forEach((r) => { if (r && r.id) map[r.id] = r; });
  const games = (state.games || []).slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const upcoming = games.filter((g) => !g.done && !g.canceled).slice(0, 60);
  const options = (upcoming.length ? upcoming : games.slice(-40)).map((g) => {
    const r = map[g.id];
    const info = r ? ` · ${r.paid} pago(s)${r.pending ? ` · ${r.pending} aguardando` : ''}` : '';
    return `<option value="${esc(g.id)}">${esc(fmtDate(g.date))}${esc(info)}</option>`;
  }).join('');
  const canManage = !!viewToken && !viewBlockReason() && !!window.RachaLicense?.canUseServer();
  const table = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Jogo</th><th>Pagos</th><th>Aguardando</th><th>Resolvidos</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${esc(r.label || fmtDate(r.date))}</td><td class="mono">${num(r.paid)} · ${money(r.paidAmount)}</td><td class="mono">${num(r.pending)}</td><td class="small">${num(r.credited)} crédito · ${num(r.refunded)} estorno</td></tr>`).join('')}
  </tbody></table></div>` : '<p class="tiny muted">Ainda não há diárias pagas por este link.</p>';
  return `
    <p class="small muted">No link individual, mensalista paga a mensalidade e diarista paga a diária pelo <strong>PIX do administrador</strong>. ${settings().paymentMode === 'mp' && mpStatus.connected
      ? 'Com sua conta conectada, o jogador também pode gerar PIX no Mercado Pago, pagar no cartão ou ativar a cobrança automática: o pagamento aprovado baixa sozinho e libera a presença.'
      : hasIntermediate()
        ? 'No PRO ADM, o jogador toca em <strong>“Vou jogar”</strong> para confirmar a presença, mas <strong>não baixa o pagamento</strong>: no PIX manual a baixa é sua, em Confirmação manual; no Mercado Pago é pelo webhook.'
        : 'No Básico, o jogador toca em <strong>“Avisar que paguei”</strong> e você dá a baixa em <strong>Confirmação manual</strong>. Até lá a presença fica bloqueada.'}</p>
    <p class="small ${enabled ? 'muted' : ''}" ${enabled ? '' : 'style="color:var(--amber)"'}>Pagamento antecipado da diária: <strong>${enabled ? 'ligado' : 'desligado'}</strong>. Para mudar, use o campo em Financeiro e salve as premissas. A mensalidade sempre precisa estar em dia.</p>
    <p class="tiny muted">Mensalidades baixadas: <strong>${num(summary.monthly?.paid)} · ${money(summary.monthly?.paidAmount)}</strong> (${num(summary.monthly?.pending)} aguardando baixa). Se o mensalista estiver devendo, o botão “Vou jogar” fica bloqueado até você dar a baixa.</p>
    <p class="tiny muted">Créditos disponíveis no grupo: <strong>${money(summary.totalCredit || 0)}</strong>. O crédito nasce quando você cancela um jogo e escolhe “virar crédito”.</p>
    ${viewToken ? `
      <div class="row" style="align-items:flex-end;gap:8px;flex-wrap:wrap">
        <label class="field" style="flex:1;min-width:220px">Jogo para cancelar<select id="daily-cancel-game">${options || '<option value="">Sem jogos cadastrados</option>'}</select></label>
        <button class="btn btn-ghost" type="button" data-act="refresh-daily-summary" ${canManage ? '' : 'disabled'}>🔄 Atualizar</button>
      </div>
      <div class="row games-actions" style="margin-top:8px">
        <button class="btn btn-primary" type="button" data-act="cancel-daily-credit" ${canManage ? '' : 'disabled'}>💳 Cancelar e virar crédito</button>
        <button class="btn btn-danger" type="button" data-act="cancel-daily-refund" ${canManage ? '' : 'disabled'}>↩️ Cancelar e estornar</button>
      </div>
      <p class="tiny muted">Escolha uma das duas opções antes de confirmar. “Crédito” fica para a próxima diária do mesmo jogador; “Estorno” é combinado com o jogador, fora do app. Diárias ainda não pagas são apenas canceladas.</p>
      ${table}
    ` : '<p class="tiny muted">Crie o link do grupo para liberar o pagamento da diária.</p>'}
  `;
}

function manualConfirmHtml() {
  const linked = (state.players || []).filter((p) => p && p.id && playerLinks[p.id]);
  const players = linked.map((p) =>
    `<option value="${esc(p.id)}">${esc(p.name || p.id)} · ${esc(p.type || '')}</option>`).join('');
  const games = (state.games || []).slice()
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    .filter((g) => !g.done && !g.canceled)
    .map((g) => `<option value="${esc(g.id)}">${esc(fmtDate(g.date))}${g.name ? ' · ' + esc(g.name) : ''}</option>`).join('');
  const can = !!viewToken && !viewBlockReason() && !!window.RachaLicense?.canUseServer() && linked.length > 0;
  const summary = dailySummary || {};
  const notices = Array.isArray(summary.notices) ? summary.notices : [];
  const autoMode = typeof summary.autoCheckin === 'boolean' ? summary.autoCheckin : hasIntermediate();
  const noticeRows = notices.slice(0, 8).map((n) => {
    const when = fmtDateTime(n.at);
    const what = n.kind === 'monthly' && num(n.month)
      ? 'mensalidade ' + shortMonth(num(n.month)) + '/' + num(n.year)
      : 'diária';
    const state = n.status === 'done' ? 'presença confirmada' : 'aguardando baixa';
    return `<div class="tiny muted">${esc(when)} · ${esc(n.playerName || n.playerId)} · ${esc(what)} · ${money(n.amount)} · ${esc(state)}</div>`;
  }).join('');
  return `
    <p class="small muted">Modo do seu plano: <strong>${autoMode ? 'PRO ADM — presença confirmada pelo jogador' : 'Básico — aviso do jogador'}</strong>. ${autoMode
      ? 'Ao tocar em “Vou jogar”, o jogador confirma a presença; a baixa do pagamento continua sendo sua aqui no PIX manual (ou do webhook no Mercado Pago). Cada ação fica registrada.'
      : 'O jogador paga e avisa; a baixa e a presença continuam sendo dadas por você aqui.'}</p>
    ${notices.length ? `
      <div class="card" style="box-shadow:none;background:var(--surface-2)">
        <div class="card-body stack">
          <strong>Avisos dos jogadores (${notices.length})</strong>
          ${noticeRows}
          <div class="row" style="justify-content:flex-end;margin-top:6px">
            <button class="btn btn-ghost btn-sm" type="button" data-act="ack-notices" ${can ? '' : 'disabled'}>✅ Marcar avisos como vistos</button>
          </div>
        </div>
      </div>` : ''}
    <p class="small muted">Aqui você dá baixa do PIX manual, do dinheiro ou de casos especiais: marca a presença e/ou o pagamento direto no link. Para o diarista que pagou a diária, marque os dois. Cada ação fica registrada no histórico do link.</p>
    ${linked.length ? `
      <div class="row" style="align-items:flex-end;gap:8px;flex-wrap:wrap">
        <label class="field" style="flex:1;min-width:200px">Jogador<select id="manual-player">${players}</select></label>
        <label class="field" style="flex:1;min-width:200px">Jogo<select id="manual-game">${games || '<option value="">Sem jogos futuros</option>'}</select></label>
      </div>
      <div class="row" style="gap:14px;flex-wrap:wrap;margin-top:10px">
        <label class="field" style="flex-direction:row;align-items:center;gap:8px"><input id="manual-presence" type="checkbox" checked style="width:16px" /> Confirmar presença</label>
        <label class="field" style="flex-direction:row;align-items:center;gap:8px"><input id="manual-payment" type="checkbox" checked style="width:16px" /> Marcar pagamento como pago</label>
      </div>
      <div class="row games-actions" style="margin-top:10px">
        <button class="btn btn-primary" type="button" data-act="manual-confirm" ${can ? '' : 'disabled'}>✅ Aplicar confirmação manual</button>
      </div>
      <p class="tiny muted">Mensalista: marca o mês pendente mais antigo. Diarista: marca a diária do jogo escolhido. Se marcar só a presença, o pagamento continua pendente no link dele.</p>
    ` : '<p class="tiny muted">Crie o link do grupo e distribua os links individuais para liberar esta opção.</p>'}
  `;
}

function sessionRowsHtml() {
  const rows = sessionsList();
  if (!rows.length) return '<p class="small muted">Nenhum racha cadastrado.</p>';
  return `<div class="table-wrap"><table><thead><tr><th style="width:34px"><input type="checkbox" id="session-all" data-act="session-select-all" title="Selecionar todos" style="width:16px" /></th><th>Racha</th><th>Dia</th><th>Horário</th><th>Duração</th><th>Local</th><th>Status</th><th>Custos</th><th class="right">Ações</th></tr></thead><tbody>
    ${rows.map(s => `<tr>
      <td><input type="checkbox" class="session-check" value="${esc(s.id)}" style="width:16px" /></td>
      <td><strong>${esc(s.name)}</strong>${s.notes ? `<div class="tiny muted">${esc(s.notes)}</div>` : ''}</td><td>${esc(WEEKDAYS[num(s.day)] || '—')}</td><td class="mono">${esc(s.time)}</td>
      <td>${esc(s.duration || '—')}</td><td class="small muted">${esc(s.location || '—')}</td>
      <td>${badge(s.active !== false ? 'Ativo' : 'Inativo', s.active !== false ? 'green' : 'amber')}</td>
      <td class="small muted">Goleiros: ${s.withGoalkeepers !== false ? 'sim' : 'não'} · Árbitro: ${s.withReferee !== false ? 'sim' : 'não'}</td>
      <td class="right"><button class="icon-btn" type="button" data-act="session-edit" data-id="${esc(s.id)}" title="Editar racha">✏️</button>
      <button class="icon-btn danger" type="button" data-act="session-delete" data-id="${esc(s.id)}" title="Excluir racha">🗑️</button></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}

function pageSettings() {
  const s = settings();
  const f = (name, label, step = '0.01', hidden = false) => `<label class="field"${hidden ? ' style="display:none"' : ''}>${esc(label)}<input name="${name}" type="number" step="${step}" value="${num(s[name])}" /></label>`;
  const viewReason = viewBlockReason();
  const viewAllowed = !viewReason;
  const viewNote = viewReason || 'O link usa o site principal (Netlify). O espelho do GitHub Pages não tem esse recurso.';
  return `
    <form data-form="settings">
      <div class="grid grid-2">
        <div class="card">
          ${section('Perfil do racha', 'Dados e regras que aparecem no link do grupo')}
          <div class="card-body form-grid">
            <label class="field" style="grid-column:1/-1">Nome do racha<input name="rachaName" value="${esc(s.rachaName || '')}" placeholder="Racha do Loló" /></label>
            <label class="field">Data de nascimento<input name="rachaFounded" type="date" value="${esc(String(s.rachaFounded || '').slice(0, 10))}" /></label>
            <label class="field">Horário habitual<input name="rachaTime" type="time" value="${esc(s.rachaTime || '')}" /></label>
            <label class="field">Local<input name="rachaLocation" value="${esc(s.rachaLocation || '')}" placeholder="Ex.: Quadra do clube, centro" /></label>
            <label class="field">Duração<input name="rachaDuration" value="${esc(s.rachaDuration || '')}" placeholder="Ex.: 2 horas" /></label>
            <label class="field" style="grid-column:1/-1;align-items:flex-start">Regras do racha (estatuto)<textarea name="rachaRules" rows="6" style="min-height:120px;resize:vertical" placeholder="Escreva aqui as regras do seu racha">${esc(s.rachaRules || '')}</textarea></label>
            <div class="field" style="grid-column:1/-1;align-items:flex-start">
              <span class="tiny muted">Logo do racha (JPG, PNG ou WebP — reduzida automaticamente)</span>
              <div class="row" style="align-items:center;gap:12px;flex-wrap:wrap">
                ${s.rachaLogo ? `<img src="${esc(s.rachaLogo)}" alt="Logo do racha" style="width:64px;height:64px;object-fit:cover;border-radius:14px;border:1px solid var(--border-soft)" />` : `<span style="width:64px;height:64px;display:grid;place-items:center;border-radius:14px;background:${esc(colors.accent)}22;font-weight:900;color:${esc(colors.accent)}">RL</span>`}
                <input id="racha-logo-file" type="file" accept="image/png,image/jpeg,image/webp" />
                ${s.rachaLogo ? `<button class="btn btn-sm btn-danger" type="button" data-act="remove-logo">Remover logo</button>` : ''}
              </div>
            </div>
          </div>
        </div>
        <div class="card">
          ${section('Horários da semana', 'Mais de um horário no mesmo racha', `
            <button class="btn btn-sm btn-primary" type="button" data-act="session-new">＋ Novo horário</button>
            <button class="btn btn-sm btn-ghost" type="button" data-act="session-clear-selected">🧹 Limpar selecionados</button>
            <button class="btn btn-sm btn-danger" type="button" data-act="session-clear-all" ${sessionsList().length ? '' : 'disabled'}>🧹 Limpar todos</button>`)}
          <div class="card-body stack">
            ${sessionRowsHtml()}
            <p class="tiny muted">Cadastre, por exemplo, a <strong>Segunda às 19h</strong> e a <strong>Quinta às 20h</strong>, cada uma com nome, duração e local. Ao criar um jogo, escolha qual horário da semana é; o horário, o local e a duração vêm junto. O Cronômetro também usa a duração do horário escolhido.</p>
          </div>
        </div>
        <div class="card">
          ${section('Financeiro', 'Valores base usados nas simulações', `<button class="btn btn-sm btn-ghost" type="button" data-act="open-reconcile">Conciliar extrato</button>`)}
          <div class="card-body form-grid">
            ${f('year', 'Ano de controle', '1')}
            ${f('monthlyFee', 'Mensalidade (R$/mês)')}
            ${f('feePresidente', 'Presidente (R$/mês)')}
            ${f('feeVice', 'Vice-Presidente (R$/mês)')}
            ${f('feeDiretor', 'Diretor (R$/mês)')}
            ${f('feeConselheiro', 'Conselheiro (R$/mês)')}
            <p class="tiny muted" style="grid-column:1/-1">Deixe <strong>0</strong> para o cargo cobrar igual ao mensalista. Para cobrar mais, digite o valor (ex.: 100). O app nunca cobra menos que a mensalidade base: se você digitar um valor menor, ele é ajustado automaticamente ao salvar.</p>
            ${f('dayFee', 'Diária (R$/jogo)')}
            <label class="field" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:8px"><input name="dailyPaymentEnabled" type="checkbox" ${s.dailyPaymentEnabled !== false ? 'checked' : ''} style="width:16px" /> Exigir PIX antecipado dos diaristas no link individual</label>
            ${f('fieldRent', 'Aluguel mensal do campo (R$)')}
            ${f('goalkeepers', 'Nº de goleiros pagos', '1')}
            ${f('goalkeeperFee', 'Valor por goleiro por jogo (R$)')}
            ${f('refereeFee', 'Arbitragem por jogo (R$)')}
            ${f('gamesPerMonth', 'Jogos por mês', '1')}
            <p class="tiny muted" style="grid-column:1/-1">Despesas fixas: ao salvar, Quadra, Goleiros e Arbitragem são recalculados com aluguel, goleiros, valor por goleiro, arbitragem por jogo e jogos por mês. Em <strong>Horários da semana</strong> você decide, horário por horário, se há goleiros pagos e arbitragem paga; horários desligados saem desses custos. Churrasco acompanha custo por pessoa, número de pessoas e quantidade por ano; Brindes divide a reserva mensal em 50% / 30% / 20% entre 1º, 2º e 3º lugares. Lançamentos e premiações salvos manualmente não são alterados.</p>
            ${f('initialCash', 'Saldo inicial do caixa (R$)')}
            <label class="field" style="grid-column:1/-1">Chave PIX do administrador (PIX manual e doações)<input name="pixKey" value="${esc(s.pixKey || '')}" placeholder="CPF, e-mail, telefone ou chave aleatória" /></label>
            <label class="field">Nome do favorecido<input name="pixMerchant" value="${esc(s.pixMerchant || '')}" placeholder="RACHA DO LOLO" /></label>
            <label class="field">Cidade<input name="pixCity" value="${esc(s.pixCity || '')}" placeholder="SAO PAULO" /></label>
            <label class="field" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:8px"><input name="donationEnabled" type="checkbox" ${s.donationEnabled !== false ? 'checked' : ''} style="width:16px" /> Mostrar PIX de doação no link do grupo</label>
            <label class="field" style="grid-column:1/-1">Mensagem da doação<input name="donationText" value="${esc(s.donationText || '')}" placeholder="Ajude a manter o racha: qualquer quantia é bem-vinda!" /></label>
            <p class="tiny muted" style="grid-column:1/-1">A doação usa a mesma chave PIX acima, mas sem valor fixo: quem quiser doar escolhe o valor no próprio banco. Ela não cobra mensalidade nem diária e não precisa de Mercado Pago.</p>
            <p class="tiny muted" style="grid-column:1/-1">A chave acima é o destino do <strong>PIX manual</strong> dos jogadores (mensalidade e diária). O app gera o código copia e cola. Se você escolher Mercado Pago em <strong>Pagamentos no link</strong>, o jogador também pode pagar por lá; esta chave continua valendo como alternativa.</p>
          </div>
        </div>
        <div class="card">
          ${section('Cenário e churrasco', 'Planejamento e reserva')}
          <div class="card-body form-grid">
            ${f('plannedMembers', 'Mensalistas planejados', '1')}
            ${f('maxPlayers', 'Limite por jogo (0 = sem limite)', '1')}
            ${f('dayPlayersPerGame', 'Diaristas médios por jogo', '1')}
            <label class="field" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:8px"><input name="bbqEnabled" type="checkbox" ${s.bbqEnabled !== false ? 'checked' : ''} style="width:16px" /> Reserva do churrasco ativa (entra na meta e no fluxo de caixa)</label>
            ${f('bbqCostPerPerson', 'Churrasco: custo por pessoa (R$)', '0.01', s.bbqEnabled === false)}
            ${f('bbqPeople', 'Churrasco: nº de pessoas', '1', s.bbqEnabled === false)}
            ${f('bbqPerYear', 'Churrascos por ano', '1', s.bbqEnabled === false)}
            <button class="btn btn-sm btn-ghost" type="button" data-act="launch-bbq" ${s.bbqEnabled === false || num(s.bbqCostPerPerson) <= 0 || num(s.bbqPeople) <= 0 ? 'disabled' : ''} title="Lança um churrasco na aba Despesas com estes valores">＋ Lançar churrasco em Despesas</button>
            <p class="tiny muted" style="grid-column:1/-1">O botão lança <strong>um</strong> churrasco no mês atual com “custo por pessoa × nº de pessoas”. Os churrascos da reserva aparecem em Despesas como “(automático)” e não são duplicados por este botão. Para um segundo churrasco no mesmo mês, lance em Despesas com outro nome.</p>
            ${f('giftsReserve', 'Reserva mensal p/ brindes (R$)')}
          </div>
        </div>
        <div class="card">
          ${section('Metas genéricas', 'Extras mensais e metas anuais separadas')}
          <div class="card-body stack">
            <div class="form-grid">
              <label class="field">Nome<input id="goal-name" placeholder="Ex.: Camisa nova" /></label>
              <label class="field">Valor (R$)<input id="goal-amount" type="number" min="0" step="0.01" placeholder="0,00" /></label>
              <label class="field">Tipo<select id="goal-mode"><option value="monthly">Mensal (recorrente)</option><option value="monthly-month">Mensal (mês específico)</option><option value="annual">Anual (separada)</option></select></label>
              <label class="field">Mês<select id="goal-month"><option value="0">Todos os meses</option>${MONTHS.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('')}</select></label>
              <label class="field">Ano<input id="goal-year" type="number" min="2000" max="2100" value="${year()}" /></label>
            </div>
            <button class="btn btn-primary" type="button" data-act="add-goal">➕ Adicionar meta</button>
            ${goals().length ? `<div class="stack">${goals().map(g => `
              <div class="row" style="justify-content:space-between;gap:8px;align-items:center">
                <span class="small"><strong>${esc(g.name)}</strong> <span class="tiny muted">${g.mode === 'annual' ? `anual ${esc(g.year || year())}` : g.mode === 'monthly' ? 'todo mês' : `${shortMonth(num(g.month))} · mensal`} · ${money(g.amount)}</span></span>
                <button class="btn btn-sm btn-ghost" type="button" data-act="delete-goal" data-id="${esc(g.id)}">Excluir</button>
              </div>`).join('')}</div>` : '<p class="tiny muted">Nenhuma meta genérica cadastrada.</p>'}
            <p class="tiny muted">Metas mensais somam na meta de receita. Metas anuais aparecem em Fluxo de caixa com progresso próprio.</p>
          </div>
        </div>
        <div class="card">
          ${section('Pontuação do campeonato', 'Valores de cada evento')}
          <div class="card-body form-grid">
            ${f('ptsGoal', 'Pontos por gol', '1')}
            ${f('ptsAssist', 'Pontos por assistência', '1')}
            ${f('ptsPresence', 'Pontos por presença', '1')}
            ${f('ptsFairPlay', 'Pontos por fair play', '1')}
            ${f('ptsPunctual', 'Pontos por pontualidade', '1')}
            ${f('ptsFarrapou', 'Pontos perdidos por cada farrapada / falta', '1')}
            ${f('ptsAtrasado', 'Pontos perdidos por cada atraso', '1')}
            ${f('ptsDesarme', 'Por desarme / interceptação', '1')}
            ${f('ptsDefesas', 'Por defesa difícil (goleiro)', '0')}
            ${f('ptsParedoes', 'Por paredão / jogo sem sofrer gol', '0')}
            ${f('ptsGolsSofridos', 'Por gol sofrido (use número negativo)', '0')}
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
          ${section('Link para o grupo', 'Benefício para assinantes · mensagem e links editáveis')}
          <div class="card-body stack">
            <p class="small muted"><strong>Este é o link que vai ao grupo.</strong> Ele abre direto na aba <strong>👥 Jogadores</strong>: cada membro encontra o nome, informa os últimos 4 dígitos do telefone e já pode fazer check-in/pagamento. Depois o aparelho lembra o perfil por 180 dias. Eles não conseguem editar nada e não precisam assinar. O link é secreto — envie apenas ao grupo.</p>
            <div class="row" style="justify-content:space-between;align-items:center">
              <strong class="small">Mensagem enviada ao grupo</strong>
              <button class="btn btn-sm btn-ghost" type="button" data-act="reset-group-message">Restaurar padrão</button>
            </div>
            <label class="field" style="align-items:flex-start">Texto do convite<textarea name="groupAccessMessage" rows="4" style="min-height:104px;resize:vertical" placeholder="${esc(GROUP_ACCESS_MESSAGE)}">${esc(s.groupAccessMessage || GROUP_ACCESS_MESSAGE)}</textarea></label>
            <p class="tiny muted"><code>{racha}</code> vira o nome cadastrado em Perfil do racha. Escreva <code>{link}</code> no lugar onde o endereço deve aparecer; se apagar essa marcação, o link vai no fim. Salve com <strong>Salvar premissas</strong> no final da página.</p>
            ${viewToken ? `
              <label class="field">Link do grupo<input id="view-link" readonly value="${esc(viewUrl(viewToken))}" /></label>
              <div class="row">
                <button class="btn btn-primary" type="button" data-act="copy-view-link">📋 Copiar link</button>
                <button class="btn btn-ghost" type="button" data-act="open-view-link">🔗 Abrir</button>
                <button class="btn btn-ghost" type="button" data-act="share-whatsapp" data-kind="view">📤 Enviar ao grupo</button>
                <button class="btn btn-ghost" type="button" data-act="copy-whatsapp" data-kind="view">📋 Copiar p/ grupo</button>
                <button class="btn btn-ghost" type="button" data-act="refresh-view-link" ${viewAllowed ? '' : 'disabled'}>🔄 Atualizar agora</button>
                <button class="btn btn-danger" type="button" data-act="revoke-view" ${viewAllowed ? '' : 'disabled'}>🚫 Revogar link</button>
              </div>
              <div class="row mt" style="align-items:flex-end;gap:8px">
                <label class="field" style="flex:1">Validade do link (deixe vazio = sem expiração)<input id="view-expiry" type="date" value="${esc(String(settings().viewExpiresAt || '').slice(0, 10))}" /></label>
                <button class="btn btn-ghost" type="button" data-act="save-view-expiry" ${viewAllowed ? '' : 'disabled'}>Salvar validade</button>
              </div>
              <p class="tiny ${viewAllowed ? 'muted' : ''}" ${viewAllowed ? '' : 'style="color:var(--amber)"'}>${esc(viewNote)}</p>
            ` : `
              <button class="btn btn-primary" type="button" data-act="create-view-link">🔗 Gerar Acesso</button>
              <p class="tiny ${viewAllowed ? 'muted' : ''}" ${viewAllowed ? '' : 'style="color:var(--amber)"'}>${esc(viewNote)}</p>
              <p class="tiny muted">Depois de gerar, aparecem os botões <strong>📤 Enviar ao grupo</strong> e <strong>📋 Copiar p/ grupo</strong>.</p>
            `}
          </div>
        </div>
        <div class="card">
          ${section('Links individuais dos jogadores', 'Cada jogador confirma presença sem senha', `<button class="btn btn-sm btn-ghost" data-act="refresh-view-data">🔄 Atualizar</button>`)}
          <div class="card-body stack">
            <p class="small muted">Toque em <strong>📤 WhatsApp</strong> para abrir o chat do jogador com o link dele já escrito — você só confirma o envio. Quem não tem telefone cadastrado pode usar <strong>📋 Copiar</strong>. Envie sempre somente ao dono do link: ele é a credencial da pessoa e não deve ir para o grupo.</p>
            ${Object.keys(playerLinks).length ? `<div class="table-wrap"><table><thead><tr><th>Jogador</th><th>Envio</th></tr></thead><tbody>
              ${Object.entries(playerLinks).map(([pid, url]) => `<tr><td>${esc(playerName(pid))}</td><td><div class="row" style="gap:6px"><button class="btn btn-sm btn-primary" type="button" data-act="send-player-link" data-id="${esc(pid)}">📤 WhatsApp</button><button class="btn btn-sm btn-ghost" type="button" data-act="copy-player-link" data-id="${esc(pid)}">📋 Copiar</button></div></td></tr>`).join('')}
            </tbody></table></div>` : `<p class="tiny muted">Os links aparecem depois que o link do grupo for criado/atualizado.</p>`}
            <p class="tiny muted">Limite de vagas por jogo: <strong>${num(settings().maxPlayers) || 'sem limite'}</strong>. Quem entrar depois disso vai para a fila de espera.</p>
          </div>
        </div>
        <div class="card">
          ${section('Pagamentos no link', 'Mensalidade em dia libera o mensalista · diarista paga antes', `<button class="btn btn-sm btn-ghost" type="button" data-act="refresh-daily-summary">🔄 Atualizar</button>`)}
          <div class="card-body stack">${paymentModeHtml()}<hr />${dailyPaymentsHtml()}</div>
        </div>
        <div class="card">
          ${section('Confirmação manual', 'Pagamento em dinheiro ou caso especial · sem esperar o PIX')}
          <div class="card-body stack">${manualConfirmHtml()}</div>
        </div>
        <div class="card">
          ${section('Lembretes automáticos', 'Jogo em 24h/2h · mensalidade no vencimento e 3 dias depois', `<button class="btn btn-sm btn-ghost" type="button" data-act="reset-reminders">Restaurar padrão</button>`)}
          <div class="card-body stack">
            <p class="small muted">As frases abaixo valem para o painel e para a função agendada <code>send-reminders</code>. Nos lembretes de jogo use <code>{jogo}</code>, <code>{data}</code>, <code>{horario}</code>, <code>{jogador}</code> e <code>{link}</code>. Na mensalidade use <code>{aviso}</code>, <code>{vencimento}</code>, <code>{mes}</code>, <code>{ano}</code>, <code>{valor}</code>, <code>{jogador}</code> e <code>{link}</code>. Sem <code>{link}</code>, ele vai no fim.</p>
            <label class="field" style="align-items:flex-start">Jogo · aviso para o grupo<textarea name="reminderGroup" rows="3" style="min-height:84px;resize:vertical">${esc(s.reminderGroup)}</textarea></label>
            <label class="field" style="align-items:flex-start">Jogo · lembrete individual<textarea name="reminderPlayer" rows="3" style="min-height:84px;resize:vertical">${esc(s.reminderPlayer)}</textarea></label>
            <label class="field" style="align-items:flex-start">Mensalidade · aviso genérico no grupo<textarea name="reminderDueGroup" rows="3" style="min-height:84px;resize:vertical">${esc(s.reminderDueGroup || defaultSettings().reminderDueGroup)}</textarea></label>
            <label class="field" style="align-items:flex-start">Mensalidade · cobrança individual<textarea name="reminderDuePlayer" rows="3" style="min-height:84px;resize:vertical">${esc(s.reminderDuePlayer || defaultSettings().reminderDuePlayer)}</textarea></label>
            <p class="tiny muted">No grupo, a mensalidade sai só como aviso genérico: sem nomes, valores ou links individuais. A cobrança individual vai apenas para o chat do jogador. O vencimento é o campo manual em Pagamentos. Salve com <strong>Salvar premissas</strong> ao final da página.</p>
            <button class="btn btn-ghost" type="button" data-act="show-reminders">🔔 Ver lembretes de agora</button>
          </div>
        </div>
        <div class="card">
          ${section('Dados', 'Backup, importação e limpeza')}
          <div class="card-body stack">
            <p class="small muted">Os dados de gestão ficam salvos neste navegador; link do grupo e licença usam o servidor. Faça backup regularmente e guarde o arquivo em local seguro.</p>
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
            <hr style="border:0;border-top:1px solid var(--border-soft);margin:12px 0">
            <p class="small"><strong>Cópias automáticas</strong> <span class="muted">(últimas ${BACKUP_MAX}, a cada 10 min)</span></p>
            ${backupList().length ? backupList().map((b, i) => `
              <div class="row" style="justify-content:space-between;align-items:center;gap:8px">
                <span class="tiny muted">${fmtDateTime(b.at)} · ${esc(b.reason || 'Alteração')}</span>
                <button class="btn btn-ghost btn-sm" type="button" data-act="restore-backup" data-i="${i}">Restaurar</button>
              </div>`).join('') : '<p class="tiny muted">Ainda não há cópias automáticas. Elas aparecem após a primeira alteração.</p>'}
            <p class="small mt"><strong>Trilha de auditoria</strong> <span class="muted">(últimos ${Math.min(8, (state.audit || []).length)} de ${(state.audit || []).length} registros)</span></p>
            ${(state.audit || []).slice(0, 8).map(a => `<div class="tiny muted">${fmtDateTime(a.at)} · ${esc(a.action)}${a.detail ? ' · ' + esc(a.detail) : ''}</div>`).join('') || '<p class="tiny muted">Nenhuma alteração registrada ainda.</p>'}
            <p class="tiny muted mt">As fotos ficam no armazenamento ampliado do navegador (IndexedDB) e entram no backup JSON.</p>
          </div>
        </div>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn btn-primary" type="submit">💾 Salvar premissas</button></div>
    </form>`;
}

function pageSubscription() {
  const L = window.RachaLicense;
  const st = L.status();
  const plans = L.plans();
  const key = L.key;
  const known = L.lastKnown;
  const badgeKind = st.kind === 'active' || st.kind === 'grace' ? 'green' : st.kind === 'trial' ? 'blue' : st.kind === 'pending' ? 'amber' : 'red';
  const canPay = L.canUseServer();
  const ready = canPay && L.configured;
  const currentPlan = String(known?.plan || '');
  const upgradePlan = currentPlan === 'yearly' ? 'intermediate_yearly' : 'intermediate_monthly';
  const canUpgrade = ready && !!key && (st.kind === 'active' || st.kind === 'grace')
    && L.tier() === 'basic' && ['monthly', 'yearly'].includes(currentPlan) && !known?.cancelRequestedAt;
  const note = !canPay
    ? 'Aqui no teste local (ou no espelho do GitHub) não é possível assinar. Para assinar, use o site principal: rachadololo.netlify.app.'
    : !ready
      ? 'O checkout ainda está sendo configurado pelo administrador. Você pode continuar usando o período gratuito normalmente.'
      : '';

  return `
    <div class="stack">
      <div class="sub-hero">
        <div class="row" style="align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <h2>${esc(st.label)}</h2>
            <p>${esc(st.detail)}. Seus dados continuam salvos neste navegador, mesmo sem assinatura.${known?.plan === 'lifetime' ? ' Conta de administrador: todos os recursos liberados.' : ''}</p>
          </div>
          <div>${badge(st.label, badgeKind)}</div>
        </div>
        ${note ? `<div class="banner" style="margin:14px 0 0">${esc(note)}</div>` : ''}
      </div>

      <div class="card">
        ${section('Escolha seu plano', 'Básico ou PRO · mensal ou anual · renovação automática')}
        <div class="card-body">
          <div class="sub-plans">
            <div class="plan-card">
              <span class="plan-tag">Básico</span>
              <div class="plan-name">Plano Básico</div>
              <div class="plan-price">${money(plans.monthly.amount)} <small>/ mês</small></div>
              <p class="tiny muted" style="margin:6px 0 0">Ou ${money(plans.yearly.amount)}/ano — economize ${money(plans.monthly.amount * 12 - plans.yearly.amount)}.</p>
              <ul class="plan-list">
                <li>O app completo: jogos, presença, sorteio e pontuação</li>
                <li>Ranking, premiações 1º/2º/3º, caixa e despesas</li>
                <li>Link do grupo, área do jogador, PIX e placar ao vivo</li>
                <li>Jogador avisa que pagou e você dá a baixa/check-in</li>
                <li>PDF mensal, backup local, fotos e instalação no celular</li>
              </ul>
              <div class="row" style="gap:8px;flex-wrap:wrap">
                <button class="btn btn-primary" type="button" data-act="subscribe" data-plan="monthly" ${ready ? '' : 'disabled'}>Mensal · ${money(plans.monthly.amount)}</button>
                <button class="btn btn-ghost" type="button" data-act="subscribe" data-plan="yearly" ${ready ? '' : 'disabled'}>Anual · ${money(plans.yearly.amount)}</button>
              </div>
            </div>
            <div class="plan-card featured">
              <span class="plan-tag">ADM · Recomendado</span>
              <div class="plan-name">Plano PRO ADM</div>
              <div class="plan-price">${money(plans.intermediate_monthly.amount)} <small>/ mês</small></div>
              <p class="tiny muted" style="margin:6px 0 0">Ou ${money(plans.intermediate_yearly.amount)}/ano — economize ${money(plans.intermediate_monthly.amount * 12 - plans.intermediate_yearly.amount)}.</p>
              <ul class="plan-list">
                <li>Tudo do Básico</li>
                <li><strong>Presença confirmada pelo jogador (ADM):</strong> ele toca em “Vou jogar”; a baixa do pagamento continua com o administrador (ou com o webhook no Mercado Pago)</li>
                <li>Backup JSON local e cópias automáticas no aparelho</li>
                <li>Link do grupo com validade configurável e renovação automática da assinatura</li>
                <li>Lembretes automáticos e relatório mensal guardado</li>
                <li>Logo, nome e cores na área do jogador e histórico completo</li>
              </ul>
              <div class="row" style="gap:8px;flex-wrap:wrap">
                <button class="btn btn-primary" type="button" data-act="subscribe" data-plan="intermediate_monthly" ${ready ? '' : 'disabled'}>Mensal · ${money(plans.intermediate_monthly.amount)}</button>
                <button class="btn btn-ghost" type="button" data-act="subscribe" data-plan="intermediate_yearly" ${ready ? '' : 'disabled'}>Anual · ${money(plans.intermediate_yearly.amount)}</button>
              </div>
            </div>
          </div>
          <p class="tiny muted" style="margin:14px 0 0">Durante os 14 dias grátis você testa todos os recursos, inclusive a confirmação de presença pelo jogador. Esse toque confirma a presença, não o pagamento; a baixa fica registrada para você conferir.</p>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          ${section('Minha chave de licença', 'Chave vinculada a este aparelho para evitar compartilhamento')}
          <div class="card-body stack">
            ${key ? `
              <div class="sub-key">${esc(key)}</div>
              <div class="row">
                <button class="btn btn-sm btn-ghost" type="button" data-act="copy-license">📋 Copiar chave</button>
                <button class="btn btn-sm btn-ghost" type="button" data-act="refresh-license">🔄 Verificar agora</button>
                ${canUpgrade ? `<button class="btn btn-sm btn-primary" type="button" data-act="upgrade" data-plan="${esc(upgradePlan)}">⚡ Fazer upgrade para o PRO</button>` : ''}
                ${L.lastKnown?.state === 'active' && known?.plan !== 'lifetime' && known?.plan !== 'temporary_pro' ? `<button class="btn btn-sm btn-ghost" type="button" data-act="cancel-license">Cancelar assinatura</button>` : ''}
              </div>
              ${canUpgrade ? `<p class="tiny muted">Sua chave e sua data de cobrança continuam as mesmas: o valor da assinatura atual é alterado, sem nova assinatura e sem duas cobranças.</p>` : ''}
              ${known?.plan === 'lifetime' ? `<p class="tiny" style="color:var(--accent)">Conta de administrador — sem cobranças e sem renovação.</p>` : ''}
              ${known?.plan === 'temporary_pro' ? `<p class="tiny" style="color:var(--accent)">Acesso temporário de teste — sem cobranças. O administrador prorroga ou revoga esta chave.</p>` : ''}
              <p class="tiny muted">Aparelho: ${esc(String(window.RachaLicense.deviceId()).slice(0, 12))}… · Usar em outro aparelho? Digite a chave aqui no aparelho novo e confirme o e-mail da assinatura. São até 2 aparelhos; você faz isso sozinho.</p>
              ${known?.emailMasked ? `<p class="tiny muted">Conta: ${esc(known.emailMasked)}</p>` : ''}
              ${known?.nextPaymentAt ? `<p class="tiny muted">${known.plan === 'temporary_pro' ? 'Válido até' : 'Próxima cobrança'}: ${esc(String(known.nextPaymentAt).slice(0, 10))}</p>` : ''}
              ${known?.cancelRequestedAt ? `<p class="tiny" style="color:var(--amber)">Cancelamento solicitado. O acesso segue até ${esc(String(known.nextPaymentAt || '').slice(0, 10))}.</p>` : ''}
              ${L.lastError ? `<p class="tiny" style="color:var(--amber)">Sem conexão com o servidor neste momento. A licença continua válida por até 3 dias offline.</p>` : ''}
            ` : `
              <p class="small muted">Você ainda não tem uma chave. Ela aparece automaticamente quando você inicia uma assinatura.</p>
              <form data-form="license-key" class="row">
                <input name="key" placeholder="RL-XXXXXXXXXXXX" aria-label="Chave de licença" style="flex:1" />
                <button class="btn btn-primary" type="submit">Ativar</button>
              </form>
              <p class="tiny muted">Já assinou neste dispositivo? Digite a chave recebida no checkout.</p>
            `}
            <div class="row" style="margin-top:12px">
              <a class="btn btn-sm btn-ghost" href="contato.html" target="_blank" rel="noopener">✉️ Falar com o Administrador</a>
            </div>
            ${L.lastKnown?.state === 'device_mismatch' ? `
              <form data-form="license-transfer" class="stack">
                <input name="email" type="email" placeholder="E-mail usado no checkout" aria-label="E-mail da assinatura" />
                <button class="btn btn-primary" type="submit">Vincular este aparelho</button>
              </form>
              <p class="tiny muted">Informe o e-mail usado na assinatura para vincular este aparelho. A chave pode ficar em até 2 aparelhos, sem derrubar o anterior.</p>
            ` : ''}
          </div>
        </div>
        <div class="card">
          ${section('Como funciona', 'Simples e sem surpresas')}
          <div class="card-body">
            <div class="sub-steps">
              <div class="sub-step"><span>Use grátis por 14 dias e teste tudo, sem cartão.</span></div>
              <div class="sub-step"><span>Escolha Básico ou PRO, mensal ou anual, e informe seu e-mail. Você será levado ao Mercado Pago.</span></div>
              <div class="sub-step"><span>Ao concluir o pagamento, a licença é confirmada automaticamente e o app volta a liberar a edição.</span></div>
              <div class="sub-step"><span>Guarde a chave de licença: ela pode ficar vinculada a até <strong>2 aparelhos</strong> (por exemplo, notebook e celular). Para usar em outro dispositivo, abra <strong>Assinatura</strong> no aparelho novo, digite a chave e informe o e-mail usado na compra. O vínculo é transferido automaticamente, sem precisar de ajuda, e o aparelho anterior continua funcionando.</span></div>
              <div class="sub-step"><span>Para subir do Básico ao PRO, use <strong>⚡ Fazer upgrade para o PRO</strong> na sua chave: o valor da assinatura atual muda, sem nova chave e sem duas cobranças. O botão aparece apenas para planos ativos no mesmo ciclo (mensal ou anual).</span></div>
              <div class="sub-step"><span>Para cancelar, use o botão na sua chave de licença. O acesso permanece até o fim do período já pago.</span></div>
            </div>
            <div class="legal-links" style="margin-top:18px">
              <a href="termos.html" target="_blank" rel="noopener">Termos de Uso</a>
              <a href="privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>
            </div>
          </div>
        </div>
      </div>
    </div>${developerDonationCardHtml()}`;
}

function modalSubscribe(plan) {
  const L = window.RachaLicense;
  const p = L.plans()[plan] || L.plans().monthly;
  const yearly = plan === 'yearly' || plan === 'intermediate_yearly';
  openModal('Assinar ' + p.label, 'Você será direcionado ao Mercado Pago para concluir o pagamento.', `
    <form data-form="checkout" data-plan="${esc(plan)}" class="stack">
      <div class="sim-result">
        <div style="font-size:22px;font-weight:850">${money(p.amount)} <span class="tiny muted">/ ${yearly ? 'ano' : 'mês'}</span></div>
        <p class="small muted mt">Cobrança recorrente automática. Cancele quando quiser, sem multa.</p>
      </div>
      <label class="field">E-mail para a assinatura
        <input name="email" type="email" required autocomplete="email" placeholder="voce@exemplo.com" />
      </label>
      <p class="tiny muted">Ao continuar, você concorda com os <a href="termos.html" target="_blank" rel="noopener">Termos de Uso</a> e a <a href="privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>. Você tem 7 dias de arrependimento conforme o CDC.</p>
      <button class="btn btn-primary btn-block" type="submit">Ir para o pagamento →</button>
    </form>`);
}

function modalUpgrade(plan) {
  const L = window.RachaLicense;
  const plans = L.plans();
  const p = plans[plan] || plans.intermediate_monthly;
  const atual = plans[L.lastKnown?.plan === 'yearly' ? 'yearly' : 'monthly'];
  const periodo = p.cycle === 'yearly' ? 'ano' : 'mês';
  openModal('Upgrade para o PRO', 'A mesma assinatura muda de valor — sem nova chave.', `
    <form data-form="upgrade" data-plan="${esc(plan)}" class="stack">
      <div class="sim-result">
        <div style="font-size:22px;font-weight:850">${money(atual.amount)} → ${money(p.amount)} <span class="tiny muted">/ ${periodo}</span></div>
        <p class="small muted mt">Você mantém a chave <strong>${esc(L.key || '')}</strong>, o aparelho vinculado e a data da próxima cobrança.</p>
      </div>
      <p class="small muted">O upgrade é feito no Mercado Pago sobre a assinatura atual. Não nasce uma segunda assinatura e não há cobrança dupla. Os recursos do PRO passam a valer assim que o servidor confirmar.</p>
      <p class="tiny muted">Para trocar mensal por anual (ou o contrário), cancele a renovação e assine no novo ciclo — a frequência da assinatura atual não pode ser alterada.</p>
      <button class="btn btn-primary btn-block" type="submit">Confirmar upgrade →</button>
    </form>`);
}

function hasDemo() {
  return ['players', 'payments', 'dayEntries', 'expenses', 'games', 'benefits', 'scores', 'awards'].some(k => state[k].some(x => x.demo));
}

/* ---------- página de pagamento (link de cobrança) ---------- */
function renderPaymentPage() {
  const pp = ui.paymentPage;
  if (!pp) return;
  const p = playerById(pp.playerId);
  const rec = state.payments.find(x => x.playerId === pp.playerId && x.month === pp.month && x.year === num(pp.year) && x.paid !== false);
  const paid = !!rec;
  if (rec && !rec.receiptId) { ensureReceipt(rec); save(); }
  const code = pixCode(pp.amount, txidFor(pp.playerId, pp.month, pp.year));
  $('#content').innerHTML = `
    <div class="payment-center">
      <div class="card card-pad">
        <div class="center">
          ${avatarHTML(p, false).replace('class="avatar', 'class="avatar big')}
          <h2 style="margin-top:12px">${esc(p?.name || 'Jogador')}</h2>
          <p class="muted small">Mensalidade de ${monthName(pp.month)}/${num(pp.year)}</p>
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
            <button class="btn btn-ghost btn-sm" data-act="copy-receipt" data-id="${esc(rec.id)}">📋 Copiar</button>
            <button class="btn btn-ghost btn-sm" data-act="download-receipt" data-id="${esc(rec.id)}">🖼️ PNG</button>
            <button class="btn btn-primary btn-sm" data-act="print-receipt" data-id="${esc(rec.id)}">🖨️ PDF</button>
            <button class="btn btn-ghost btn-sm" data-act="exit-payment" style="margin-left:auto">Voltar ao app</button>
          </div>` : `
          ${code ? `
            <label class="field">Código PIX (copia e cola)<textarea id="pix-code" readonly rows="4">${esc(code)}</textarea></label>
            <button class="btn btn-ghost btn-block mt" data-act="copy-pix">📋 Copiar código PIX</button>
            <div class="center tiny muted mt">Ou pague com o QR Code do seu banco usando o código acima.</div>
          ` : `<div class="banner" style="margin:0">Configure a chave PIX em Configurações para gerar o código de pagamento.</div>`}
          <label class="field mt">ID da transação (opcional)<input id="txid-input" placeholder="Ex.: E123456789202701011234" /></label>
          <button class="btn btn-primary btn-block mt" data-act="confirm-payment-link" data-player="${esc(pp.playerId)}" data-month="${pp.month}" data-amount="${pp.amount}">✅ Confirmar pagamento e dar baixa</button>
          <p class="tiny muted center mt">Ao confirmar, a mensalidade é marcada como paga automaticamente neste app.</p>
          <button class="btn btn-ghost btn-block mt" data-act="exit-payment">Voltar ao app</button>`}
      </div>
    </div>`;
}

function handleHash() {
  const hash = location.hash || '';
  if (/^#config/.test(hash)) {
    if (ui.page !== 'settings') navigate('settings'); else render();
    if (hash.indexOf('mp=connected') >= 0) {
      loadMpStatus(true);
      toast('Conta conectada! Salve as premissas e atualize o link do grupo.', 'ok');
    } else if (hash.indexOf('mp=error') >= 0) {
      loadMpStatus(true);
      toast('Não foi possível conectar o Mercado Pago. Tente novamente.', 'err');
    }
    if (hash.indexOf('mp=') >= 0) {
      try { history.replaceState(null, '', location.pathname + location.search + '#config'); } catch (e) { /* ignora */ }
    }
    return;
  }
  const m = location.hash.match(/^#cobranca\/([^/]+)\/(\d{1,2})(?:\/(\d+(?:\.\d+)?))?/);
  if (m) {
    const pid = decodeURIComponent(m[1]);
    const due = state.payments.find(x => x.playerId === pid && x.month === num(m[2]) && x.paid !== false);
    ui.paymentPage = { playerId: pid, month: num(m[2]), year: num(due?.year) || year(), amount: m[3] ? num(m[3]) : num(due?.amount) || feeForPlayerId(pid) };
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
  sorteador: pageSorteador, timer: pageTimer, live: pageLive, ranking: pageRanking, awards: pageAwards, subscription: pageSubscription,
  settings: pageSettings, comunidade: pageComunidade
};

/* A página Comunidade vive em comunidade.html (para o Netlify Forms detectar
   os formulários), mas é mostrada aqui dentro, sem abrir outra janela. */
let comunidadeLoadId = 0;
function pageComunidade() {
  return '<div class="legal-page"><div id="comunidade-root" class="legal-card">'
    + '<p class="muted">Carregando comunidade...</p></div></div>';
}

async function carregarComunidade() {
  const id = ++comunidadeLoadId;
  try {
    const res = await fetch('./comunidade.html');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const card = doc.getElementById('comunidade-root');
    const root = $('#comunidade-root');
    if (!card || !root || id !== comunidadeLoadId || ui.page !== 'comunidade') return;
    root.innerHTML = card.innerHTML;
    if (window.initComunidade) window.initComunidade(root);
  } catch (e) {
    const root = $('#comunidade-root');
    if (root && id === comunidadeLoadId) {
      root.innerHTML = '<p class="muted">Não foi possível carregar a comunidade agora.</p><p class="mt"><button class="btn btn-sm btn-ghost" type="button" data-act="comunidade-retry">🔄 Tentar de novo</button></p>';
    }
  }
}

function renderNav() {
  $('#nav').innerHTML = NAV.map(g => `
    <div class="nav-group">${g.group}</div>
    ${g.items.map(k => `<button class="nav-item ${ui.page === k ? 'active' : ''}" data-act="nav" data-page="${k}" type="button"><span class="ico">${PAGES[k].ico}</span><span>${PAGES[k].title}</span></button>`).join('')}
  `).join('');
  $('#year-select').innerHTML = [year() - 1, year(), year() + 1, year() + 2].map(y => `<option value="${y}" ${y === year() ? 'selected' : ''}>${y}</option>`).join('');
}

function render(keepScroll) {
  const y = window.scrollY;
  renderNav();
  const p = PAGES[ui.page];
  $('#page-title').textContent = p.title;
  $('#page-subtitle').textContent = p.sub;
  $('#content').innerHTML = PAGE_FNS[ui.page]();
  if (ui.page === 'comunidade') carregarComunidade();
  if (window.RachaLicense) window.RachaLicense.renderBanner();
  window.scrollTo({ top: keepScroll ? y : 0, behavior: 'instant' });
}

function navigate(page) {
  if (!PAGES[page]) return;
  ui.page = page;
  document.body.classList.remove('menu-open');
  render();
  if (page === 'settings') {
    loadMpStatus();
    if (!dailySummary) fetchDailySummary(true).then(() => render());
  }
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
/* Ações irreversíveis pedem duas confirmações, uma após a outra. */
function confirmActionTwice(message, finalMessage, fn) {
  confirmAction(message, () => confirmAction(finalMessage, fn));
}
/* Excluir racha pode, opcionalmente, apagar os jogos gerados por ele.
   A caixa vem desmarcada: nada é apagado sem decisão explícita. */
function gamesFromSessions(ids) {
  const set = new Set(ids);
  return state.games.filter(g => set.has(g.sessionId));
}
function deleteGamesByIds(ids) {
  const set = new Set(ids);
  if (!set.size) return 0;
  state.games = state.games.filter(g => !set.has(g.id));
  state.dayEntries = state.dayEntries.filter(d => !set.has(d.gameId));
  set.forEach(id => {
    delete state.checkins[id];
    delete state.confirmations[id];
    delete state.arrivals[id];
  });
  if (set.has(ui.drawGame)) ui.drawGame = null;
  return set.size;
}
function confirmSessionDelete(message, ids, fn, finalMessage = '') {
  const jogos = gamesFromSessions(ids);
  const n = jogos.length;
  const option = n ? `<label class="field" style="flex-direction:row;align-items:flex-start;gap:8px;margin-top:10px">
      <input type="checkbox" id="delete-session-games" style="width:16px;margin-top:2px" />
      <span>Apagar também <strong>${n}</strong> jogo(s) gerado(s) por este racha? Isso remove também check-in, diárias, confirmações e ordem de chegada desses jogos.</span>
    </label>` : '<p class="tiny muted mt">Não há jogos gerados por este racha.</p>';
  pendingConfirm = (capturado) => {
    const apagar = typeof capturado === 'boolean' ? capturado : !!$('#delete-session-games')?.checked;
    if (!finalMessage) { fn(apagar); return; }
    confirmAction(`${finalMessage} ${apagar ? 'Os jogos selecionados também serão apagados.' : 'Os jogos já criados serão mantidos.'} Deseja apagar mesmo assim?`, () => fn(apagar));
  };
  openModal('Confirmar ação', '', `<p class="small">${esc(message)}</p>${option}<div class="form-actions"><button class="btn btn-ghost" data-act="close-modal">Cancelar</button><button class="btn btn-danger" data-act="confirm-yes">Confirmar</button></div>`);
}

function modalPlayer(id) {
  const p = id ? playerById(id) : { name: '', type: 'Mensalista', position: '', phone: '', note: '', age: null, height: null, weight: null, strength: null, speed: null, active: true };
  if (!p) return;
  const nv = (v) => (v === null || v === undefined || v === '') ? '' : num(v);
  openModal(id ? 'Editar jogador' : 'Novo jogador', 'Campos marcados são opcionais', `
    <form data-form="player" data-id="${esc(id || '')}" class="form-grid">
      <label class="field" style="grid-column:1/-1">Nome *<input name="name" required value="${esc(p.name)}" placeholder="Nome completo ou apelido" /></label>
      <label class="field">Tipo<select name="type">${PLAYER_TYPES.map(t => `<option ${p.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field">Posição<select name="position">${['Linha', 'Meia', 'Zaga', 'Ataque', 'Goleiro'].map(x => `<option ${p.position === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="field">Telefone / WhatsApp<input name="phone" value="${esc(p.phone || '')}" placeholder="11999999999" /></label>
      <label class="field">Observação<input name="note" value="${esc(p.note || '')}" placeholder="Ex.: capitão,VICE..." /></label>
      <p class="tiny muted" style="grid-column:1/-1;margin:0">Cargos pagam mensalidade como os mensalistas. Presidente e Vice-Presidente: apenas 1 cada. Diretor e Conselheiro: sem limite. Valores atuais — ${BOARD_ROLES.map(r => `${r.type} ${money(playerFee({ type: r.type }))}`).join(' · ')}. Ajuste em Configurações.</p>
      <div class="fieldset-title">Características (usadas no sorteio equilibrado)</div>
      <label class="field">Idade<input name="age" type="number" min="0" max="120" value="${nv(p.age)}" placeholder="Ex.: 30" /></label>
      <label class="field">Altura (cm)<input name="height" type="number" min="0" max="260" value="${nv(p.height)}" placeholder="Ex.: 175" /></label>
      <label class="field">Peso (kg)<input name="weight" type="number" min="0" max="300" value="${nv(p.weight)}" placeholder="Ex.: 75" /></label>
      <label class="field">Força (%)<input name="strength" type="number" min="0" max="100" value="${nv(p.strength)}" placeholder="0 a 100" /></label>
      <label class="field">Velocidade (%)<input name="speed" type="number" min="0" max="100" value="${nv(p.speed)}" placeholder="0 a 100" /></label>
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
      <label class="field">Jogador<select name="playerSelect" disabled>${activePlayers().filter(isMonthlyPlayer).map(x => `<option ${x.id === playerId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <label class="field">Mês<select disabled><option>${shortMonth(month)}/${y}</option></select></label>
      <label class="field">Vencimento<input name="dueDate" type="date" value="${esc(rec?.dueDate || '')}" /></label>
      <label class="field">Valor pago (R$)<input name="amount" type="number" step="0.01" value="${rec ? num(rec.amount) : playerFee(p)}" /></label>
      <label class="field">Data do pagamento<input name="paidAt" type="datetime-local" value="${esc(toDateTimeLocal(rec?.paidAt))}" /></label>
      <label class="field" style="justify-content:flex-end"><span style="display:flex;align-items:center;gap:8px"><input name="paid" type="checkbox" ${!rec || rec.paid !== false ? 'checked' : ''} style="width:16px" /> Pagamento realizado</span></label>
      <p class="tiny muted" style="grid-column:1/-1;margin:0">Vencimento e data do pagamento ficam no registro e aparecem para o jogador. Se pagar agora e deixar a data em branco, o app usa a hora atual. Use o valor que entrou no caixa do racha: a taxa do cartão do Mercado Pago fica entre o jogador e o Mercado Pago.</p>
      <div class="form-actions" style="grid-column:1/-1">
        ${rec ? `<button class="btn btn-danger" type="button" data-act="delete-payment" data-id="${esc(rec.id)}">Remover</button>` : ''}
        ${rec?.paidAt ? `<button class="btn btn-ghost" type="button" data-act="view-receipt" data-id="${esc(rec.id)}">🧾 Comprovante</button>` : ''}
        <button class="btn btn-ghost" data-act="close-modal" type="button">Cancelar</button>
        <button class="btn btn-primary" type="submit">Salvar</button>
      </div>
    </form>`);
}

function modalSession(id) {
  const s = sessionById(id) || { name: '', day: 4, time: '19:00', duration: '1h30', location: '', notes: '', active: true, withGoalkeepers: true, withReferee: true };
  openModal(id ? 'Editar horário da semana' : 'Novo horário da semana', 'Cada horário tem seu dia, horário, duração e local', `
    <form data-form="session" data-id="${esc(id || '')}" class="form-grid one">
      <label class="field">Nome do horário<input name="name" maxlength="60" value="${esc(s.name)}" placeholder="Ex.: Racha de quinta" required /></label>
      <div class="row" style="flex-wrap:wrap">
        <label class="field" style="flex:1;min-width:170px">Dia da semana<select name="day">${WEEKDAYS.map((d, i) => `<option value="${i}" ${num(s.day) === i ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        <label class="field" style="flex:1;min-width:130px">Horário<input name="time" type="time" value="${esc(s.time)}" required /></label>
      </div>
      <label class="field">Duração<input name="duration" value="${esc(s.duration)}" placeholder="Ex.: 1h30 ou 90 min" required /></label>
      <label class="field">Local<input name="location" maxlength="140" value="${esc(s.location)}" placeholder="Ex.: Quadra do clube, centro" /></label>
      <label class="field">Regras ou observações (opcional)<input name="notes" maxlength="240" value="${esc(s.notes || '')}" placeholder="Ex.: 7 jogadores por time, goleiro fixo" /></label>
      <label class="field" style="flex-direction:row;align-items:center;gap:8px"><input name="active" type="checkbox" ${s.active !== false ? 'checked' : ''} style="width:16px" /> Horário ativo (entra na agenda e no Cronômetro)</label>
      <label class="field" style="flex-direction:row;align-items:center;gap:8px"><input name="withGoalkeepers" type="checkbox" ${s.withGoalkeepers !== false ? 'checked' : ''} style="width:16px" /> Neste horário há goleiros pagos (entra na despesa Goleiros)</label>
      <label class="field" style="flex-direction:row;align-items:center;gap:8px"><input name="withReferee" type="checkbox" ${s.withReferee !== false ? 'checked' : ''} style="width:16px" /> Neste horário há arbitragem paga (entra na despesa Arbitragem)</label>
      <div class="form-actions"><button class="btn btn-ghost" type="button" data-act="close-modal">Cancelar</button><button class="btn btn-primary" type="submit">💾 Salvar horário</button></div>
    </form>`);
}

function modalGame() {
  openModal('Novo jogo', 'Informe a data; nome e horário são opcionais', `
    <form data-form="game" class="form-grid one">
      <label class="field">Data<input name="date" type="date" value="${controlDateISO()}" required /></label>
      <label class="field">Racha da semana (opcional)<select name="sessionId"><option value="">— nenhum —</option>${activeSessions().map(s => `<option value="${esc(s.id)}">${esc(s.name)} · ${esc(WEEKDAYS[num(s.day)] || '')} ${esc(s.time)}</option>`).join('')}</select></label>
      <label class="field">Nome do jogo (opcional)<input name="name" maxlength="90" placeholder="Ex.: Racha de sábado" /></label>
      <label class="field">Horário (opcional)<input name="time" type="time" /></label>
      <label class="field">Local (opcional)<input name="location" maxlength="140" placeholder="Ex.: Quadra do clube" /></label>
      <div class="form-actions"><button class="btn btn-ghost" data-act="close-modal" type="button">Cancelar</button><button class="btn btn-primary" type="submit">Criar jogo</button></div>
    </form>`);
}

function modalCheckin(gameId) {
  const g = state.games.find(x => x.id === gameId);
  if (!g) return;
  const entries = state.dayEntries.filter(d => d.gameId === gameId);
  const presentes = gameCheckinIds(g);
  const players = eligibleForGame(g);
  openModal('Check-in · ' + fmtDate(g.date), 'Só elegíveis: mensalista em dia + “Vou jogar”; diarista pago', `
    <form data-form="checkin" data-id="${esc(gameId)}" class="form-grid one">
      <div class="table-wrap" style="max-height:46vh;overflow:auto">
        <table><thead><tr><th>Jogador</th><th>Tipo</th><th class="right">Valor (R$)</th><th class="center">Presente</th></tr></thead><tbody>
          ${players.map(p => {
            const e = entries.find(x => x.playerId === p.id);
            const checked = presentes.length ? presentes.includes(p.id) : (e ? true : p.type === 'Diarista');
            return `<tr><td>${playerCell(p)}</td><td>${badge(p.type, p.type === 'Mensalista' ? 'green' : 'blue')}</td>
              <td class="right"><input type="number" step="0.01" name="amount-${p.id}" value="${e ? num(e.amount) : p.type === 'Diarista' ? num(settings().dayFee) : 0}" style="width:92px;text-align:right" /></td>
              <td class="center"><input type="checkbox" name="present-${p.id}" ${checked ? 'checked' : ''} style="width:17px;height:17px" /></td></tr>`;
          }).join('')}
        </tbody></table>
      </div>
      <div class="form-actions"><button class="btn btn-ghost" data-act="close-modal" type="button">Cancelar</button><button class="btn btn-primary" type="submit">Salvar check-in</button></div>
    </form>`, true);
}

function modalGamePresence(gameId) {
  const g = state.games.find(x => x.id === gameId);
  if (!g) return;
  const confirmados = gameConfirmedPlayers(g);
  const presentes = gameCheckinPlayers(g);
  const entradas = state.dayEntries.filter(d => d.gameId === g.id);
  const elegiveis = eligibleForGame(g);
  const faltam = elegiveis.filter(p => !confirmados.some(c => c.id === p.id));
  const listaConfirmados = confirmados.length
    ? `<div class="row" style="flex-wrap:wrap;gap:6px">${confirmados.map((p, i) => `<span class="badge">${i + 1}º · ${esc(p.name)}</span>`).join('')}</div>`
    : '<p class="small muted">Ninguém foi marcado como confirmado neste jogo no Sorteador.</p>';
  const listaPresentes = presentes.length
    ? `<div class="table-wrap"><table><thead><tr><th>Jogador</th><th>Tipo</th><th class="right">Valor lançado</th></tr></thead><tbody>
        ${presentes.map(p => { const e = entradas.find(x => x.playerId === p.id); return `<tr><td>${playerCell(p)}</td><td>${badge(p.type, p.type === 'Mensalista' ? 'green' : 'blue')}</td><td class="right mono">${e ? money(e.amount) : '—'}</td></tr>`; }).join('')}
      </tbody></table></div>`
    : '<p class="small muted">Nenhum check-in salvo neste jogo.</p>';
  openModal('Presença · ' + fmtDate(g.date), `${g.name || 'Jogo'}${g.time ? ' · ' + esc(g.time) : ''}`, `
    <div class="stack">
      <div class="card"><div class="card-body">
        <strong>Confirmados no Sorteador (${confirmados.length})</strong>
        <p class="tiny muted">Ordem de chegada, quando foi registrada.</p>
        ${listaConfirmados}
      </div></div>
      <div class="card"><div class="card-body">
        <strong>Check-in (${presentes.length})</strong>
        <p class="tiny muted">Jogadores marcados como presentes no check-in deste jogo.</p>
        ${listaPresentes}
      </div></div>
      ${faltam.length ? `<div class="card"><div class="card-body">
        <strong class="small">Ainda não confirmaram (${faltam.length})</strong>
        <p class="tiny muted">${faltam.map(p => esc(p.name)).join(' · ')}</p>
      </div></div>` : ''}
      <div class="form-actions"><button class="btn btn-ghost" type="button" data-act="close-modal">Fechar</button>
        <button class="btn btn-primary" type="button" data-act="checkin" data-id="${esc(g.id)}">✏️ Editar check-in</button></div>
    </div>`, true);
}

function modalDay() {
  openModal('Nova diária', 'Lançamento individual', `
    <form data-form="day" class="form-grid one">
      <label class="field">Data<input name="date" type="date" value="${controlDateISO()}" required /></label>
      <label class="field">Jogador<select name="playerId">${activePlayers().filter(p => p.type === 'Diarista').map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
      <label class="field">Valor (R$)<input name="amount" type="number" step="0.01" value="${num(settings().dayFee)}" /></label>
      <div class="form-actions"><button class="btn btn-ghost" data-act="close-modal" type="button">Cancelar</button><button class="btn btn-primary" type="submit">Salvar</button></div>
    </form>`);
}

function suggestedExpenseAmount(cat) {
  const s = settings();
  if (cat === 'Quadra') return num(s.fieldRent);
  if (cat === 'Goleiros') return num(s.goalkeepers) * num(s.goalkeeperFee) * costGames('withGoalkeepers');
  if (cat === 'Arbitragem') return num(s.refereeFee) * costGames('withReferee');
  return null;
}

function suggestedExpenseDescription(cat) {
  if (cat === 'Quadra') return `Aluguel de ${monthName(currentMonth())}`;
  if (cat === 'Goleiros') return `${num(settings().goalkeepers)} goleiros × ${gamesLabel(costGames('withGoalkeepers'))} jogos`;
  if (cat === 'Arbitragem') return `${gamesLabel(costGames('withReferee'))} jogos × ${money(num(settings().refereeFee))} de arbitragem`;
  return '';
}

function monthlyExpenseDescription(cat, descricao, mes) {
  const nomeMes = monthName(mes);
  if (cat === 'Quadra') {
    return !descricao || /^aluguel de /i.test(descricao) ? `Aluguel de ${nomeMes}` : `${descricao} · ${nomeMes}`;
  }
  if (cat === 'Goleiros') {
    const auto = suggestedExpenseDescription('Goleiros');
    return `${!descricao || descricao === auto ? auto : descricao} · ${nomeMes}`;
  }
  return descricao;
}

function modalExpense(cat) {
  const categorias = visibleExpenseCats();
  const escolhida = categorias.includes(cat) ? cat : (categorias[0] || 'Quadra');
  const valor = suggestedExpenseAmount(escolhida);
  const descricao = suggestedExpenseDescription(escolhida);
  openModal('Nova despesa', 'Valor que sai do caixa · data dentro do ano de controle', `
    <form data-form="expense" class="form-grid one">
      <label class="field">Data<input name="date" type="date" value="${controlDateISO()}" required /></label>
      <label class="field">Categoria<select name="category" data-prev-cat="${esc(escolhida)}">${categorias.map(c => `<option ${c === escolhida ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field">Descrição<input name="description" value="${esc(descricao)}" placeholder="Ex.: arbitragem, fita, premiação" /></label>
      <label class="field">Valor (R$)<input name="amount" type="number" step="0.01" value="${valor != null && valor > 0 ? valor : ''}" required /></label>
      <label class="field">Repetir<select name="repeat">
        <option value="once">Não repetir — só esta data</option>
        <option value="game">Por jogo — valor é por jogo</option>
        <option value="month">Por mês — valor é por mês (janeiro a dezembro)</option>
        <option value="year">Ano todo — valor é o total do ano</option>
      </select></label>
      <p class="tiny muted">“Por jogo” cria um lançamento para cada jogo do ano. “Por mês” cria 12 lançamentos, um em cada mês. “Ano todo” cria um único lançamento com o valor informado.</p>
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
      <button class="btn btn-primary" data-act="save-photo" data-id="${esc(id)}" type="button">Salvar foto</button>
    </div>`);
}

function modalCobranca(playerId) {
  const p = playerById(playerId);
  if (!p) return;
  const m = ui.cobrancaMonth || currentMonth();
  const pendente = state.payments.find(x => x.playerId === playerId && x.month === m && x.paid !== false);
  const y = num(pendente?.year) || year();
  const amount = num(pendente?.amount) || playerFee(p);
  ui.cobrancaPlayer = playerId;
  ui.cobrancaMonth = m;
  const paid = state.payments.some(x => x.playerId === playerId && x.month === m && x.year === y && x.paid !== false);
  const link = paymentLink(playerId, m, amount);
  const code = pixCode(amount, txidFor(playerId, m, y));
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
      ${paid ? '' : `<button class="btn btn-primary" data-act="confirm-payment-modal" data-player="${esc(playerId)}" data-month="${m}" data-amount="${amount}" type="button">✅ Já recebi — dar baixa</button>`}
    </div>`, true);
}

function modalBenefit(id) {
  const b = id ? state.benefits.find(x => x.id === id) : null;
  const d = b || { date: controlDateISO(), playerId: activePlayers()[0]?.id || '', type: 'Camisa/colete', amount: 0, fromCash: true, note: '' };
  openModal(id ? 'Editar benefício' : 'Novo benefício', 'Descontos já refletidos na mensalidade devem marcar "Sai do caixa?" como Não', `
    <form data-form="benefit" data-id="${esc(id || '')}" class="form-grid one">
      <label class="field">Data<input name="date" type="date" value="${esc(d.date)}" required /></label>
      <label class="field">Jogador<select name="playerId">${activePlayers().map(p => `<option value="${p.id}" ${p.id === d.playerId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="field">Tipo<input name="type" value="${esc(d.type || '')}" placeholder="Ex.: camisa, colete, desconto" /></label>
      <label class="field">Valor (R$)<input name="amount" type="number" step="0.01" value="${num(d.amount)}" /></label>
      <label class="field" style="flex-direction:row;align-items:center;gap:8px"><input name="fromCash" type="checkbox" ${d.fromCash ? 'checked' : ''} style="width:16px" /> Sai do caixa (gasto real)</label>
      <label class="field">Observação<input name="note" value="${esc(d.note || '')}" /></label>
      <div class="form-actions"><button class="btn btn-ghost" data-act="close-modal" type="button">Cancelar</button><button class="btn btn-primary" type="submit">Salvar</button></div>
    </form>`);
}

/* ------------------------------------------------------------
   Conciliação com extrato bancário (CSV ou OFX)
   ------------------------------------------------------------ */
function normText(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function parseBankDate(raw) {
  const s = String(raw || '').trim();
  let m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
}

function parseBankAmount(raw) {
  const original = String(raw || '').trim();
  const negative = /^\s*-|^\s*\(/.test(original);
  let s = original.replace(/[^\d,.-]/g, '');
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return negative ? -Math.abs(n) : Math.abs(n);
}

function splitBankLine(line, delim) {
  const out = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if (c === delim && !quoted) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function parseBankStatement(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  if (/<STMTTRN/i.test(raw)) {
    const out = [];
    (raw.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || []).forEach(block => {
      const field = (name) => {
        const m = new RegExp('<' + name + '>([^<]*)', 'i').exec(block);
        return m ? m[1].trim() : '';
      };
      const date = parseBankDate(field('DTPOSTED'));
      const amount = parseBankAmount(field('TRNAMT'));
      if (!date || !amount) return;
      out.push({
        id: field('FITID') || '', date, amount,
        desc: field('MEMO') || field('NAME') || field('TRNTYPE') || 'Lançamento OFX'
      });
    });
    return out;
  }

  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delim = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const head = splitBankLine(lines[0], delim).map(normText);
  const idx = (...names) => head.findIndex(h => names.some(n => h.includes(n)));
  const hasHeader = idx('data', 'date', 'valor', 'amount', 'historico', 'descricao', 'memo') >= 0;
  const iDate = hasHeader ? idx('data', 'date', 'dt') : 0;
  const iDesc = hasHeader ? idx('historico', 'descricao', 'description', 'memo', 'nome', 'name') : 1;
  const iAmount = hasHeader ? idx('valor', 'amount', 'value') : 2;
  if (iDate < 0 || iAmount < 0) return [];
  return lines.slice(hasHeader ? 1 : 0).map(line => {
    const cells = splitBankLine(line, delim);
    const date = parseBankDate(cells[iDate]);
    const amount = parseBankAmount(cells[iAmount]);
    if (!date || !amount) return null;
    return { id: '', date, amount, desc: iDesc >= 0 ? cells[iDesc] : 'Lançamento' };
  }).filter(Boolean);
}

function bankCandidates() {
  const list = [];
  state.payments.forEach(p => list.push({
    type: 'payment', id: p.id, amount: num(p.amount),
    date: isoDate(p.year, p.month, 5),
    label: `${playerName(p.playerId)} · ${monthName(p.month)}/${p.year}`,
    terms: `${playerName(p.playerId)} mensalidade ${monthName(p.month)}`
  }));
  state.dayEntries.forEach(d => list.push({
    type: 'day', id: d.id, amount: num(d.amount), date: d.date,
    label: `${playerName(d.playerId)} · ${fmtDate(d.date)}`,
    terms: `${playerName(d.playerId)} diaria`
  }));
  state.expenses.forEach(e => list.push({
    type: 'expense', id: e.id, amount: num(e.amount), date: e.date,
    label: `${e.description || e.category} · ${fmtDate(e.date)}`,
    terms: `${e.description} ${e.category}`
  }));
  state.benefits.forEach(b => list.push({
    type: 'benefit', id: b.id, amount: num(b.amount), date: b.date,
    label: `${playerName(b.playerId)} · ${fmtDate(b.date)}`,
    terms: `${playerName(b.playerId)} beneficio ${b.type}`
  }));
  return list;
}

function findBankMatch(row) {
  const desc = normText(row.desc);
  let best = null;
  bankCandidates().forEach(c => {
    if (Math.abs(Math.abs(c.amount) - Math.abs(row.amount)) > 0.01) return;
    let score = 5;
    const day = c.date ? Math.abs(Date.parse(c.date) - Date.parse(row.date)) / 86400000 : 99;
    if (Number.isFinite(day) && day <= 7) score += 4;
    else if (c.type === 'payment' && c.label.includes(String(row.date).slice(0, 7))) score += 3;
    const terms = normText(c.terms).split(/\s+/).filter(t => t.length >= 3);
    if (terms.some(t => desc.includes(t))) score += 4;
    if (!best || score > best.score) best = { ...c, score };
  });
  return best && best.score >= 9 ? best : null;
}

function renderBankRows() {
  if (!ui.bankRows.length) return '<p class="tiny muted">Nenhum lançamento para revisar.</p>';
  return ui.bankRows.map((row, i) => `
    <div class="card card-pad" style="margin-bottom:8px">
      <div class="row" style="justify-content:space-between;gap:8px">
        <span><strong>${esc(row.desc || 'Lançamento')}</strong><br><span class="tiny muted">${fmtDate(row.date)}${row.id ? ' · ' + esc(row.id) : ''}</span></span>
        <span class="mono ${row.amount < 0 ? 'negative' : 'positive'}">${money(Math.abs(row.amount))}</span>
      </div>
      <div class="tiny mt">${row.match ? `Sugestão: <strong>${esc(row.match.label)}</strong> (${esc(row.match.type)})` : '<span class="muted">Sem sugestão automática.</span>'}</div>
      <div class="row mt" style="gap:6px;flex-wrap:wrap">
        ${row.match ? `<button class="btn btn-sm btn-primary" data-act="bank-confirm" data-i="${i}">Conciliar</button>` : ''}
        <button class="btn btn-sm btn-ghost" data-act="bank-import" data-i="${i}">Importar como despesa</button>
        <button class="btn btn-sm btn-ghost" data-act="bank-ignore" data-i="${i}">Ignorar</button>
      </div>
    </div>`).join('');
}

function modalReconcile() {
  openModal('Conciliar extrato', 'CSV ou OFX: valores e datas são comparados com os lançamentos do app', `
    <div class="stack">
      <label class="field">Arquivo do banco<input type="file" id="bank-file" accept=".csv,.ofx,.txt,.qfx" /></label>
      <label class="field">Ou cole o conteúdo<textarea id="bank-text" rows="8" placeholder="Data;Histórico;Valor&#10;21/11/2026;CHURRASCO;-720,00">${esc(ui.bankText || '')}</textarea></label>
      <div class="row"><button class="btn btn-primary" type="button" data-act="parse-bank">🔎 Analisar extrato</button></div>
      <div id="bank-results">${renderBankRows()}</div>
    </div>`);
}

function bankRegister(row, status, ref) {
  state.bank.push({
    id: row.id || uid(), date: row.date, amount: row.amount,
    desc: row.desc || '', status, refType: ref?.type || '', refId: ref?.id || '', at: new Date().toISOString()
  });
}

function modalImportCSV() {
  openModal('Importar CSV', 'Exporte a aba do Excel como CSV e cole o conteúdo abaixo', `
    <form data-form="csv" class="form-grid one">
      <label class="field">Tipo de dados
        <select name="entity">
          <option value="players">Jogadores (Nome; Tipo; Posição; Telefone; Observação; Idade; Altura; Peso; Força; Velocidade)</option>
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
  const thisYear = state.scores.filter(s => s.playerId === id && s.year === year());
  const presenceByMonth = MONTHS.map((_, i) => num(thisYear.find(s => s.month === i + 1)?.presence));
  const payByMonth = MONTHS.map((_, i) => state.payments.find(x => x.playerId === id && x.year === year() && x.month === i + 1));
  const quarters = [1, 2, 3, 4].map(q => rankingFor(q).find(r => r.playerId === id)?.pos || '—');
  const info = (label, value) => `<div class="card kpi"><div class="label">${label}</div><div class="value" style="font-size:19px">${value}</div></div>`;
  return openModal(p.name, `${p.type} · ${p.position || 'sem posição'}`, `
    <div class="center">${avatarHTML(p, false).replace('class="avatar', 'class="avatar big')}</div>
    <div class="grid grid-4 mt">
      <div class="card kpi"><div class="label">Pontos</div><div class="value">${pts}</div></div>
      <div class="card kpi blue"><div class="label">Gols</div><div class="value">${sum(scores, s => s.goals)}</div></div>
      <div class="card kpi amber"><div class="label">Assist.</div><div class="value">${sum(scores, s => s.assists)}</div></div>
      <div class="card kpi"><div class="label">Posição</div><div class="value">${rank ? '#' + rank.pos : '—'}</div></div>
    </div>
    <div class="grid grid-4 mt">
      ${info('Defesas difíceis', sum(scores, s => s.defesas))}
      ${info('Paredões', sum(scores, s => s.paredoes))}
      ${info('Gols sofridos', sum(scores, s => s.golsSofridos))}
      ${info('Desarmes', sum(scores, s => s.desarmes))}
    </div>
    <div class="grid grid-4 mt">
      ${info('Idade', p.age == null ? '—' : num(p.age) + ' anos')}
      ${info('Altura', p.height == null ? '—' : num(p.height) + ' cm')}
      ${info('Peso', p.weight == null ? '—' : num(p.weight) + ' kg')}
      ${info('Nota geral', playerRating(p))}
    </div>
    <div class="grid grid-2 mt">
      <div class="card card-pad"><div class="label tiny muted">CARACTERÍSTICAS</div>
        <div class="mt" style="display:flex;flex-direction:column;gap:10px">
          ${meterRow('Força', p.strength)}
          ${meterRow('Velocidade', p.speed)}
        </div>
      </div>
      <div class="card card-pad"><div class="label tiny muted">CONTATO</div><strong>${esc(p.phone || '—')}</strong><div class="tiny muted mt">${esc(p.note || 'Sem observações')}</div></div>
    </div>
    <div class="grid grid-2 mt">
      <div class="card card-pad"><div class="label tiny muted">PRESENÇA POR MÊS · ${year()}</div>
        <div class="row mt" style="gap:4px;align-items:flex-end;height:64px">
          ${presenceByMonth.map((n, i) => `<div style="flex:1;text-align:center"><div style="height:${Math.max(3, n * 9)}px;background:${colors.accent};border-radius:4px 4px 0 0" title="${n} presenças"></div><span class="tiny muted">${i + 1}</span></div>`).join('')}
        </div>
      </div>
      <div class="card card-pad"><div class="label tiny muted">MENSALIDADES · ${year()}</div>
        <div class="row mt" style="gap:4px;flex-wrap:wrap">
          ${payByMonth.map((pay, i) => `<span class="badge ${pay && pay.paid !== false ? 'green' : 'red'}" title="${shortMonth(i + 1)}">${i + 1}</span>`).join('')}
        </div>
        <div class="tiny muted mt">${payByMonth.filter(x => x && x.paid !== false).length}/12 pagas · ${money(sum(payByMonth.filter(x => x && x.paid !== false), x => x.amount))}</div>
      </div>
    </div>
    <div class="grid grid-4 mt">
      ${quarters.map((pos, i) => info(`Trimestre ${i + 1}`, pos === '—' ? '—' : '#' + pos)).join('')}
    </div>
    <div class="grid grid-2 mt">
      <div class="card card-pad"><div class="label tiny muted">FINANCEIRO</div><strong>${paid.length} mensalidades pagas</strong><div class="tiny muted mt">${money(sum(paid, x => x.amount))} pagos · ${days.length} diárias · ${money(sum(days, d => d.amount))}</div></div>
      <div class="card card-pad"><div class="label tiny muted">NOTA GERAL</div><strong>${playerRating(p)}</strong><div class="tiny muted mt">média de força e velocidade · ${p.position || 'sem posição'}</div></div>
    </div>
    <div class="form-actions"><button class="btn btn-ghost" data-act="close-modal">Fechar</button><button class="btn btn-ghost" type="button" data-act="copy-player-link" data-id="${esc(id)}">🔗 Copiar link</button><button class="btn btn-primary" type="button" data-act="send-player-link" data-id="${esc(id)}">📤 Enviar no WhatsApp</button><button class="btn btn-ghost" data-act="edit-player" data-id="${esc(id)}">Editar jogador</button></div>`);
}

/* ------------------------------------------------------------
   Ações
   ------------------------------------------------------------ */
function cobrar(playerId) {
  const p = playerById(playerId);
  if (!p?.phone) { toast('Este jogador não tem telefone cadastrado.', 'err'); return; }
  const m = currentMonth(), amount = playerFee(p);
  const link = paymentLink(p.id, m, amount);
  const msg = `Olá ${p.name.split(' ')[0]}! Falta a mensalidade de ${monthName(m)}/${year()} do Racha do Loló (${money(amount)}). Pode pagar? ⚽\n\nLink: ${link}`;
  window.open(waDirect(p.phone, msg), '_blank', 'noopener');
}

function upsertScore(playerId, key, value) {
  const m = currentMonth(), y = year();
  let sc = state.scores.find(s => s.playerId === playerId && s.month === m && s.year === y);
  if (!sc) {
    sc = { id: uid(), playerId, month: m, year: y, goals: 0, assists: 0, presence: 0, desarmes: 0, defesas: 0, paredoes: 0, golsSofridos: 0, fairPlay: 0, punctual: 0, farrapou: 0, atrasado: 0, cards: 0 };
    state.scores.push(sc);
  }
  sc[key] = num(value);
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
    ...visibleCashRows().map(c => r.exp.byCat[c]), r.exp.total, r.balance, r.acc,
    r.reserveTarget, r.reservePaid, r.reserveDiff, r.metaTarget, r.metaDiff
  ])].map(line).join('\r\n');
  download(`caixa-${year()}.csv`, '\ufeff' + out, 'text/csv;charset=utf-8');
  toast('Caixa exportado em CSV.');
}
function exportPlayersCSV() {
  const head = ['Nome', 'Tipo', 'Posição', 'Telefone', 'Observação', 'Idade', 'Altura', 'Peso', 'Força', 'Velocidade'];
  const line = (cells) => cells.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';');
  const out = [head, ...activePlayers().map(p => [p.name, p.type, p.position, p.phone, p.note, p.age ?? '', p.height ?? '', p.weight ?? '', p.strength ?? '', p.speed ?? ''])].map(line).join('\r\n');
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
  let cargosIgnorados = 0;
  if (entity === 'players') {
    rows.forEach(r => {
      const name = r['nome'] || r['jogador'];
      if (!name) return;
      const type = parsePlayerType(r['tipo']);
      if (roleLimitError(type, '')) { cargosIgnorados++; return; }
      state.players.push({ id: uid(), name, type, position: r['posicao'] || 'Linha', phone: r['telefone'] || r['contato'] || '', note: r['observacao'] || '', active: true, age: num(r['idade']) || null, height: num(r['altura']) || null, weight: num(r['peso']) || null, strength: num(r['forca']) || null, speed: num(r['velocidade']) || null });
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
  if (cargosIgnorados) toast(`${n} registros importados. ${cargosIgnorados} cargo(s) ignorado(s): só 1 Presidente e 1 Vice-Presidente.`, 'err');
  else toast(n ? `${n} registros importados.` : 'Nenhum registro válido encontrado.', n ? 'ok' : 'err');
}

/* ------------------------------------------------------------
   Eventos
   ------------------------------------------------------------ */
document.addEventListener('click', (e) => {
  const root = $('#modal-root');
  if (e.target === root) { closeModal(); return; }
  const el = e.target.closest('[data-act]');
  if (document.body.classList.contains('menu-open') && !e.target.closest('.sidebar') && !e.target.closest('[data-act="toggle-sidebar"]')) {
    document.body.classList.remove('menu-open');
  }
  if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;

  if (WRITE_ACTS.has(act) && licenseLocked()) { warnLocked(); return; }

  switch (act) {
    case 'toggle-sidebar': document.body.classList.toggle('menu-open'); break;
    case 'nav': document.body.classList.remove('menu-open'); navigate(el.dataset.page); break;
    case 'comunidade-retry': carregarComunidade(); break;
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
    case 'create-view-link':
      publishView(false).then((r) => { if (r.ok) render(); });
      break;
    case 'copy-view-link':
      copyText($('#view-link')?.value || viewUrl()).then((ok) => toast(ok ? 'Link copiado!' : 'Não foi possível copiar.', ok ? 'ok' : 'err'));
      break;
    case 'open-view-link':
      window.open(viewUrl(), '_blank', 'noopener');
      break;
    case 'open-live-link':
      if (viewToken) window.open(liveUrl(), '_blank', 'noopener');
      break;
    case 'refresh-view-link':
      toast('Atualizando link…');
      publishView(false);
      break;
    case 'save-view-expiry': {
      const date = $('#view-expiry')?.value || '';
      state.settings.viewExpiresAt = date ? `${date}T23:59:59` : '';
      save('alterou validade do link', date || 'sem expiração');
      toast('Validade salva. Atualizando link…');
      publishView(false).then(() => render());
      break;
    }
    case 'revoke-view':
      confirmAction('Revogar o link do grupo? O link antigo deixará de funcionar imediatamente e será necessário criar um novo.', () => revokeView());
      break;
    case 'install-app':
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => { deferredPrompt = null; });
      } else {
        toast('Abra o app via HTTPS ou localhost e use “Adicionar à tela inicial” no navegador.', 'err');
      }
      break;
    case 'close-modal': closeModal(); break;
    case 'confirm-yes': {
      const fn = pendingConfirm;
      const apagarJogos = !!$('#delete-session-games')?.checked;
      closeModal();
      if (fn) fn(apagarJogos);
      break;
    }

    case 'open-subscription': navigate('subscription'); break;
    case 'subscribe': modalSubscribe(el.dataset.plan); break;
    case 'upgrade': modalUpgrade(el.dataset.plan); break;
    case 'copy-license':
      copyText(window.RachaLicense.key || '').then(ok => toast(ok ? 'Chave copiada!' : 'Não foi possível copiar.', ok ? 'ok' : 'err'));
      break;
    case 'refresh-license':
      toast('Verificando licença...');
      window.RachaLicense.refresh().then((data) => {
        toast(data ? (data.valid ? 'Assinatura confirmada!' : 'Assinatura ainda não confirmada.') : 'Sem conexão. Tente novamente em instantes.', data && data.valid ? 'ok' : 'err');
        render();
      });
      break;
    case 'cancel-license':
      confirmAction('Cancelar a renovação da assinatura? Você continua com acesso até o fim do período já pago.', async () => {
        toast('Cancelando...');
        const result = await window.RachaLicense.cancel();
        toast(result.ok ? (result.message || 'Assinatura cancelada.') : (result.error || 'Não foi possível cancelar.'), result.ok ? 'ok' : 'err');
        render();
      });
      break;

    case 'open-modal': {
      const m = el.dataset.modal;
      if (licenseLocked() && !['settings', 'subscription'].includes(m)) { warnLocked(); break; }
      if (m === 'player') modalPlayer();
      else if (m === 'game') modalGame();
      else if (m === 'day') modalDay();
      else if (m === 'expense') modalExpense();
      else if (m === 'benefit') modalBenefit();
      else if (m === 'quick-add') modalQuickAdd();
      else if (m === 'settings') navigate('settings');
      else if (m === 'payment') {
        const first = activePlayers().find(isMonthlyPlayer);
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
        const first = activePlayers().find(isMonthlyPlayer);
        if (first) modalPayment(first.id, currentMonth()); else toast('Cadastre um mensalista primeiro.', 'err');
      }
      break;
    }

    case 'edit-player': modalPlayer(id); break;
    case 'delete-player': {
      const p = playerById(id);
      confirmAction(`Excluir ${p?.name || 'este jogador'} e todos os lançamentos relacionados?`, () => {
        const name = p?.name || 'este jogador';
        ['payments', 'dayEntries', 'benefits', 'scores'].forEach(k => state[k] = state[k].filter(x => x.playerId !== id));
        state.players = state.players.filter(x => x.id !== id);
        photoDel(id);
        save('excluiu jogador', name); render(); toast('Jogador excluído.');
      });
      break;
    }
    case 'profile': modalProfile(id); break;
    case 'photo': modalPhoto(id); break;
    case 'cobranca': ui.cobrancaMonth = currentMonth(); modalCobranca(id); break;

    case 'save-photo': {
      const p = playerById(id);
      if (!p) break;
      if (pendingPhoto) {
        p.photo = pendingPhoto;
        storePhoto(p.id, pendingPhoto).then((ok) => {
          if (!ok) {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
            toast('Foto mantida no navegador (armazenamento ampliado indisponível).', 'err');
          }
        });
      }
      save('atualizou foto', p.name); closeModal(); render(); toast('Foto salva.');
      break;
    }
    case 'remove-photo': {
      const p = playerById(id);
      if (p) { delete p.photo; photoDel(p.id); save('removeu foto', p.name); }
      pendingPhoto = null; closeModal(); render(); toast('Foto removida.');
      break;
    }
    case 'remove-logo': {
      delete state.settings.rachaLogo;
      photoDel(RACHA_LOGO_ID);
      save('removeu logo do racha'); render(); toast('Logo removida.');
      break;
    }
    case 'copy-link': copyText($('#pay-link')?.value || '').then(ok => toast(ok ? 'Link copiado!' : 'Não foi possível copiar.', ok ? 'ok' : 'err')); break;
    case 'copy-pix': copyText($('#pix-code')?.value || '').then(ok => toast(ok ? 'Código PIX copiado!' : 'Não foi possível copiar.', ok ? 'ok' : 'err')); break;
    case 'copy-donation-app': copyText($('#donate-code')?.value || '').then(ok => toast(ok ? 'Código PIX de doação copiado!' : 'Não foi possível copiar.', ok ? 'ok' : 'err')); break;
    case 'copy-dev-donation': copyText($('#dev-donate-code')?.value || '').then(ok => toast(ok ? 'PIX do desenvolvedor copiado!' : 'Não foi possível copiar.', ok ? 'ok' : 'err')); break;
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
      state.payments = state.payments.filter(x => !(x.playerId === pp.playerId && x.month === pp.month && x.year === num(pp.year)));
      const rec = ensureReceipt({ id: uid(), playerId: pp.playerId, month: pp.month, year: num(pp.year), amount: num(pp.amount), paid: true, txid: $('#txid-input')?.value || '', paidAt: new Date().toISOString(), origem: 'link' });
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
      const m = num(ui.payMonth) || currentMonth(), y = year();
      activePlayers().filter(isMonthlyPlayer).forEach(p => {
        if (!state.payments.some(x => x.playerId === p.id && x.month === m && x.year === y)) {
          state.payments.push({ id: uid(), playerId: p.id, month: m, year: y, amount: playerFee(p), paid: true, paidAt: new Date().toISOString(), dueDate: '' });
        }
      });
      save(); render(); toast(`Mensalidades de ${shortMonth(m)} marcadas.`);
      break;
    }
    case 'clear-month': {
      const m = num(ui.payMonth) || currentMonth(), y = year();
      confirmAction(`Remover todos os pagamentos de ${monthName(m)}/${y}?`, () => {
        state.payments = state.payments.filter(x => !(x.month === m && x.year === y));
        save(); render(); toast('Mês limpo.');
      });
      break;
    }
    case 'cobrar': cobrar(id); break;

    case 'game-tab': ui.gameTab = el.dataset.tab; render(); break;
    case 'checkin': modalCheckin(id); break;
    case 'game-presence': modalGamePresence(id); break;
    case 'game-cancel': toggleGameCancel(id); break;
    case 'delete-game': confirmAction('Excluir este jogo e todas as diárias associadas?', () => {
      state.dayEntries = state.dayEntries.filter(d => d.gameId !== id);
      delete state.checkins[id];
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
    case 'session-new': modalSession(''); break;
    case 'session-edit': modalSession(id); break;
    case 'session-select-all': $$('.session-check').forEach(c => { c.checked = !!el.checked; }); break;
    case 'session-delete': {
      const sess = sessionById(id), ids = [id];
      confirmSessionDelete(`Excluir o racha "${sess?.name || id}" da semana?`, ids, (apagar) => {
        const removidos = apagar ? deleteGamesByIds(gamesFromSessions(ids).map(g => g.id)) : 0;
        state.settings.sessions = sessionsList().filter(s => !ids.includes(s.id));
        if (ids.includes(state.timer.sessionId)) state.timer.sessionId = '';
        syncFixedExpenses();
        save('excluiu racha da semana', `${sess?.name || id}${apagar ? ` · ${removidos} jogo(s)` : ''}`);
        render(); toast(apagar ? `Racha excluído e ${removidos} jogo(s) apagado(s).` : 'Racha excluído. Os jogos já criados foram mantidos.');
      });
      break;
    }
    case 'session-clear-selected': {
      const ids = $$('.session-check:checked').map(c => c.value);
      if (!ids.length) { toast('Selecione pelo menos um racha.', 'err'); break; }
      confirmSessionDelete(`Excluir ${ids.length} racha(s) selecionado(s)?`, ids, (apagar) => {
        const removidos = apagar ? deleteGamesByIds(gamesFromSessions(ids).map(g => g.id)) : 0;
        state.settings.sessions = sessionsList().filter(s => !ids.includes(s.id));
        if (ids.includes(state.timer.sessionId)) state.timer.sessionId = '';
        syncFixedExpenses();
        save('excluiu rachas selecionados', `${ids.length} racha(s)${apagar ? ` · ${removidos} jogo(s)` : ''}`);
        render(); toast(apagar ? `${ids.length} racha(s) e ${removidos} jogo(s) apagado(s).` : `${ids.length} racha(s) excluído(s). Os jogos foram mantidos.`);
      });
      break;
    }
    case 'session-clear-all': {
      const ids = sessionsList().map(s => s.id);
      if (!ids.length) { toast('Não há rachas para apagar.', 'err'); break; }
      confirmSessionDelete(`Apagar todos os ${ids.length} rachas da semana?`, ids, (apagar) => {
        const removidos = apagar ? deleteGamesByIds(gamesFromSessions(ids).map(g => g.id)) : 0;
        state.settings.sessions = [];
        state.timer.sessionId = '';
        syncFixedExpenses();
        save('excluiu todos os rachas da semana', `${ids.length} racha(s)${apagar ? ` · ${removidos} jogo(s)` : ''}`);
        render(); toast(apagar ? `Todos os rachas e ${removidos} jogo(s) foram apagados.` : 'Todos os rachas foram apagados. Os jogos foram mantidos.');
      }, 'Isso não pode ser desfeito.');
      break;
    }
    case 'generate-sessions': {
      const m = num($('#gen-month')?.value || currentMonth()), y = year();
      const created = generateSessionGames([m]);
      save('gerou jogos dos rachas da semana', `${created} jogo(s) · ${m}/${y}`);
      render(); toast(created ? `${created} jogos criados a partir dos rachas da semana.` : 'Já existem jogos para todos os rachas deste mês.');
      break;
    }
    case 'generate-sessions-year': {
      const y = year(), created = generateSessionGames(Array.from({ length: 12 }, (_, i) => i + 1));
      save('gerou jogos do ano dos rachas da semana', `${created} jogo(s) · ${y}`);
      render(); toast(created ? `${created} jogos criados para o ano de ${y}.` : `Os jogos de ${y} já estavam na agenda.`);
      break;
    }
    case 'delete-day': confirmAction('Excluir esta diária?', () => {
      state.dayEntries = state.dayEntries.filter(d => d.id !== id);
      save(); render(); toast('Diária excluída.');
    }); break;

    case 'remove-arrival': {
      const key = drawGameKey();
      setArrivalList(key, arrivalList(key).filter(x => x.id !== id));
      save('removeu da chamada', `${playerName(id)} · ${key}`); render();
      break;
    }
    case 'undo-arrival': {
      const key = drawGameKey();
      const list = arrivalList(key).slice(0, -1);
      setArrivalList(key, list);
      save('desfez última chegada', key); render();
      break;
    }
    case 'clear-arrivals': {
      const key = drawGameKey();
      setArrivalList(key, []);
      save('limpou chamada', key); render(); toast('Chamada limpa.');
      break;
    }
    case 'move-arrival': {
      const key = drawGameKey();
      const list = arrivalList(key);
      const at = list.findIndex(x => x.id === id);
      const to = at + num(el.dataset.dir);
      if (at < 0 || to < 0 || to >= list.length) break;
      [list[at], list[to]] = [list[to], list[at]];
      setArrivalList(key, list);
      save('ajustou ordem de chegada', `${playerName(id)} · ${key}`); render();
      break;
    }
    case 'toggle-confirm': {
      const key = drawGameKey();
      const set = new Set(confirmedIds(key));
      const list = arrivalList(key).filter(x => x && x.id);
      const at = list.findIndex(x => x.id === id);
      let msg;
      if (!set.has(id)) {
        const game = state.games.find(x => x.id === key) || { id: '__manual__', month: currentMonth(), year: year() };
        if (!eligibleForGame(game).some(p => p.id === id)) {
          toast('Este jogador não está elegível: mensalista deve estar em dia e ter dito “Vou jogar”; diarista precisa ter pago.', 'err');
          break;
        }
        set.add(id);
        if (at < 0) list.push({ id, at: new Date().toISOString() });
        msg = 'confirmou presença';
      } else if (at < 0) {
        list.push({ id, at: new Date().toISOString() });
        msg = 'registrou chegada';
      } else {
        set.delete(id);
        list.splice(at, 1);
        msg = 'desconfirmou presença';
      }
      state.confirmations[key] = [...set];
      setArrivalList(key, list);
      save(msg, `${playerName(id)} · ${key}`);
      render();
      break;
    }
    case 'confirm-all': {
      const key = drawGameKey();
      const game = state.games.find(x => x.id === key) || { id: '__manual__', month: currentMonth(), year: year() };
      const all = eligibleForGame(game);
      state.confirmations[key] = all.map(p => p.id);
      setArrivalList(key, sortByArrival(all, key).map(p => ({ id: p.id, at: new Date().toISOString() })));
      save('confirmou elegíveis', key); render(); toast('Jogadores elegíveis confirmados, na ordem de chegada atual.');
      break;
    }
    case 'confirm-none': {
      const key = drawGameKey();
      state.confirmations[key] = [];
      setArrivalList(key, []);
      save('limpou confirmados', key); render(); toast('Lista de confirmados e chamada limpas.');
      break;
    }
    case 'do-draw': doDraw(); break;
    case 'refresh-view-data':
      fetchViewData(false).then(() => render(true));
      break;
    case 'apply-group-confirmations': {
      const key = el.dataset.game || drawGameKey();
      const resp = (viewData?.responses || {})[key] || {};
      const wait = (viewData?.waitlist || {})[key] || [];
      const game = state.games.find(x => x.id === key) || { id: '__manual__', month: currentMonth(), year: year() };
      const allowed = new Set(eligibleForGame(game).map(p => p.id));
      const set = new Set(confirmedIds(key).filter(id => allowed.has(id)));
      Object.keys(resp).forEach(id => { if (allowed.has(id) && resp[id] === 'yes') set.add(id); else set.delete(id); });
      wait.forEach(id => set.delete(id));
      const lista = sortByArrival(activePlayers().filter(p => set.has(p.id)), key)
        .map(p => ({ id: p.id, at: new Date().toISOString() }));
      state.confirmations[key] = [...set];
      setArrivalList(key, lista);
      save('aplicou confirmações do grupo', key); render(true); toast('Confirmações do grupo aplicadas!');
      break;
    }
    case 'edit-last-draw': openDrawEditor(state.drawHistory[0]); break;
    case 'timer-start': startTimerMatch(num(el.dataset.no)); break;
    case 'timer-pause': pauseTimerMatch(); break;
    case 'timer-resume': resumeTimerMatch(); break;
    case 'timer-finish': modalFinishMatch(); break;
    case 'timer-add-goal': {
      const box = $('#timer-goals');
      if (box) box.insertAdjacentHTML('beforeend', `<div class="row goal-row" style="flex-wrap:wrap">
        <label class="field" style="flex:2;min-width:150px">Jogador<select name="goalPlayer">${activePlayers().map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>
        <label class="field" style="flex:1;min-width:90px">Time<select name="goalTeam"><option value="A">A</option><option value="B">B</option></select></label>
        <label class="field" style="flex:1;min-width:80px">Minuto<input name="goalMinute" type="number" min="1" max="120" placeholder="Ex.: 12" /></label>
        <button class="btn btn-sm btn-ghost" type="button" data-act="timer-remove-goal" title="Remover gol">✕</button>
      </div>`);
      break;
    }
    case 'timer-remove-goal': el.closest('.goal-row')?.remove(); break;
    case 'timer-delete': confirmAction('Excluir esta partida do histórico?', () => {
      state.timer.history = (state.timer.history || []).filter(h => h.id !== id);
      save('excluiu partida do cronômetro', id); render(); toast('Partida excluída do histórico.');
    }); break;
    case 'timer-clear-history': confirmActionTwice('Apagar todo o histórico de partidas das últimas 24h?', 'Isso não pode ser desfeito. Deseja apagar mesmo assim?', () => {
      const n = (state.timer.history || []).length;
      state.timer.history = [];
      save('limpou histórico do cronômetro', `${n} partida(s)`); render(); toast('Histórico apagado.');
    }); break;
    case 'move-draw-player': moveDrawPlayer(el.dataset.player, num(el.dataset.from)); break;
    case 'pick-draw-team': pickDrawTeam(el.dataset.player, num(el.dataset.from), num(el.dataset.to)); break;
    case 'save-last-draw': saveDrawEditor(); break;
    case 'cancel-last-draw': cancelDrawEditor(); break;
    case 'save-manual-draw': {
      const key = drawGameKey();
      const players = confirmedIds(key).map(playerById).filter(Boolean);
      const buckets = {};
      $$('[data-manual-player]').forEach(sel => {
        const t = num(sel.value);
        (buckets[t] || (buckets[t] = [])).push(sel.dataset.manualPlayer);
      });
      const teams = Object.keys(buckets).sort((a, b) => num(a) - num(b)).map(k => buckets[k]);
      if (teams.length < 2 || players.some(p => !teams.some(t => t.includes(p.id)))) { toast('Distribua todos os jogadores em pelo menos 2 equipes.', 'err'); break; }
      const teamSigs = teams.map(t => t.slice().sort().join('+'));
      state.drawHistory.unshift({ id: uid(), createdAt: new Date().toISOString(), gameKey: key, gameLabel: drawGameLabel(key), mode: 'manual', teamSize: teams[0].length, teams, teamSigs });
      if (state.drawHistory.length > 60) state.drawHistory.length = 60;
      save('salvou equipes manuais', drawGameLabel(key)); render(true); toast('Equipes manuais salvas!');
      break;
    }
    case 'share-whatsapp': shareWhatsApp(el.dataset.kind); break;
    case 'copy-whatsapp': copyWhatsApp(el.dataset.kind); break;
    case 'copy-player-link': {
      const url = playerLinks[id] || '';
      if (!url) { toast('Link do jogador ainda não foi gerado. Crie o link do grupo em Configurações.', 'err'); break; }
      copyText(url).then(ok => toast(ok ? 'Link do jogador copiado!' : 'Não foi possível copiar. Use o botão no navegador do Windows.', ok ? 'ok' : 'err'));
      break;
    }
    case 'send-player-link': {
      const url = playerLinks[id] || '';
      if (!url) { toast('Link do jogador ainda não foi gerado. Crie o link do grupo em Configurações.', 'err'); break; }
      const p = playerById(id);
      const first = String(p?.name || 'jogador').split(' ')[0];
      const msg = `Olá ${first}! Aqui está seu link pessoal do Racha do Loló ⚽\n\n${url}\n\nUse-o para confirmar presença, ver suas mensalidades e acompanhar o racha. Guarde o link: ele é o seu acesso e não deve ser compartilhado.`;
      const direct = !!waNumber(p?.phone);
      window.open(waDirect(p?.phone, msg), '_blank', 'noopener');
      toast(direct ? `WhatsApp aberto para ${first}!` : 'Sem telefone cadastrado: escolha o contato no WhatsApp.', direct ? 'ok' : 'err');
      break;
    }
    case 'refresh-daily-summary':
      fetchDailySummary(false).then(() => render());
      break;
    case 'connect-mp':
      startMpConnect();
      break;
    case 'ack-notices': ackPaymentNotices(); break;
    case 'manual-confirm': {
      const pid = $('#manual-player')?.value || '';
      const gameId = $('#manual-game')?.value || '';
      const presence = !!$('#manual-presence')?.checked;
      const payment = !!$('#manual-payment')?.checked;
      const isDaily = String(playerById(pid)?.type || '').toLowerCase() === 'diarista';
      if (!pid || (!presence && !payment)) {
        toast('Escolha o jogador e marque ao menos uma opção.', 'err');
        break;
      }
      if ((presence || (payment && isDaily)) && !gameId) {
        toast('Escolha o jogo para esta confirmação.', 'err');
        break;
      }
      const parts = [];
      if (presence) parts.push('presença');
      if (payment) parts.push(isDaily ? 'diária' : 'mensalidade');
      confirmAction(`Confirmar ${parts.join(' e ')} de ${playerName(pid) || 'jogador'} manualmente, sem PIX?`,
        () => applyManualConfirm(pid, gameId, presence, payment));
      break;
    }
    case 'cancel-daily-credit':
    case 'cancel-daily-refund': {
      const gameId = $('#daily-cancel-game')?.value || '';
      if (!gameId) { toast('Escolha o jogo.', 'err'); break; }
      const credit = el.dataset.act === 'cancel-daily-credit';
      const msg = credit
        ? 'Cancelar este jogo e transformar as diárias pagas em crédito para a próxima diária dos mesmos jogadores?'
        : 'Cancelar este jogo e registrar o estorno das diárias pagas (devolução combinada com o jogador, fora do app)?';
      confirmAction(msg, () => cancelDailyPaidGame(gameId, credit ? 'credit' : 'refund'));
      break;
    }
    case 'show-reminders': modalReminders(); break;
    case 'reset-reminders': {
      const d = defaultSettings();
      state.settings.reminderGroup = d.reminderGroup;
      state.settings.reminderPlayer = d.reminderPlayer;
      state.settings.reminderDueGroup = d.reminderDueGroup;
      state.settings.reminderDuePlayer = d.reminderDuePlayer;
      save('restaurou frases dos lembretes'); render(); toast('Frases padrão restauradas e publicadas.', 'ok');
      break;
    }
    case 'reset-group-message':
      state.settings.groupAccessMessage = GROUP_ACCESS_MESSAGE;
      save('restaurou mensagem do grupo'); render(); toast('Mensagem do grupo restaurada.', 'ok');
      break;
    case 'live-start': runLiveAction('start'); break;
    case 'live-goal': runLiveAction('goal'); break;
    case 'live-assist': runLiveAction('assist'); break;
    case 'live-card': runLiveAction('card'); break;
    case 'live-undo': runLiveAction('undo'); break;
    case 'live-stop': runLiveAction('stop'); break;
    case 'clear-draw-history': confirmAction('Apagar todo o histórico de sorteios?', () => {
      state.drawHistory = [];
      save(); render(); toast('Histórico de sorteios apagado.');
    }); break;

    case 'add-goal': {
      const name = String($('#goal-name')?.value || '').trim();
      const amount = num($('#goal-amount')?.value);
      const mode = $('#goal-mode')?.value || 'monthly';
      if (!name || amount <= 0) { toast('Informe o nome e um valor maior que zero.', 'err'); break; }
      state.goals.push({
        id: uid(), name, amount,
        mode: mode === 'annual' ? 'annual' : 'monthly',
        month: mode === 'monthly-month' ? num($('#goal-month')?.value) || null : null,
        year: mode === 'annual' ? num($('#goal-year')?.value) || year() : null,
        progress: 0
      });
      save('cadastrou meta', name); render(); toast('Meta adicionada.');
      break;
    }
    case 'delete-goal': confirmAction('Excluir esta meta?', () => {
      const g = goals().find(x => x.id === id);
      state.goals = goals().filter(x => x.id !== id);
      save('excluiu meta', g?.name || id); render(); toast('Meta excluída.');
    }); break;

    case 'open-reconcile': modalReconcile(); break;
    case 'parse-bank': {
      ui.bankText = $('#bank-text')?.value || '';
      const parsed = parseBankStatement(ui.bankText);
      const done = new Set((state.bank || []).map(b => b.id).filter(Boolean));
      ui.bankRows = parsed.filter(r => !r.id || !done.has(r.id)).map(r => ({ ...r, match: findBankMatch(r) }));
      modalReconcile();
      toast(ui.bankRows.length ? `${ui.bankRows.length} lançamentos para revisar.` : 'Nenhum lançamento novo encontrado.', ui.bankRows.length ? 'ok' : 'err');
      break;
    }
    case 'bank-confirm':
    case 'bank-import':
    case 'bank-ignore': {
      const row = ui.bankRows[num(el.dataset.i)];
      if (!row) break;
      let taxaIgnorada = false;
      if (el.dataset.act === 'bank-confirm' && row.match) {
        const ref = bankCandidates().find(c => c.type === row.match.type && c.id === row.match.id);
        if (ref) {
          const target = row.match.type === 'payment' ? state.payments.find(x => x.id === ref.id)
            : row.match.type === 'day' ? state.dayEntries.find(x => x.id === ref.id)
            : row.match.type === 'expense' ? state.expenses.find(x => x.id === ref.id)
            : state.benefits.find(x => x.id === ref.id);
          if (target) target.reconciledAt = new Date().toISOString();
        }
        bankRegister(row, 'matched', row.match);
        save('conciliou extrato', row.desc);
      } else if (el.dataset.act === 'bank-import') {
        /* A taxa do Mercado Pago já está embutida no valor cobrado do jogador,
           mas não no caixa: lançá-la aqui descontaria a taxa duas vezes. */
        if (isMpFeeDescription(row.desc)) {
          taxaIgnorada = true;
          bankRegister(row, 'ignored');
          save('ignorou taxa do Mercado Pago no caixa', row.desc);
        } else {
          const date = row.date, [y, m] = date.split('-').map(Number);
          state.expenses.push({ id: uid(), date, month: m, year: y, category: 'Outros', description: row.desc || 'Importado do extrato', amount: Math.abs(row.amount), reconciledAt: new Date().toISOString() });
          bankRegister(row, 'imported');
          save('importou despesa do extrato', row.desc);
        }
      } else {
        bankRegister(row, 'ignored');
        save('ignorou lançamento do extrato', row.desc);
      }
      ui.bankRows = ui.bankRows.filter((_, i) => i !== num(el.dataset.i));
      modalReconcile();
      render();
      toast(taxaIgnorada ? 'Taxa do Mercado Pago não entrou no caixa (valor líquido já registrado).' : 'Lançamento processado.');
      break;
    }

    case 'launch-bbq': {
      const s = settings(), m = currentMonth(), y = year();
      const unit = num(s.bbqCostPerPerson) * num(s.bbqPeople);
      if (s.bbqEnabled === false || unit <= 0) { toast('Ative o churrasco e informe custo e pessoas em Configurações.', 'err'); break; }
      const desc = `Churrasco do racha — ${monthName(m)}`;
      const date = isoDate(y, m, 20);
      if (state.expenses.some(e => e && e.category === 'Churrasco' && e.month === m && e.year === y && (e.fixed === 'bbq' || String(e.description || '') === desc))) {
        toast(`Já existe um churrasco em ${monthName(m)}. Para um segundo, lance em Despesas com outro nome.`, 'err'); break;
      }
      state.expenses.push({ id: uid(), date, month: m, year: y, category: 'Churrasco', description: desc, amount: unit, repeat: 'once' });
      save('lançou churrasco', `${desc} · ${money(unit)}`);
      render(); toast(`Churrasco de ${monthName(m)} lançado em Despesas: ${money(unit)}.`);
      break;
    }
    case 'delete-expense': confirmAction('Excluir esta despesa?', () => {
      const exp = state.expenses.find(x => x.id === id);
      state.expenses = state.expenses.filter(x => x.id !== id);
      save('excluiu despesa', exp ? `${fmtDate(exp.date)} · ${exp.description || exp.category}` : id); render(); toast('Despesa excluída.');
    }); break;
    case 'expense-select-all': $$('.expense-check').forEach(c => { c.checked = !!el.checked; }); break;
    case 'expense-clear-selected': {
      const ids = $$('.expense-check:checked').map(c => c.value);
      if (!ids.length) { toast('Selecione pelo menos uma despesa.', 'err'); break; }
      const rows = state.expenses.filter(e => ids.includes(e.id));
      if (!rows.length) { toast('Nenhuma despesa selecionada foi encontrada.', 'err'); break; }
      const total = sum(rows, e => e.amount);
      confirmAction(`Excluir ${rows.length} despesa(s) selecionada(s) (${money(total)})?`, () => {
        const set = new Set(rows.map(e => e.id));
        state.expenses = state.expenses.filter(e => !set.has(e.id));
        save('excluiu despesas selecionadas', `${rows.length} lançamentos · ${money(total)}`);
        render(); toast(`${rows.length} despesa(s) excluída(s).`);
      });
      break;
    }
    case 'clear-expenses': {
      const n = state.expenses.length;
      if (!n) { toast('Não há despesas para limpar.', 'err'); break; }
      const total = sum(state.expenses, e => e.amount);
      confirmActionTwice(`Apagar todas as ${n} despesas (${money(total)})?`, 'Isso não pode ser desfeito. Deseja apagar mesmo assim?', () => {
        state.expenses = [];
        save('limpou todas as despesas', `${n} lançamentos · ${money(total)}`);
        render(); toast(`${n} despesas apagadas.`);
      });
      break;
    }
    case 'delete-expense-series': {
      const sid = String(el.dataset.series || '');
      const rows = state.expenses.filter(x => x.seriesId === sid);
      if (!rows.length) { toast('Repetição não encontrada.', 'err'); break; }
      confirmAction(`Apagar ${rows.length} lançamento(s) desta repetição?`, () => {
        state.expenses = state.expenses.filter(x => x.seriesId !== sid);
        save('apagou repetição de despesa', `${rows.length} lançamentos`);
        render(); toast('Repetição apagada.');
      });
      break;
    }

    case 'edit-benefit': modalBenefit(id); break;
    case 'delete-benefit': confirmAction('Excluir este benefício?', () => {
      state.benefits = state.benefits.filter(x => x.id !== id);
      save('excluiu benefício', id); render(); toast('Benefício excluído.');
    }); break;

    case 'rank-filter': ui.rankFilter = isNaN(num(el.dataset.filter)) ? el.dataset.filter : num(el.dataset.filter); render(); break;
    case 'apply-sim': {
      const v = simValues();
      Object.assign(state.settings, { plannedMembers: v.members, monthlyFee: v.fee, dayPlayersPerGame: v.dayPerGame, dayFee: v.dayFee, gamesPerMonth: v.games });
      ui.sim = null; save('aplicou cenário do simulador'); render(); toast('Cenário aplicado às premissas.');
      break;
    }
    case 'export-json': download(`racha-do-lolo-${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json'); logAudit('exportou backup', todayISO()); save(); toast('Backup baixado.'); break;
    case 'import-json': $('#import-file').click(); break;
    case 'restore-backup': {
      const b = backupList()[num(el.dataset.i)];
      if (!b || !b.data) break;
      confirmAction(`Restaurar a cópia de ${fmtDateTime(b.at)}? Os dados atuais serão substituídos.`, async () => {
        state = b.data; normalizeState();
        await hydratePhotos();
        await persistPhotosFromState();
        save('restaurou cópia automática', fmtDateTime(b.at)); render(); toast('Cópia restaurada.');
      });
      break;
    }
    case 'import-csv': modalImportCSV(); break;
    case 'export-cash': exportCashCSV(); break;
    case 'monthly-report': printMonthlyReport(num($('#report-month')?.value) || currentMonth()); break;
    case 'report-month-csv': downloadMonthlyReportCSV(num($('#report-month')?.value) || currentMonth()); break;
    case 'export-players': exportPlayersCSV(); break;
    case 'load-demo': confirmAction('Substituir todos os dados atuais pelo exemplo?', () => {
      photoClear(); state = makeDemoState(); ui.sim = null; save('carregou dados de exemplo'); render(); toast('Exemplo carregado.');
    }); break;
    case 'clear-demo': confirmAction('Remover todos os registros de demonstração? Suas premissas serão mantidas.', () => {
      const demoIds = new Set(state.players.filter(x => x.demo).map(x => x.id));
      ['players', 'payments', 'dayEntries', 'expenses', 'games', 'benefits', 'scores', 'awards'].forEach(k => state[k] = state[k].filter(x => !x.demo));
      demoIds.forEach(id => photoDel(id));
      save('removeu dados de exemplo'); render(); toast('Dados de exemplo removidos.');
    }); break;
    case 'clear-all': confirmActionTwice(
      'Apagar TODOS os dados deste navegador? Esta ação não pode ser desfeita.',
      'Última confirmação: faça um backup se precisar. Os dados serão apagados agora.',
      () => {
        photoClear(); state = emptyState(); ui.sim = null; save('apagou todos os dados'); navigate('dashboard'); toast('Tudo apagado.');
      }
    ); break;
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fd = new FormData(form);
  const v = (k) => String(fd.get(k) ?? '').trim();
  const type = form.dataset.form;

  if (licenseLocked() && !['checkout', 'license-key', 'license-transfer'].includes(type)) { warnLocked(); return; }

  /* Evita lançamento "invisível": os totais só consideram o ano de controle. */
  const usesDate = ['game', 'day', 'expense', 'benefit'].includes(type) && !(type === 'benefit' && form.dataset.id);
  if (usesDate && v('date')) {
    const dateYear = Number(v('date').slice(0, 4));
    if (dateYear !== year()) {
      toast(`Essa data é de ${dateYear}. Use ${year()} ou troque o ano no topo antes de salvar.`, 'err');
      return;
    }
  }

  if (type === 'checkout') {
    const btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Abrindo pagamento...'; }
    try {
      const data = await window.RachaLicense.beginCheckout(v('email'), form.dataset.plan);
      if (!data.initPoint) throw new Error('O Mercado Pago não retornou um link. Tente novamente.');
      closeModal();
      window.open(data.initPoint, '_blank', 'noopener');
      toast('Pagamento aberto. Volte ao app após concluir.');
      render();
    } catch (err) {
      toast(err.message || 'Não foi possível iniciar.', 'err');
      if (btn) { btn.disabled = false; btn.textContent = 'Ir para o pagamento →'; }
    }
    return;
  }

  if (type === 'upgrade') {
    const btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Fazendo upgrade...'; }
    try {
      const data = await window.RachaLicense.changePlan(form.dataset.plan);
      if (!data || data.ok !== true) throw new Error((data && data.error) || 'Não foi possível fazer o upgrade.');
      closeModal();
      toast(data.message || 'Upgrade concluído!', 'ok');
      render();
    } catch (err) {
      toast(err.message || 'Não foi possível fazer o upgrade.', 'err');
      if (btn) { btn.disabled = false; btn.textContent = 'Confirmar upgrade →'; }
    }
    return;
  }

  if (type === 'license-key') {
    const key = v('key');
    if (!key) { toast('Digite a chave de licença.', 'err'); return; }
    toast('Verificando chave...');
    const data = await window.RachaLicense.activate(key);
    if (data && data.ok === false && data.error) {
      toast(data.error, 'err');
      return;
    }
    if (data && data.state === 'device_mismatch') {
      toast('Esta chave está em outro aparelho. Use o formulário abaixo para vincular este aparelho (até 2).', 'err');
      render();
      return;
    }
    toast(data && data.valid ? 'Assinatura ativada!' : 'Chave salva. Aguarde a confirmação do pagamento.', data && data.valid ? 'ok' : 'err');
    render();
    return;
  }

  if (type === 'license-transfer') {
    const email = v('email');
    if (!email) { toast('Informe o e-mail usado no checkout.', 'err'); return; }
    toast('Transferindo vínculo...');
    const data = await window.RachaLicense.transfer(window.RachaLicense.key, email);
    if (!data.ok) { toast(data.error || 'Não foi possível transferir.', 'err'); return; }
    await window.RachaLicense.refresh();
    toast(data.message || 'Aparelho vinculado.', 'ok');
    render();
    return;
  }

  if (type === 'player') {
    const attr = (k) => v(k) === '' ? null : num(v(k));
    const chosenType = PLAYER_TYPES.includes(v('type')) ? v('type') : 'Mensalista';
    const limite = roleLimitError(chosenType, form.dataset.id || '');
    if (limite) { toast(limite, 'err'); return; }
    const data = {
      id: form.dataset.id || uid(), name: v('name'), type: chosenType, position: v('position'),
      phone: v('phone'), note: v('note'),
      age: attr('age'), height: attr('height'), weight: attr('weight'),
      strength: attr('strength'), speed: attr('speed'),
      active: fd.get('active') !== null
    };
    const idx = state.players.findIndex(p => p.id === data.id);
    if (idx >= 0) state.players[idx] = { ...state.players[idx], ...data, demo: false };
    else state.players.push(data);
    save(idx >= 0 ? 'editou jogador' : 'cadastrou jogador', data.name); closeModal(); render(); toast('Jogador salvo.');
  }
  else if (type === 'payment') {
    const playerId = v('playerId'), month = num(v('month')), y = year();
    /* Pendência antiga mantém o valor original, mesmo que a mensalidade tenha mudado. */
    const anterior = state.payments.find(x => x.playerId === playerId && x.month === month && x.year === y);
    const esperado = anterior ? num(anterior.amount) : feeForPlayerId(playerId);
    const pago = fd.get('paid') !== null;
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(v('dueDate')) ? v('dueDate') : '';
    const paidAt = pago ? (fromDateTimeLocal(v('paidAt')) || anterior?.paidAt || new Date().toISOString()) : '';
    state.payments = state.payments.filter(x => !(x.playerId === playerId && x.month === month && x.year === y));
    state.payments.push({
      id: uid(), playerId, month, year: y, amount: cashNet(v('amount'), esperado), paid: pago,
      dueDate, paidAt,
      receiptId: pago ? (anterior?.receiptId || '') : '',
      txid: anterior?.txid || '',
      origem: anterior?.origem || 'app'
    });
    save(pago ? 'recebeu mensalidade' : 'lançou mensalidade em aberto', `${playerName(playerId)} · ${monthName(month)}/${y}`); closeModal(); render(); toast(pago ? 'Pagamento salvo.' : 'Pendência salva.');
  }
  else if (type === 'game') {
    const date = v('date'), [y, m] = date.split('-').map(Number);
    const sess = sessionById(v('sessionId'));
    state.games.push({
      id: uid(), date, month: m, year: y, done: false,
      sessionId: sess?.id || '', sessionName: sess?.name || '',
      name: v('name') || (sess?.name || ''), time: v('time') || (sess?.time || ''),
      location: v('location') || (sess?.location || ''), notes: sess?.notes || ''
    });
    save('criou jogo', `${fmtDate(date)}${sess ? ' · ' + sess.name : ''}${v('name') ? ' · ' + v('name') : ''}`);
    closeModal(); render(); toast('Jogo criado.');
  }
  else if (type === 'checkin') {
    const gid = form.dataset.id;
    const g = state.games.find(x => x.id === gid);
    state.dayEntries = state.dayEntries.filter(d => d.gameId !== gid);
    const presentes = [];
    const elegiveis = new Set(eligibleForGame(g).map(p => p.id));
    activePlayers().forEach(p => {
      if (!elegiveis.has(p.id) || fd.get('present-' + p.id) === null) return;
      presentes.push(p.id);
      const amount = num(v('amount-' + p.id));
      if (amount <= 0) return;
      state.dayEntries.push({ id: uid(), gameId: gid, date: g.date, month: g.month, year: g.year, playerId: p.id, amount });
    });
    state.checkins[gid] = presentes;
    if (g) g.done = true;
    save('registrou presenças', g ? fmtDate(g.date) : gid); closeModal(); render(); toast('Check-in salvo.');
  }
  else if (type === 'day') {
    const date = v('date'), [y, m] = date.split('-').map(Number);
    state.dayEntries.push({ id: uid(), date, month: m, year: y, playerId: v('playerId'), amount: num(v('amount')) });
    save('lançou diária', `${playerName(v('playerId'))} · ${fmtDate(date)}`); closeModal(); render(); toast('Diária lançada.');
  }
  else if (type === 'expense') {
    const date = v('date'), [y, m, day] = date.split('-').map(Number);
    const category = v('category'), description = v('description'), amount = num(v('amount'));
    const repeat = v('repeat') || 'once';
    const base = { date, month: m, year: y, category, description, amount, repeat };
    const seriesId = uid();
    let rows = [];

    if (repeat === 'game') {
      const games = state.games.filter(g => g && g.year === y && !g.canceled).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
      if (!games.length) {
        toast('Não há jogos cadastrados neste ano para repetir por jogo.', 'err');
        return;
      }
      rows = games.map(g => ({
        ...base, id: uid(), seriesId, date: g.date, month: num(g.month), year: num(g.year), gameId: g.id
      }));
    } else if (repeat === 'month') {
      rows = Array.from({ length: 12 }, (_, i) => {
        const mo = i + 1;
        const safeDay = Math.min(day || 1, new Date(y, mo, 0).getDate());
        return { ...base, id: uid(), seriesId, date: isoDate(y, mo, safeDay), month: mo, year: y, description: monthlyExpenseDescription(category, description, mo) };
      });
    } else if (repeat === 'year') {
      rows = [{ ...base, id: uid(), seriesId }];
    } else {
      rows = [{ ...base, id: uid() }];
    }

    rows.forEach(row => state.expenses.push(row));
    const repeatLabel = { game: 'por jogo', month: 'por mês', year: 'ano todo' }[repeat] || '';
    save('lançou despesa', `${category} · ${rows.length} lançamento(s)${repeatLabel ? ' · ' + repeatLabel : ''}`);
    closeModal(); render();
    toast(rows.length > 1 ? `${rows.length} despesas salvas (${repeatLabel}).` : 'Despesa salva.');
  }
  else if (type === 'award') {
    const m = currentMonth(), y = year(), tops = topWinners(m);
    let aw = state.awards.find(a => num(a.month) === m && num(a.year) === y);
    if (!aw) { aw = { id: uid(), month: m, year: y }; state.awards.push(aw); }
    aw.places = AWARD_PLACES.map((meta, i) => ({
      place: meta.place,
      playerId: tops[i]?.playerId || '',
      points: num(tops[i]?.points),
      gift: v('g' + i),
      cost: num(v('c' + i)),
      delivered: fd.get('d' + i) !== null
    }));
    aw.demo = false;
    aw.fixed = false;
    save('salvou premiação', `${monthName(m)}/${y} · 1º/2º/3º`); render(); toast('Premiação salva com 1º, 2º e 3º lugares.');
  }
  else if (type === 'benefit') {
    const date = v('date'), [y, m] = date.split('-').map(Number);
    const data = { id: form.dataset.id || uid(), date, month: m, year: y, playerId: v('playerId'), type: v('type'), amount: num(v('amount')), fromCash: fd.get('fromCash') !== null, note: v('note') };
    const idx = state.benefits.findIndex(x => x.id === data.id);
    if (idx >= 0) state.benefits[idx] = { ...state.benefits[idx], ...data, demo: false };
    else state.benefits.push(data);
    save(idx >= 0 ? 'editou benefício' : 'lançou benefício', `${playerName(v('playerId'))} · ${fmtDate(date)}`); closeModal(); render(); toast('Benefício salvo.');
  }
  else if (type === 'csv') {
    importCSV(v('entity'), v('content'));
    closeModal();
  }
  else if (type === 'session') {
    const id = form.dataset.id || uid();
    const data = {
      id, name: v('name') || 'Racha', day: Math.min(6, Math.max(0, Math.round(num(v('day'))))),
      time: /^\d{2}:\d{2}$/.test(v('time')) ? v('time') : '19:00',
      duration: v('duration') || '1h30', location: v('location'), notes: v('notes'), active: fd.get('active') !== null,
      withGoalkeepers: fd.get('withGoalkeepers') !== null, withReferee: fd.get('withReferee') !== null
    };
    const idx = sessionsList().findIndex(s => s.id === id);
    if (idx >= 0) state.settings.sessions[idx] = data;
    else state.settings.sessions.push(data);
    state.settings.sessionsSeeded = true;
    syncFixedExpenses();
    save(idx >= 0 ? 'editou racha da semana' : 'cadastrou racha da semana', data.name);
    closeModal(); render(); toast('Racha salvo. Goleiros e arbitragem foram recalculados.');
  }
  else if (type === 'timer-config') {
    state.timer.minutes = Math.max(1, Math.min(240, Math.round(num(v('minutes')) || 10)));
    state.timer.sessionId = sessionById(v('sessionId'))?.id || '';
    state.timer.startTime = /^\d{2}:\d{2}$/.test(v('startTime')) ? v('startTime') : timerStartTime();
    save('ajustou o cronômetro', `${state.timer.minutes} min/partida · início ${state.timer.startTime}`);
    render(); toast(`Cronômetro salvo: ${state.timer.minutes} minutos por partida.`);
  }
  else if (type === 'timer-finish') {
    const cur = state.timer.current;
    if (!cur) { closeModal(); return; }
    const goals = [];
    $$('#timer-goals .goal-row').forEach(row => {
      const playerId = row.querySelector('[name="goalPlayer"]')?.value || '';
      if (!playerId) return;
      const player = playerById(playerId);
      goals.push({ playerId, playerName: player?.name || '', team: row.querySelector('[name="goalTeam"]')?.value || 'A', minute: Math.max(0, Math.round(num(row.querySelector('[name="goalMinute"]')?.value))) });
    });
    const endedAt = new Date().toISOString();
    const scoreA = Math.max(0, Math.round(num(v('scoreA')))), scoreB = Math.max(0, Math.round(num(v('scoreB'))));
    state.timer.history.push({
      id: uid(), no: num(cur.no), startedAt: cur.startedAt, endedAt,
      plannedStart: cur.plannedStart, plannedEnd: cur.plannedEnd,
      pausedMs: num(cur.pausedMs), minutes: num(cur.minutes) || timerMinutes(),
      teams: (cur.teams || []).map(t => Array.isArray(t) ? t.slice() : []),
      teamNames: [v('teamA'), v('teamB')].map(t => String(t || '').slice(0, 500)),
      scoreA, scoreB, goals
    });
    const novaDuracao = Math.max(1, Math.min(240, Math.round(num(v('duration')) || num(cur.minutes) || timerMinutes())));
    if (novaDuracao !== num(cur.minutes)) {
      cur.minutes = novaDuracao;
      cur.plannedEnd = new Date(Date.parse(cur.startedAt) + novaDuracao * 60000).toISOString();
      cur.remainingMs = 0; cur.alarmFired = false;
    }
    state.timer.current = null;
    pruneTimerHistory();
    save('encerrou partida no cronômetro', `Partida ${cur.no} · ${scoreA} × ${scoreB}`);
    closeModal(); render(); toast('Partida salva no histórico por 24 horas.');
  }
  else if (type === 'settings') {
    const numeric = new Set(['year', 'monthlyFee', 'dayFee', 'fieldRent', 'goalkeepers', 'goalkeeperFee', 'refereeFee', 'gamesPerMonth', 'initialCash', 'plannedMembers', 'maxPlayers', 'dayPlayersPerGame', 'bbqCostPerPerson', 'bbqPeople', 'bbqPerYear', 'giftsReserve', 'feePresidente', 'feeVice', 'feeDiretor', 'feeConselheiro', 'ptsGoal', 'ptsAssist', 'ptsPresence', 'ptsFairPlay', 'ptsPunctual', 'ptsFarrapou', 'ptsAtrasado', 'ptsDesarme', 'ptsDefesas', 'ptsParedoes', 'ptsGolsSofridos', 'ptsCard']);
    Object.keys(defaultSettings()).forEach(k => {
      if (k === 'bbqEnabled') { state.settings.bbqEnabled = fd.get('bbqEnabled') !== null; return; }
      if (k === 'dailyPaymentEnabled') { state.settings.dailyPaymentEnabled = fd.get('dailyPaymentEnabled') !== null; return; }
      if (k === 'donationEnabled') { state.settings.donationEnabled = fd.get('donationEnabled') !== null; return; }
      if (!fd.has(k)) return;
      state.settings[k] = numeric.has(k) ? num(v(k)) : v(k);
    });
    const base = num(state.settings.monthlyFee);
    const ajustados = [];
    BOARD_ROLES.forEach(r => {
      const atual = num(state.settings[r.feeKey]);
      if (atual !== 0 && atual < base) {
        state.settings[r.feeKey] = base;
        ajustados.push(r.type);
      }
    });
    syncFixedExpenses();
    ui.sim = null;
    save('alterou premissas');
    render();
    toast('Premissas salvas. Quadra e Goleiros foram recalculados.' + (ajustados.length ? ` Cargos ajustados para ${money(base)}: ${ajustados.join(', ')}.` : ''));
  }
});

/* Backup importado: strings são dados, não HTML. Números/booleanos seguem intactos. */
function sanitizeBackupStrings(value) {
  if (typeof value === 'string') return value.replace(/[<>]/g, '').slice(0, 2000);
  if (Array.isArray(value)) return value.map(sanitizeBackupStrings);
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((key) => {
      const cleanKey = sanitizeBackupStrings(key);
      if (cleanKey === '__proto__') return;
      out[cleanKey] = sanitizeBackupStrings(value[key]);
    });
    return out;
  }
  return value;
}

document.addEventListener('change', async (e) => {
  const el = e.target;
  /* Filtros continuam consultáveis com a assinatura vencida. O ano é o único
     filtro que mexe no estado salvo; nesse caso ele muda só na tela. */
  if (licenseLocked() && el.id === 'year-select') {
    state.settings.year = num(el.value); ui.sim = null; render();
    toast('Ano trocado para consulta. A edição continua bloqueada até a renovação.', 'err');
    return;
  }
  if (licenseLocked() && (['import-file', 'bank-file', 'racha-logo-file'].includes(el.id) || el.dataset.goalProgress)) { warnLocked(); return; }
  if (el.id === 'bank-file' && el.files?.[0]) {
    const file = el.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      ui.bankText = String(reader.result || '');
      const area = $('#bank-text');
      if (area) area.value = ui.bankText;
      toast(`Arquivo ${file.name} carregado. Clique em Analisar.`);
    };
    reader.readAsText(file);
    return;
  }
  if (el.id === 'racha-logo-file' && el.files?.[0]) {
    try {
      const data = await readLogoImage(el.files[0]);
      state.settings.rachaLogo = data;
      await storePhoto(RACHA_LOGO_ID, data);
      save('atualizou logo do racha'); render(); toast('Logo salva.');
    } catch (err) {
      toast(err.message || 'Não foi possível salvar a logo.', 'err');
    }
    return;
  }
  if (el.dataset.goalProgress) {
    const g = goals().find(x => x.id === el.dataset.goalProgress);
    if (g) { g.progress = num(el.value); save('atualizou meta', g.name); render(); }
    return;
  }
  if (el.id === 'game-filter-month') { ui.gameMonth = el.value === 'all' ? 0 : num(el.value); render(); return; }
  if (el.id === 'year-select') { state.settings.year = num(el.value); ui.sim = null; save(); render(); return; }
  if (el.id === 'pay-month') { ui.payMonth = num(el.value); render(); return; }
  if (el.id === 'score-month') { ui.scoreMonth = num(el.value); render(); return; }
  if (el.id === 'live-team') { ui.liveTeam = TEAM_KEYS.includes(el.value) ? el.value : 'A'; return; }
  if (el.id === 'award-month') { ui.awardMonth = num(el.value); render(); return; }
  if (el.id === 'player-filter') { ui.playerFilter = el.value; render(); return; }
  if (el.id === 'import-file' && el.files?.[0]) {
    const file = el.files[0];
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = sanitizeBackupStrings(JSON.parse(reader.result));
        if (!data.settings || !Array.isArray(data.players)) throw new Error('Arquivo inválido');
        confirmAction(`Importar "${file.name}" e substituir todos os dados atuais?`, async () => {
          state = data; normalizeState();
          await hydratePhotos();
          await persistPhotosFromState();
          ui.sim = null; save('importou backup', file.name); render(); toast('Backup importado.');
        });
      } catch (err) { toast('Não foi possível importar: ' + err.message, 'err'); }
      el.value = '';
    };
    reader.readAsText(file);
    return;
  }
  if (el.id === 'cobranca-month') { ui.cobrancaMonth = num(el.value); if (ui.cobrancaPlayer) modalCobranca(ui.cobrancaPlayer); return; }
  if (el.name === 'sessionId' && el.closest('form[data-form="game"]')) {
    const form = el.closest('form[data-form="game"]'), sess = sessionById(el.value);
    if (sess) {
      const time = form.querySelector('[name="time"]'), name = form.querySelector('[name="name"]'), location = form.querySelector('[name="location"]');
      if (time && !time.value) time.value = sess.time;
      if (name && !name.value) name.value = sess.name;
      if (location && !location.value) location.value = sess.location || '';
      toast(`${sess.name}: ${WEEKDAYS[num(sess.day)]} às ${sess.time}.`);
    }
    return;
  }
  if (el.name === 'sessionId' && el.closest('form[data-form="timer-config"]')) {
    const form = el.closest('form[data-form="timer-config"]'), sess = sessionById(el.value);
    if (sess) {
      const start = form.querySelector('[name="startTime"]');
      if (start) start.value = sess.time;
      const total = parseDurationMinutes(sess.duration);
      const minutes = form.querySelector('[name="minutes"]');
      if (minutes && !minutes.dataset.touched) minutes.value = '10';
      toast(`${sess.name}: ${sess.duration} (${total} min) · sugestão de 10 min por partida.`);
    }
    return;
  }
  if (el.id === 'draw-game') { ui.drawGame = el.value; render(); return; }
  if (el.id === 'draw-mode') { ui.drawMode = el.value; return; }
  if (el.id === 'draw-size') { ui.drawSize = Math.max(2, Math.min(20, Math.round(num(el.value)) || 6)); return; }
  if (el.id === 'color-accent') { colors.accent = safeColor(el.value, colors.accent); saveColors(); return; }
  if (el.id === 'color-secondary') { colors.secondary = safeColor(el.value, colors.secondary); saveColors(); return; }
  if (el.id === 'photo-file' && el.files?.[0]) {
    resizePhoto(el.files[0], (data) => {
      if (!data) { toast('Não foi possível ler esta imagem.', 'err'); return; }
      pendingPhoto = data;
      const prev = $('#photo-preview');
      if (prev) prev.innerHTML = avatarHTML({ photo: data, name: 'Foto' }, false).replace('class="avatar', 'class="avatar big');
    });
    return;
  }
  if (el.name === 'category' && el.closest('form[data-form="expense"]')) {
    const form = el.closest('form[data-form="expense"]');
    const anterior = el.dataset.prevCat || '';
    el.dataset.prevCat = el.value;
    const valor = suggestedExpenseAmount(el.value);
    if (valor != null && valor > 0) {
      const amount = form.querySelector('[name="amount"]');
      if (amount) amount.value = valor;
      const desc = form.querySelector('[name="description"]');
      const texto = suggestedExpenseDescription(el.value);
      const textoAnterior = suggestedExpenseDescription(anterior);
      if (desc && texto && (!String(desc.value).trim() || String(desc.value).trim() === textoAnterior)) desc.value = texto;
      toast(`Valor de ${el.value} preenchido: ${money(valor)}.`);
    }
    return;
  }
  if (el.dataset.score) {
    if (licenseLocked()) { warnLocked(); return; }
    upsertScore(el.dataset.player, el.dataset.score, el.type === 'checkbox' ? el.checked : el.value);
    return;
  }
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
  if (el.id === 'color-accent') { colors.accent = safeColor(el.value, colors.accent); applyColors(); return; }
  if (el.id === 'color-secondary') { colors.secondary = safeColor(el.value, colors.secondary); applyColors(); return; }
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

async function boot() {
  /* Carrega as fotos do IndexedDB antes da primeira renderização. */
  await hydratePhotos();
  applyColors();
  if (window.RachaLicense) {
    window.RachaLicense.init(() => {
      if (viewToken) fetchViewData(true);
      if (ui.paymentPage) renderPaymentPage(); else render();
    });
  }
  render();
  handleHash();
}
boot();

/* Cronômetro: atualiza só os números na tela, sem redesenhar formulários. */
setInterval(tickTimer, 1000);
document.addEventListener('input', (e) => {
  if (e.target?.name === 'minutes' && e.target.closest('form[data-form="timer-config"]')) e.target.dataset.touched = '1';
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden || ui.page !== 'timer') return;
  if ($('#modal-root')?.classList.contains('open')) return;
  tickTimer(); render(true);
});

/* Painel do admin acompanha respostas, notas e placar do mesmo retrato do grupo. */
if (viewToken) {
  fetchViewData(true).then(() => { if (['sorteador', 'live', 'ranking'].includes(ui.page)) render(true); });
  setInterval(async () => {
    if (document.hidden || $('#modal-root').classList.contains('open')) return;
    if (!['sorteador', 'live', 'ranking'].includes(ui.page)) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    const before = JSON.stringify([viewData?.responses, viewData?.waitlist, viewData?.ratings, viewData?.live]);
    await fetchViewData(true);
    const after = JSON.stringify([viewData?.responses, viewData?.waitlist, viewData?.ratings, viewData?.live]);
    if (before !== after) render(true);
  }, 15000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) fetchViewData(true).then(() => render(true));
  });
}

window.addEventListener('hashchange', handleHash);

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });

window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY && e.newValue) {
    try {
      state = JSON.parse(e.newValue);
      normalizeState();
      if (ui.paymentPage) renderPaymentPage(); else render();
    } catch (err) { /* ignore */ }
  }
  if (e.key === 'racha-colors') {
    try { colors = cleanColors(JSON.parse(e.newValue) || {}); applyColors(); } catch (err) { /* ignore */ }
  }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
