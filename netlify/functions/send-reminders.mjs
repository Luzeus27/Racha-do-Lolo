/* Gera links de lembrete (WhatsApp) para jogos próximos dos links publicados.
   Função agendável: exige REMINDER_SECRET no header x-reminder-secret. */
import { timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { json, siteUrl, setCorsOrigin, viewUnavailable, rateLimit } from './_shared.mjs';
import { hoursUntilLocal, paidMonthlyKeys, todayBR } from './_daily.mjs';

const MAX_REMINDERS = 200;
const MAX_PAGES = 50;
const VIEW_TOKEN = /^VW-[A-F0-9]{16}$/;
const PLAYER_TOKEN = /^VP-[A-F0-9]{16}$/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max = 60) {
  return String(value ?? '').slice(0, max);
}

function isProduction() {
  if (process.env.NETLIFY_LOCAL === 'true') return false;
  const context = String(process.env.CONTEXT || '').toLowerCase();
  return context === 'production' || String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function authorized(req, scheduled) {
  /* O agendador do Netlify envia POST com {"next_run": "..."} e não permite
     headers customizados; essas chamadas são sempre internas e confiáveis. */
  if (scheduled) return true;
  const secret = process.env.REMINDER_SECRET;
  if (secret) {
    const provided = typeof req.headers?.get === 'function' ? req.headers.get('x-reminder-secret') : null;
    const a = Buffer.from(String(provided || ''));
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  /* Sem segredo configurado: somente chamada explícita local em desenvolvimento. */
  return !isProduction() && new URL(req.url).searchParams.get('local') === '1';
}

async function isScheduledInvocation(req) {
  if (String(req.method || '').toUpperCase() !== 'POST') return false;
  /* O agendador do Netlify chega com o corpo next_run e um identificador de
     agendamento. Exigir os dois evita que um POST qualquer dispare lembretes
     se a função um dia passar a ter URL pública. */
  const get = typeof req.headers?.get === 'function' ? (n) => req.headers.get(n) : () => '';
  const event = String(get('x-netlify-event') || get('x-nf-event') || '').toLowerCase();
  const agent = String(get('user-agent') || '').toLowerCase();
  if (event !== 'schedule' && !agent.includes('netlify clockwork')) return false;
  try {
    const raw = await req.clone().text();
    if (!raw || raw.length > 1024) return false;
    const body = JSON.parse(raw);
    return isObject(body) && typeof body.next_run === 'string' && body.next_run.length > 0;
  } catch (e) { return false; }
}

/* `list()` nem sempre está disponível (emuladores/versões antigas do Blobs).
   Nesse caso devolvemos lista vazia e um aviso, sem tentar adivinhar chaves. */
async function listKeys(store) {
  if (typeof store.list !== 'function') {
    return { keys: [], warning: 'Listagem de links indisponível neste ambiente.' };
  }
  const keys = [];
  const seen = new Set();
  let cursor = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    let result;
    try {
      result = await store.list(cursor ? { cursor, limit: 100 } : { limit: 100 });
    } catch (e) {
      return { keys, warning: 'Não foi possível listar os links publicados.' };
    }
    const blobs = Array.isArray(result && result.blobs) ? result.blobs : [];
    blobs.forEach((blob) => {
      const key = String(blob && blob.key ? blob.key : '');
      if (VIEW_TOKEN.test(key) && !seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    });
    const next = result && result.cursor ? String(result.cursor) : '';
    if (!next || next === cursor) return { keys, warning: '' };
    cursor = next;
  }

  return { keys, warning: 'Listagem de links truncada; nem todos foram verificados.' };
}

function reminderType(hours) {
  if (hours === null) return '';
  if (hours >= 23 && hours <= 25) return '24h';
  if (hours >= 1 && hours <= 3) return '2h';
  return '';
}

function labelBR(date) {
  const match = DATE_ONLY.exec(date);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
}

const DEFAULT_REMINDER_TEXT = {
  group: '⚽ {jogo}: jogo em {data} ({horario})!\nAbra o link, vá em Jogadores, encontre seu nome e faça seu check-in/pagamento: {link}\nMensalista paga a mensalidade; diarista paga a diária na sua área.',
  player: '🏽 {jogo}: jogo em {data} ({horario})! Confirme sua presença: {link}',
  dueGroup: '📢 Mensalidade do racha: {aviso}. Vencimento: {vencimento}. Acesse seu link para regularizar: {link}',
  duePlayer: '🔔 {jogador}, mensalidade de {mes}/{ano}: {aviso}. Valor {valor}; vencimento {vencimento}. Pague pelo seu link: {link}'
};

function shiftDate(date, days) {
  const m = DATE_ONLY.exec(String(date || ''));
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + days);
  return [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, '0'), String(d.getUTCDate()).padStart(2, '0')].join('-');
}

