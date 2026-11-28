/* Página de administração da chave temporária. A chave master fica só no
   localStorage deste navegador e é enviada direto à função protegida. */
'use strict';

(function () {
  const endpoint = '/.netlify/functions/temporary-license';
  const form = document.getElementById('temp-form');
  const emailInput = document.getElementById('temp-email');
  const daysInput = document.getElementById('temp-days');
  const actionInput = document.getElementById('temp-action');
  const submit = document.getElementById('temp-submit');
  const msg = document.getElementById('temp-msg');
  const result = document.getElementById('temp-result');
  const keyOut = document.getElementById('temp-key');
  const detail = document.getElementById('temp-detail');
  const copyBtn = document.getElementById('temp-copy');
  const downloadBtn = document.getElementById('temp-download');
  let current = {};

  function readMaster() {
    try { return JSON.parse(localStorage.getItem('racha-license') || '{}'); }
    catch (e) { return {}; }
  }

  function say(text, ok) {
    msg.textContent = text || '';
    msg.className = text ? (ok ? 'ok' : 'err') : '';
  }

  function show(data) {
    current = data || {};
    keyOut.textContent = data.key || '';
    const until = data.expiresAt ? String(data.expiresAt).slice(0, 10) : '—';
    const days = Number.isFinite(data.daysLeft) ? data.daysLeft : '—';
    detail.textContent = `${data.message || 'Concluído.'} E-mail: ${data.email || '—'} · Válida até ${until} · ${days} dias restantes.`;
    result.hidden = false;
    try {
      localStorage.setItem('racha-temp-license', JSON.stringify({
        key: data.key, email: data.email, expiresAt: data.expiresAt
      }));
    } catch (e) { /* o arquivo baixado continua disponível */ }
  }

  try {
    const saved = JSON.parse(localStorage.getItem('racha-temp-license') || '{}');
    if (saved.email) emailInput.value = String(saved.email);
    if (saved.days) daysInput.value = String(saved.days);
  } catch (e) { /* preenchimento é apenas conveniência */ }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    say('', false);
    result.hidden = true;
    const master = readMaster();
    const masterKey = String(master.key || '').trim().toUpperCase();
    const masterDevice = String(localStorage.getItem('racha-device-id') || '').trim().toUpperCase();
    if (!masterKey || !masterDevice) {
      say('Abra esta página no navegador onde sua chave master está ativa.', false);
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Executando...';
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          masterKey,
          masterDevice,
          action: actionInput.value,
          email: emailInput.value.trim(),
          days: Number(daysInput.value)
        })
      });
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok || data.error) {
        say(data.error || 'Não foi possível concluir. Tente novamente.', false);
        return;
      }
      show(data);
      say(data.message || 'Concluído.', true);
    } catch (e) {
      say('Sem conexão com o servidor. Tente novamente.', false);
    } finally {
      submit.disabled = false;
      submit.textContent = 'Executar';
    }
  });

  copyBtn.addEventListener('click', async function () {
    const key = keyOut.textContent.trim();
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      say('Chave copiada.', true);
    } catch (e) {
      say('Selecione a chave acima e copie manualmente.', false);
    }
  });

  downloadBtn.addEventListener('click', function () {
    const key = keyOut.textContent.trim();
    if (!key) return;
    const text = [
      'Racha do Loló — chave temporária de teste',
      '',
      'Chave: ' + key,
      'E-mail: ' + (current.email || '—'),
      'Validade: ' + (current.expiresAt ? String(current.expiresAt).slice(0, 10) : '—'),
      '',
      'Como usar:',
      '1. Abra https://rachadololo.netlify.app',
      '2. Vá em Assinatura.',
      '3. Cole a chave em "Chave de licença" e toque em Ativar.',
      '4. Se pedir e-mail, use o mesmo e-mail desta chave.',
      '',
      'Acesso PRO temporário, sem cobrança. O administrador prorroga ou revoga.'
    ].join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'chave-teste-racha-do-lolo.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
})();
