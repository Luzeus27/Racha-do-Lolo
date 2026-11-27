/* Comunidade — funciona sozinha (comunidade.html) e dentro do app (index.html). */
(function () {
  function initComunidade(root) {
    if (!root || root.dataset.comunidadeReady === '1') return true;
    const $ = (sel) => root.querySelector(sel);
    const uf = $('#uf');
    const cidade = $('#cidade');
    const cidadeCriacao = $('#cidade-criacao');
    const formAcesso = $('#form-acesso');
    const formCriacao = $('#form-criacao');
    if (!uf || !cidade || !cidadeCriacao || !formAcesso || !formCriacao) return false;
    root.dataset.comunidadeReady = '1';

    const EMAIL = 'rachadololo@gmail.com';
    const lista = $('#lista-grupos');
    const listaCriacao = $('#lista-criacao');
    const statusAcesso = $('#status-acesso');
    const statusCriacao = $('#status-criacao');
    const mailto = $('#mailto-comunidade');
    let grupos = [];
    let ufSel = '';
    let cidadeSel = '';

    const CAPITAIS = {
      AC: 'Rio Branco', AL: 'Maceió', AP: 'Macapá', AM: 'Manaus', BA: 'Salvador',
      CE: 'Fortaleza', DF: 'Brasília', ES: 'Vitória', GO: 'Goiânia', MA: 'São Luís',
      MT: 'Cuiabá', MS: 'Campo Grande', MG: 'Belo Horizonte', PA: 'Belém',
      PB: 'João Pessoa', PR: 'Curitiba', PE: 'Recife', PI: 'Teresina',
      RJ: 'Rio de Janeiro', RN: 'Natal', RS: 'Porto Alegre', RO: 'Porto Velho',
      RR: 'Boa Vista', SC: 'Florianópolis', SP: 'São Paulo', SE: 'Aracaju', TO: 'Palmas'
    };

    function normalizar(texto) {
      return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    }

    function dadosLocais() {
      try {
        const licenca = JSON.parse(localStorage.getItem('racha-license') || '{}');
        const dados = JSON.parse(localStorage.getItem('racha-do-lolo-v1') || '{}');
        return {
          chave: String((licenca && licenca.key) || '').slice(-4),
          nome: String(((dados && dados.settings) || {}).rachaName || '')
        };
      } catch (e) {
        return { chave: '', nome: '' };
      }
    }

    const locais = dadosLocais();
    if (locais.nome) {
      formAcesso.elements.racha.value = locais.nome;
      formCriacao.elements.racha.value = locais.nome;
    }
    if (locais.chave) formAcesso.elements.chave.value = locais.chave;

    function opcao(valor, texto) {
      const o = document.createElement('option');
      o.value = valor;
      o.textContent = texto || valor;
      return o;
    }

    function preencher(form, u, c) {
      form.elements.uf.value = u || '';
      form.elements.cidade.value = c || '';
    }

    function parseCidade(texto) {
      const m = String(texto || '').trim().match(/^(.+?)\s*[-/\u2013,]\s*([A-Za-z]{2})$/);
      if (!m) return null;
      const sigla = m[2].toUpperCase();
      if (!CAPITAIS[sigla]) return null;
      const nome = m[1].trim();
      return nome ? { uf: sigla, cidade: nome } : null;
    }

    function render() {
      const capital = CAPITAIS[ufSel];
      cidade.textContent = '';
      cidade.appendChild(opcao('', capital ? 'Selecione a cidade' : 'Selecione o estado'));
      if (capital) cidade.appendChild(opcao(capital));
      if (cidadeSel && cidadeSel !== capital && grupos.some((g) => g.uf === ufSel && normalizar(g.cidade) === normalizar(cidadeSel))) {
        cidade.appendChild(opcao(cidadeSel));
      }
      cidade.value = cidadeSel || '';
      uf.value = ufSel;
      lista.textContent = '';

      if (!ufSel) {
        lista.innerHTML = '<p class="tiny muted">Escolha um estado: a capital já tem grupo disponível.</p>';
        formAcesso.hidden = true;
      } else if (capital) {
        const card = document.createElement('div');
        card.className = 'legal-note';
        card.innerHTML = '<strong>Grupo de ' + capital + ' já disponível.</strong><br><span class="tiny muted">' + ufSel + ' · ' + capital + ' — preencha os dados abaixo e peça acesso.</span>';
        lista.appendChild(card);
        formAcesso.hidden = false;
        preencher(formAcesso, ufSel, cidadeSel || capital);
      } else {
        lista.innerHTML = '<p class="tiny muted">Este estado não tem capital cadastrada. Use o campo “Minha cidade não é capital”.</p>';
        formAcesso.hidden = true;
      }
      atualizarMailto();
    }

    function renderCriacao() {
      listaCriacao.textContent = '';
      const local = parseCidade(cidadeCriacao.value);
      if (!local) return;
      const encontrado = grupos.find((g) => g.uf === local.uf && normalizar(g.cidade) === normalizar(local.cidade));
      if (!encontrado) return;
      const card = document.createElement('div');
      card.className = 'legal-note';
      const titulo = document.createElement('strong');
      titulo.textContent = local.cidade + ' - ' + local.uf + ' já tem grupo.';
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'btn btn-primary btn-block';
      botao.textContent = 'Pedir acesso a esta cidade';
      botao.addEventListener('click', () => {
        ufSel = local.uf;
        cidadeSel = local.cidade;
        render();
        formAcesso.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      card.appendChild(titulo);
      card.appendChild(botao);
      listaCriacao.appendChild(card);
    }

    function atualizarMailto() {
      const form = parseCidade(cidadeCriacao.value) ? formCriacao : (formAcesso.hidden ? formCriacao : formAcesso);
      const dados = new FormData(form);
      const linhas = [];
      if (form === formCriacao) {
        const local = parseCidade(cidadeCriacao.value);
        if (local) {
          dados.set('uf', local.uf);
          dados.set('cidade', local.cidade);
        }
        linhas.push('Pedido de criação da cidade — Comunidade Racha do Loló');
        linhas.push('Cidade - Estado: ' + String(cidadeCriacao.value || '').trim());
      } else {
        linhas.push('Pedido de acesso — Comunidade Racha do Loló');
        linhas.push('Local: ' + String(dados.get('cidade') || '') + '/' + String(dados.get('uf') || ''));
      }
      linhas.push('Racha: ' + String(dados.get('racha') || ''));
      if (form === formAcesso) linhas.push('Final da chave: ' + String(dados.get('chave') || ''));
      const msg = String(dados.get('mensagem') || '').trim();
      if (msg) linhas.push('Mensagem: ' + msg);
      mailto.href = 'mailto:' + EMAIL
        + '?subject=' + encodeURIComponent('Comunidade — Racha do Loló')
        + '&body=' + encodeURIComponent(linhas.join('\n'));
    }

    async function enviar(form, status, mensagemOk) {
      status.hidden = true;
      if (!navigator.onLine) {
        status.textContent = 'Sem internet agora. Abra o link de e-mail abaixo para enviar depois.';
        status.hidden = false;
        return;
      }
      if (form === formCriacao) {
        const local = parseCidade(cidadeCriacao.value);
        if (!local) {
          status.textContent = 'Escreva assim: cidade - UF (ex.: Arapiraca - AL).';
          status.hidden = false;
          return;
        }
        preencher(form, local.uf, local.cidade);
      } else {
        preencher(form, ufSel, cidadeSel || CAPITAIS[ufSel] || '');
      }
      if (!String(form.elements.cidade.value || '').trim()) {
        status.textContent = 'Informe a cidade antes de enviar.';
        status.hidden = false;
        return;
      }
      const botao = form.querySelector('button[type="submit"]');
      botao.disabled = true;
      botao.textContent = 'Enviando...';
      try {
        const res = await fetch('/', { method: 'POST', body: new FormData(form) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        status.textContent = mensagemOk;
        status.hidden = false;
      } catch (e) {
        status.textContent = 'Não foi possível enviar pelo site. Use o link de e-mail abaixo.';
        status.hidden = false;
      } finally {
        botao.disabled = false;
        botao.textContent = form === formAcesso ? '📨 Pedir acesso' : '📨 Pedir criação da cidade';
      }
    }

    uf.addEventListener('change', () => { ufSel = uf.value; cidadeSel = CAPITAIS[ufSel] || ''; render(); });
    cidade.addEventListener('change', () => { cidadeSel = cidade.value; render(); });
    cidadeCriacao.addEventListener('input', () => { renderCriacao(); atualizarMailto(); });
    formAcesso.addEventListener('input', atualizarMailto);
    formCriacao.addEventListener('input', atualizarMailto);
    formAcesso.addEventListener('submit', (event) => {
      event.preventDefault();
      enviar(formAcesso, statusAcesso, 'Pedido enviado! O administrador vai conferir e te adicionar ao grupo.');
    });
    formCriacao.addEventListener('submit', (event) => {
      event.preventDefault();
      enviar(formCriacao, statusCriacao, 'Pedido enviado! O administrador vai criar o grupo e te adicionar.');
    });

    fetch('./comunidade.json')
      .then((res) => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then((dados) => {
        grupos = Array.isArray(dados) ? dados : [];
        render();
        renderCriacao();
      })
      .catch(() => {
        lista.innerHTML = '<p class="tiny muted">Não foi possível carregar a lista de comunidades agora. As capitais continuam disponíveis.</p>';
      });
    render();
    atualizarMailto();
    return true;
  }

  window.initComunidade = initComunidade;
  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('comunidade-root');
    if (root && root.querySelector('#form-acesso')) initComunidade(root);
  });
})();