/* Mesmos placeholders do painel: {jogo}, {data}, {horario}, {link}, {jogador}. */
function renderReminderText(template, ctx) {
  const raw = String(template || '').replace(/\r\n?/g, '\n').slice(0, 700);
  const hasLink = /\{link\}/i.test(raw);
  const out = raw
    .replace(/\{jogo\}/gi, text(ctx.gameName || 'Racha do Loló', 90))
    .replace(/\{data\}/gi, text(ctx.date, 30))
    .replace(/\{horario\}/gi, text(ctx.time || 'horário a definir', 20))
    .replace(/\{jogador\}/gi, String(ctx.playerName || '').split(' ')[0].slice(0, 40))
    .replace(/\{link\}/gi, text(ctx.link, 400));
  return hasLink ? out.trim() : [out.trim(), ctx.link].filter(Boolean).join('\n').trim();
}

/* Placeholders da mensalidade. O grupo recebe só o aviso genérico; nomes,
   valores e o link VP aparecem apenas na cobrança individual. */
function renderDueText(template, ctx) {
  const raw = String(template || '').replace(/\r\n?/g, '\n').slice(0, 700);
  const hasLink = /\{link\}/i.test(raw);
  const amount = Number(ctx.amount) || 0;
  const out = raw
    .replace(/\{jogador\}/gi, String(ctx.playerName || '').split(' ')[0].slice(0, 40))
    .replace(/\{mes\}/gi, String(Math.floor(Number(ctx.month) || 0)).padStart(2, '0'))
    .replace(/\{ano\}/gi, String(Math.floor(Number(ctx.year) || 0)))
    .replace(/\{vencimento\}/gi, text(ctx.dueLabel, 30))
    .replace(/\{valor\}/gi, new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount))
    .replace(/\{aviso\}/gi, text(ctx.notice, 80))
    .replace(/\{link\}/gi, text(ctx.link, 400));
  return hasLink ? out.trim() : [out.trim(), ctx.link].filter(Boolean).join('\n').trim();
}

