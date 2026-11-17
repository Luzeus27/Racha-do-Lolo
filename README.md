# Racha do Loló — aplicativo de gestão

[![Netlify Status](https://api.netlify.com/api/v1/badges/be0525ae-4857-4a48-84af-9053356e7a22/deploy-status)](https://app.netlify.com/projects/teal-griffin-a37fbe/deploys)

Aplicativo web **offline** criado a partir da planilha `Racha_do_Lolo_Controle.xlsx`. Ele substitui as abas da planilha por uma interface única, responsiva e com cálculos automáticos.

## Links públicos

- **Netlify (principal):** https://teal-griffin-a37fbe.netlify.app
- **GitHub Pages (espelho):** https://luzeus27.github.io/Racha-do-Lolo/
- **Repositório:** https://github.com/Luzeus27/Racha-do-Lolo

O repositório está conectado ao Netlify e ao GitHub Pages. Sempre que houver um commit na branch `main`, o Netlify publica automaticamente a nova versão e o GitHub Pages atualiza o espelho.

## Arquivos

`index.html`, `styles.css`, `app.js`, `subscription.js`, `manifest.webmanifest`, `sw.js`, `icon.svg`, `icon-192.png`, `icon-512.png`, `termos.html`, `privacidade.html`, `netlify.toml`, `package.json`, `netlify/functions/*.mjs` (checkout, webhook e licença), `servir.bat` / `servir.ps1` (servidor local), `servir-celular.bat` / `servir-celular.ps1` (servidor para testar no celular) e este README.

## Como usar

1. Abra o arquivo `index.html` no navegador (duplo clique).
2. Não precisa instalar nada: funciona sem internet e sem servidor.
3. Os dados ficam salvos no `localStorage` **deste navegador**.
4. Use **⬇ Backup** no topo para baixar um arquivo `.json`. Guarde-o em local seguro.
5. Para restaurar: **Configurações → ⬆ Importar backup**.

> O app começa com **dados de demonstração** para você ver tudo funcionando. Em **Visão geral**, clique em **Limpar demonstração** (ou em Configurações) para começar do zero. Suas premissas são mantidas.

## Módulos (equivalentes às abas da planilha)

| Aba da planilha | Módulo no app |
|---|---|
| Premissas | Configurações |
| Jogadores | Jogadores (com perfil individual) |
| Mensalidades | Mensalidades (grade 12 meses + cobrança via WhatsApp) |
| Diárias | Jogos & Diárias |
| Despesas | Despesas |
| Caixa | Fluxo de caixa (tabela completa + gráficos) |
| Simulador | Simulador (sliders + tabela de sensibilidade) |
| Benefícios | Benefícios |
| Pontuação | Pontuação |
| Premiados | Premiações |
| Ranking | Ranking (trimestres + ano) |

## Melhorias acrescentadas

- **Agenda de jogos**: gere automaticamente as quintas-feiras do mês.
- **Check-in em lote**: marque quem jogou e lance todas as diárias de uma vez.
- **Cobrança via WhatsApp**: link pronto com mensagem para o mensalista atrasado (basta ter o telefone cadastrado).
- **Dashboard com gráficos**: receitas × despesas, saldo acumulado, progresso da meta e da reserva do churrasco.
- **Simulador interativo**: arraste mensalidade, nº de mensalistas, diaristas e jogos; veja o resultado na hora e o ponto de equilíbrio.
- **Ranking com pódio** e filtros por trimestre/ano.
- **Perfil do jogador**: pontos, gols, assistências, mensalidades pagas e diárias recebidas.
- **Perfil, busca e filtros** em jogadores.
- **Exportação CSV** de caixa e jogadores.
- **Importação CSV** vinda do Excel (Configurações → Importar CSV).
- **Tema claro/escuro**, layout responsivo e atalhos de lançamento.
- **Foto do jogador**: adicione/troque/remova a foto na aba Jogadores (botão 📷). A imagem é redimensionada automaticamente.
- **Cores personalizáveis**: em Configurações → Aparência, escolha cores ou paletas prontas.
- **Link de cobrança por jogador** (botão 🔗 na aba Jogadores): gera link de pagamento, código PIX copia-e-cola e envio via WhatsApp; ao confirmar, a mensalidade recebe **baixa automática**.
- **Comprovante de pagamento** com ID único após a baixa: copiar texto, baixar PNG ou salvar em PDF.
- **PWA instalável** no celular, com service worker para funcionar offline.

## Formatos aceitos na importação CSV

Use `;` ou `,` como separador. A primeira linha deve conter os cabeçalhos.

- **Jogadores**: `Nome;Tipo;Posição;Telefone;Observação`
- **Mensalidades**: `Jogador;Jan;Fev;Mar;Abr;Mai;Jun;Jul;Ago;Set;Out;Nov;Dez` (informe apenas os valores pagos)
- **Despesas**: `Data;Categoria;Descrição;Valor` (data em `dd/mm/aaaa` ou `aaaa-mm-dd`)
- **Diárias**: `Data;Jogador;Valor`

## Observações

- O ano de controle padrão é **2027**, conforme a planilha original. Pode ser alterado em Configurações ou no seletor de ano no topo.
- Benefícios a mensalistas e brindes/premiações entram automaticamente no fluxo de caixa (não precisam ser duplicados em Despesas).
- Os cálculos de meta seguem a planilha: aluguel + goleiros + arbitragem + provisão do churrasco + reserva de brindes.
- Este é um app local: os dados ficam no navegador. Para sincronizar entre dispositivos, use o backup JSON.

## Instalar no celular (PWA)

O app é um **PWA**: pode ser instalado na tela inicial e abre em tela cheia, como um app nativo.

**Versão pública (HTTPS):** https://teal-griffin-a37fbe.netlify.app — já publicada e sem senha. Também disponível em https://luzeus27.github.io/Racha-do-Lolo/. Abra no celular e use **Adicionar à tela inicial**.

### Testar agora no celular (mesmo Wi-Fi)
1. Dê um duplo clique em **`servir-celular.bat`** e aceite a permissão de Administrador (UAC). Ele libera a porta 8080 no firewall e encerra o servidor antigo.
2. O console mostrará algo como `No celular: http://192.168.1.17:8080`.
3. No celular, conectado à **mesma rede Wi-Fi**, abra esse endereço no Chrome/Safari.

> Assim você testa o app, os dados, fotos, cores e cobranças normalmente. Como é HTTP (não HTTPS), o navegador do celular **não oferece instalação PWA nem cache offline**. Para instalar, use a Opção 2 abaixo.

### Opção 1 — no próprio computador (mais simples)
1. Execute `servir.bat` (Windows). Ele abre um servidor em `http://localhost:8080`.
2. Abaixo desse endereço no Chrome/Edge, use o menu **⋮ → Salvar e compartilhar → Instalar página como aplicativo**
   (ou o botão **📲 Instalar no celular** em Configurações).
3. Como é `localhost`, o navegador considera seguro e permite instalar.

### Opção 2 — no celular (recomendado)
1. Envie a pasta para um host gratuito com HTTPS (GitHub Pages, Netlify, Vercel etc.).
2. Abra o link no celular (Chrome no Android ou Safari no iPhone).
3. Android: **⋮ → Instalar aplicativo**. iPhone: **Compartilhar → Adicionar à Tela de Início**.

> Service workers exigem HTTPS (ou `localhost`). Abrindo o `index.html` direto do disco (`file://`), o app funciona normalmente, mas a instalação como PWA não é oferecida.

## Link de cobrança e baixa automática — como funciona

1. Em **Jogadores**, clique em **🔗** na linha do jogador.
2. O app mostra o valor, o mês, o **link de pagamento**, o **código PIX** (copia e cola) e o botão de WhatsApp.
3. Configure sua **chave PIX** em **Configurações → Financeiro** para gerar o código PIX.
4. Quem recebe o link vê uma tela de pagamento com o PIX e o botão **"Já paguei — confirmar e dar baixa"**. Ao confirmar, a mensalidade é marcada como paga automaticamente no app.
5. Você também pode dar a baixa direto pelo botão **"Já recebi — dar baixa"** no modal de cobrança.

## Comprovante de pagamento

Após qualquer baixa, o app gera automaticamente um **recibo com ID único** (ex.: `RL-2027-03-P1-ABCD`) contendo jogador, mês, valor, forma de pagamento, ID da transação, data/hora e status.

- Na **baixa pelo link**, o comprovante já aparece na própria tela de pagamento.
- Na **baixa pelo modal de cobrança**, ele abre automaticamente em uma janela.
- Em **Mensalidades**, clique na célula do mês pago e use **🧾 Comprovante** para revisar quando quiser.

O comprovante pode ser **copiado como texto**, **baixado em PNG** ou **salvo em PDF** pelo botão 🖨️ (abrir a caixa de impressão e escolher "Salvar como PDF").

**Importante:** a confirmação automática funciona no mesmo navegador/dispositivo onde os dados estão salvos (ou entre abas do mesmo navegador, que sincronizam ao vivo). Para **reconhecimento bancário real** (webhook do Mercado Pago/PIX, vários dispositivos, comprovantes emitidos pelo banco), é necessário um servidor e um provedor de pagamento — esta versão é 100% local e offline. O recibo gerado aqui é um **registro interno do app**.

---

## Assinatura recorrente (30 dias grátis + plano mensal/anual)

O app agora tem uma estrutura completa de cobrança recorrente, pronta para ser ligada ao Mercado Pago.

### Como funciona para quem usa

1. Ao abrir o app pela primeira vez, começa o **período gratuito de 30 dias**, sem cartão.
2. Em **Assinatura**, o usuário escolhe o plano **mensal** ou **anual**, informa o e-mail e é levado ao Mercado Pago.
3. O Mercado Pago faz a primeira cobrança e, a partir daí, renova automaticamente. O cancelamento pode ser feito quando quiser, sem multa.
4. Ao voltar para o app, a licença é confirmada por um aviso automático (webhook). Se estiver offline, o app aceita até **3 dias** sem conexão.
5. Se o período gratuito acabar sem assinatura, o app entra em **modo somente leitura**: dados, backup e comprovantes continuam acessíveis, mas novos cadastros e edições ficam bloqueados.
6. Cada assinatura gera uma **chave de licença** (ex.: `RL-1A2B3C4D5E6F`). Ela pode ser copiada na tela Assinatura e usada para recuperar o acesso em outro aparelho.

### Páginas legais

- [Termos de Uso](termos.html)
- [Política de Privacidade](privacidade.html)

Elas já explicam renovação, cancelamento, o direito de arrependimento de 7 dias (CDC, art. 49) e o tratamento dos dados.

### O que já está pronto no código

| Arquivo | Função |
|---|---|
| `subscription.js` | Controla trial, chave de licença, tolerância offline e a interface de status |
| `netlify/functions/create-checkout.mjs` | Cria a assinatura no Mercado Pago e devolve o link de pagamento |
| `netlify/functions/mp-webhook.mjs` | Recebe a confirmação do Mercado Pago e grava o status da licença |
| `netlify/functions/license.mjs` | Consulta se a chave está ativa e devolve os dados do plano |
| `netlify/functions/_shared.mjs` | Configuração compartilhada (Blobs, preços, CORS, chamadas à API) |
| `netlify.toml` | Habilita as funções e define Node 20 |
| `package.json` | Instala a biblioteca `@netlify/blobs` usada pelas funções |

### Configuração única (o que falta fazer no painel)

#### 1. Mercado Pago

1. Entre em **Suas integrações** no portal de desenvolvedores do Mercado Pago e crie uma aplicação.
2. Copie o **Access Token de produção** (ou o de teste, para os primeiros testes).
3. Em **Webhooks > Configurar notificações**, cadastre a URL:
   `https://teal-griffin-a37fbe.netlify.app/.netlify/functions/mp-webhook`
   e marque os eventos **Assinaturas** (`subscription_preapproval`) e, se disponível, **Cobranças de assinatura** (`subscription_authorized_payment`).
4. Copie a **chave secreta do webhook** gerada pelo Mercado Pago. Ela serve para confirmar que a notificação realmente veio dele.

#### 2. Netlify

No projeto **teal-griffin-a37fbe**, abra **Project configuration > Environment variables** e adicione:

| Variável | Valor |
|---|---|
| `MP_ACCESS_TOKEN` | O Access Token copiado do Mercado Pago |
| `MP_WEBHOOK_SECRET` | A chave secreta do webhook |
| `MP_PRICE_MONTHLY` | Preço mensal em reais (padrão: `19.9`) |
| `MP_PRICE_YEARLY` | Preço anual em reais (padrão: `199`) |
| `SITE_URL` | `https://teal-griffin-a37fbe.netlify.app` |

Depois de salvar, faça um novo deploy (ou dispare um **Trigger deploy**) para as variáveis valerem.

> Enquanto `MP_ACCESS_TOKEN` não estiver configurado, os botões de assinatura aparecem desativados e o app funciona normalmente no modo gratuito — nada quebra.

#### 3. Teste antes de cobrar de verdade

1. Use um **Access Token de teste** e uma conta de comprador de teste do Mercado Pago.
2. Clique em **Assinar mensal**, informe o e-mail de teste e conclua o pagamento com um cartão de teste.
3. Confira se a chave aparece em **Assinatura** e se o banner muda para **Assinatura ativa**.
4. Só depois disto troque para o token de produção.

### Observações importantes

- **O GitHub Pages é apenas um espelho.** Ele serve os arquivos estáticos, mas não roda funções. Para assinar, use sempre o endereço do Netlify. O app detecta isso e avisa.
- **Os dados do racha continuam 100% locais.** A assinatura não sincroniza jogadores nem valores entre dispositivos; use o backup JSON para isso.
- **O bloqueio real fica no servidor.** Como o repositório é público, alguém pode copiar o código, mas sem uma chave de licença válida (confirmada pelo webhook) não consegue liberar a edição no site publicado.
- **Nunca coloque o Access Token dentro do `app.js`.** Ele fica apenas nas variáveis de ambiente do Netlify.