export default async (req) => {
  setCorsOrigin(req);
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const declared = Number(typeof req.headers?.get === 'function' ? req.headers.get('content-length') : 0);
  if (Number.isFinite(declared) && declared > 16 * 1024) return json({ error: 'Requisição muito grande.' }, 413);
  const limit = await rateLimit(req, 'reminder', { max: 10, windowMs: 60000 });
  if (!limit.ok) return json({ error: 'Muitas tentativas. Aguarde um minuto.' }, 429, {
    'Retry-After': String(limit.retryAfter)
  });

  const scheduled = await isScheduledInvocation(req);
  if (!authorized(req, scheduled)) {
    return json({ error: process.env.REMINDER_SECRET ? 'Não autorizado.' : 'Lembretes não configurados.' },
      process.env.REMINDER_SECRET ? 401 : 503);
  }

  const store = getStore({ name: 'racha-visualizacoes', consistency: 'strong' });
  const { keys, warning } = await listKeys(store);
  const base = siteUrl(req);
  const nowMs = Date.now();
  const today = todayBR(nowMs);
  const reminders = [];

  for (const vw of keys) {
    if (reminders.length >= MAX_REMINDERS) break;
    let record = null;
    try { record = await store.get(vw, { type: 'json', consistency: 'strong' }); }
    catch (e) { continue; }

    if (!isObject(record) || viewUnavailable(record)) continue;
    const snapshot = isObject(record.snapshot) ? record.snapshot : {};
    const games = Array.isArray(snapshot.games) ? snapshot.games.slice(0, 500) : [];
    const tokens = isObject(record.playerTokens) ? record.playerTokens : {};
    const contacts = isObject(record.contacts) ? record.contacts : {};
    const custom = isObject(record.reminderTexts) ? record.reminderTexts : {};
    const groupTemplate = String(custom.group || DEFAULT_REMINDER_TEXT.group);
    const playerTemplate = String(custom.player || DEFAULT_REMINDER_TEXT.player);
    const dueGroupTemplate = String(custom.dueGroup || DEFAULT_REMINDER_TEXT.dueGroup);
    const duePlayerTemplate = String(custom.duePlayer || DEFAULT_REMINDER_TEXT.duePlayer);
    const names = Object.create(null);
    (Array.isArray(snapshot.players) ? snapshot.players : []).forEach((p) => {
      const id = text(p && p.id, 60);
      if (id) names[id] = text(p && p.name, 90);
    });
    const players = Object.entries(tokens).slice(0, 200)
      .filter(([id, token]) => !!text(id, 60) && PLAYER_TOKEN.test(String(token)))
      .map(([id, token]) => [text(id, 60), String(token)]);

    /* Mensalidade: só no vencimento e 3 dias depois. O vencimento é manual;
       sem data não há lembrete, para não inventar dia. */
    const late = shiftDate(today, -3);
    const paidMonthly = paidMonthlyKeys(record);
    const dues = isObject(snapshot.dues) ? snapshot.dues : {};
    const dueRows = [];
    Object.keys(dues).slice(0, 200).forEach((rawId) => {
      const playerId = text(rawId, 60);
      if (!playerId) return;
      (Array.isArray(dues[rawId]) ? dues[rawId] : []).slice(0, 36).forEach((value) => {
        const row = isObject(value) ? value : {};
        const month = Math.floor(Number(row.month) || 0);
        const year = Math.floor(Number(row.year) || 0);
        const due = /^\d{4}-\d{2}-\d{2}$/.test(String(row.dueDate || '')) ? String(row.dueDate) : '';
        if (!month || !year || !due || (due !== today && due !== late)) return;
        if (paidMonthly.has(playerId + '|' + month + '|' + year)) return;
        dueRows.push({
          playerId, month, year, due,
          amount: Number(row.amount) || 0,
          when: due === today ? 'vencimento' : '3 dias depois'
        });
      });
    });

    if (dueRows.length) {
      const first = dueRows[0];
      const baseCtx = {
        dueLabel: labelBR(first.due),
        notice: first.when === 'vencimento' ? 'vence hoje' : 'está em atraso',
        link: base + '/visualizar.html?v=' + vw
      };
      if (reminders.length < MAX_REMINDERS) {
        reminders.push({
          vw, gameId: '', date: first.due, when: first.when,
          playerId: '', group: true, direct: false,
          kind: 'monthly',
          url: 'https://wa.me/?text=' + encodeURIComponent(renderDueText(dueGroupTemplate, baseCtx))
        });
      }
      for (const [playerId, playerToken] of players) {
        if (reminders.length >= MAX_REMINDERS) break;
        const row = dueRows.find((r) => r.playerId === playerId);
        if (!row) continue;
        const link = base + '/jogador.html?v=' + vw + '&p=' + playerToken;
        const message = renderDueText(duePlayerTemplate, {
          ...baseCtx,
          link,
          playerName: names[playerId] || '',
          month: row.month, year: row.year, amount: row.amount,
          notice: row.when === 'vencimento' ? 'vence hoje' : 'está em atraso desde ' + labelBR(row.due)
        });
        const rawNumber = String(contacts[playerId] || '');
        const number = /^55\d{10,11}$/.test(rawNumber) ? rawNumber : '';
        reminders.push({
          vw, gameId: '', date: row.due, when: row.when, playerId,
          group: false, direct: !!number, kind: 'monthly',
          url: number
            ? 'https://wa.me/' + number + '?text=' + encodeURIComponent(message)
            : 'https://wa.me/?text=' + encodeURIComponent(message)
        });
      }
    }

    for (const value of games) {
      if (reminders.length >= MAX_REMINDERS) break;
      const game = isObject(value) ? value : {};
      if (game.canceled === true) continue;
      const date = text(game.date, 20);
      if (!date || date < today) continue;
      const when = reminderType(hoursUntilLocal(date, nowMs));
      if (!when) continue;

      const gameId = text(game.id, 60);
      if (!gameId) continue;

      /* Aviso de jogo para o grupo: apenas o retrato público (VW). Nunca inclui
         tokens VP, telefones ou dados individuais. A mensalidade tem aviso
         genérico separado, sem nomes nem valores. */
      const groupLink = base + '/visualizar.html?v=' + vw;
      const gameContext = {
        gameName: text(game.name, 90).trim() || 'Racha do Loló',
        date: labelBR(date),
        time: text(game.time, 10).trim() || 'horário a definir',
        link: groupLink
      };
      const groupMessage = renderReminderText(groupTemplate, gameContext);
      if (reminders.length < MAX_REMINDERS) {
        reminders.push({
          vw, gameId, date, when,
          playerId: '', group: true, direct: false,
          url: 'https://wa.me/?text=' + encodeURIComponent(groupMessage)
        });
      }

      for (const [playerId, playerToken] of players) {
        if (reminders.length >= MAX_REMINDERS) break;
        const link = base + '/jogador.html?v=' + vw + '&p=' + playerToken;
        const message = renderReminderText(playerTemplate, {
          ...gameContext, link, playerName: names[playerId] || ''
        });
        const rawNumber = String(contacts[playerId] || '');
        const number = /^55\d{10,11}$/.test(rawNumber) ? rawNumber : '';
        reminders.push({
          vw,
          gameId,
          date,
          when,
          playerId,
          direct: !!number,
          url: number
            ? 'https://wa.me/' + number + '?text=' + encodeURIComponent(message)
            : 'https://wa.me/?text=' + encodeURIComponent(message)
        });
      }
    }
  }

  reminders.sort((a, b) => a.date.localeCompare(b.date) ||
    a.gameId.localeCompare(b.gameId) || a.playerId.localeCompare(b.playerId));

  return json({
    ok: true,
    generatedAt: new Date(nowMs).toISOString(),
    reminders: reminders.slice(0, MAX_REMINDERS),
    ...(warning ? { warning } : {})
  });
};
