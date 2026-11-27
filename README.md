# Racha do Loló — aplicativo de gestão

[![Netlify Status](https://api.netlify.com/api/v1/badges/be0525ae-4857-4a48-84af-9053356e7a22/deploy-status)](https://app.netlify.com/projects/rachadololo/deploys)

Aplicativo web **offline** criado a partir da planilha `Racha_do_Lolo_Controle.xlsx`. Ele substitui as abas da planilha por uma interface única, responsiva e com cálculos automáticos.

## Links públicos

- **Netlify (principal):** https://rachadololo.netlify.app
- **GitHub Pages (espelho):** https://luzeus27.github.io/Racha-do-Lolo/
- **Repositório:** https://github.com/Luzeus27/Racha-do-Lolo

O repositório está conectado ao Netlify e ao GitHub Pages. Um commit na branch `main` publica a nova versão no Netlify e atualiza o espelho no GitHub Pages quando esse espelho estiver sincronizado.

> **Status da publicação (27/11/2026):** plano **Personal** ativo, deploy de produção liberado e versão `v1.1.3` publicada no Netlify e no espelho do GitHub Pages. Home, `visualizar.html`, `jogador.html`, `ao-vivo.html`, `comunidade.html` e `contato.html` responderam **200**; cabeçalhos de segurança, `sw.js` e função de licença conferidos. **Lote 5 (endurecimento das funções) concluído:** webhook valida a assinatura antes de consultar o Mercado Pago ou gravar, limita verbos a GET/POST e tem limite de requisições; segredos agendados e e-mail de transferência usam comparação em tempo constante; corpo `null` devolve 400; erros de rede do Mercado Pago não são devolvidos ao navegador; `gameId` é conferido; respostas 204 saem com `no-store`. Bateria local **139/139**, sem erro de console. **Falta antes de vender:** vincular a conta Mercado Pago com `rachadololo@gmail.com`, cadastrar variáveis, configurar webhook e testar em sandbox. A checagem é feita por `scripts/security-check.ps1` (somente leitura), que grava `relatorio-seguranca.txt` na raiz quando as páginas respondem; não há um script separado só de deploy. Ver também o [checklist de segurança](docs/checklist-seguranca.md).

## Links do grupo, do jogador e ao vivo

Qualquer **assinante com acesso ativo** (mensal ou anual; a conta master vitalícia do proprietário também) pode gerar em **Configurações → Link para o grupo** (ou pelo atalho no topo da Visão geral) um endereço como `https://rachadololo.netlify.app/visualizar.html?v=VW-XXXXXXXXXXXXXXXX`. **É esse o único link que deve ir ao grupo.** O botão se chama **🔗 Gerar Acesso**; depois de criado, use **📤 Enviar ao grupo** (ou **📋 Copiar p/ grupo**). A mensagem enviada começa com **o nome do racha do cliente** (marcação `{racha}`, preenchida com o que está em **Configurações → Perfil do racha**) e traz o texto: *“Check-in Liberado! Acesse o link, procure o seu perfil e escolha a forma de pagamento para garantir a sua vaga.”* **Você pode editar essa mensagem** em **Configurações → Link para o grupo → Texto do convite** e salvar com **💾 Salvar premissas**. Use `{racha}` para o nome do racha e `{link}` no ponto onde o endereço deve aparecer (se omitir, o app coloca o link no fim); **Restaurar padrão** volta ao texto original. No teste local (`file://`) as funções do Netlify não respondem, então o botão só mostra o aviso; no site principal ele gera o acesso normalmente com a versão publicada.

- **Visão do grupo (`visualizar.html`)** — abre direto na aba **👥 Jogadores**: cada pessoa encontra o próprio nome, clica em **Acessar meu perfil**, informa os últimos 4 dígitos do telefone cadastrado e é levada à própria área de check-in/pagamento. A aba **📊 Visão geral** continua com perfil do racha (nome, logo, fundação, local, horário, duração e regras/estatuto), próximos jogos, presença, fila, times sorteados, ranking, placar ao vivo e resumo financeiro. O grupo não precisa de conta.
- **Perfil do racha:** em **Configurações → Perfil do racha** o administrador edita nome, data de nascimento, logo, local, horário habitual, duração e o estatuto. A logo é reduzida e guardada no IndexedDB (entra no backup JSON); os dados aparecem no topo do link do grupo depois da publicação automática. Nada disso é obrigatório — sem preenchimento, a página segue como antes.
- **Área do jogador (`jogador.html`)** — link pessoal `?v=VW...&p=VP...`. O jogador chega lá pelo link do grupo (aba Jogadores) ou pelo link individual enviado no privado. **Sem senha**: a identificação é pelos últimos 4 dígitos do telefone mais o nome no link do grupo, ou pelo link `VP-` enviado em particular. Isso **não é uma prova forte de identidade** — o link individual deve chegar só ao dono do aparelho. O servidor limita o número de tentativas. No PIX manual, nenhum clique do jogador baixa o pagamento: quem dá a baixa é o administrador, inclusive no PRO/conta master vitalícia do proprietário.
- **Ao vivo (`ao-vivo.html`)** — página pública de placar, gols, assistências e cartões, atualizada a cada 5 s. O administrador lança os lances em **Ao vivo** no app.
- **Atualização automática:** cada alteração salva publica um novo retrato depois de ~2,5 s; o grupo recarrega a cada 15 s e o placar a cada 5 s.
- **Privacidade:** o token VW é secreto e o VP é individual. Ao publicar, o app envia ao Netlify Blobs um retrato com jogadores (nome, posição e tipo), fotos, valores/regras/configurações, logo, textos de lembrete, telefones e tokens `VP-`. Telefones e tokens servem só para identificação, lembretes e links individuais e ficam fora da parte pública; nada é vendido ou usado para publicidade. O retrato público esconde telefone, PIX, dívidas, observações e tokens individuais; o PIX aparece apenas na área do próprio jogador.
- **Como o jogador acha o próprio perfil:** `find-player.mjs` recebe o token VW, o id do jogador escolhido na lista e os dígitos do telefone. Na publicação, o app envia os telefones em `playerPhones`, campo guardado na parte privada do retrato; o servidor mantém só os números em `contacts`, dentro do registro privado. Se bater, a função devolve **unicamente o token VP daquela pessoa** e o navegador abre `jogador.html`. Nenhum outro token é devolvido. O limite é de 12 tentativas por minuto por IP e por link, para evitar tentativas em massa — mas os 4 dígitos continuam sem ser uma senha. Se o jogador não tiver telefone cadastrado, a função avisa e pede para falar com o administrador. Depois da primeira identificação, o link individual fica salvo **somente neste aparelho** por 180 dias e o jogador entra direto; o botão **🔄 Não é você? Trocar jogador** apaga o salvamento e permite usar outro perfil. Ele serve quando **outra pessoa pega o mesmo celular** e quer entrar na própria área; não é um botão para pagar por outro jogador — para isso basta abrir a área daquela pessoa e gerar o PIX dela. **A área do jogador é somente de check-in, fila de espera e pagamento:** ele não edita nome, telefone, tipo nem qualquer outro dado — essas alterações continuam sendo feitas apenas pelo administrador no app principal.
- **Segurança:** publicar, revogar e comandar o placar exigem licença ativa e aparelho vinculado. A leitura pública usa `get-view.mjs`; as ações do jogador usam `view-respond.mjs` e `view-rating.mjs`.
- **Validade e revogação:** em **Configurações → Link para o grupo** você pode definir uma data de expiração e revogar o link. Links revogados ou vencidos param de responder (aviso `410`) e não aceitam confirmações, notas nem lances ao vivo. Ao publicar novamente, um novo token `VW-` é gerado e os links individuais `VP-` são atualizados.
- **Envio dos links individuais:** em **Configurações → Links individuais dos jogadores**, o botão **📤 WhatsApp** abre o chat do jogador com o link dele já escrito — basta confirmar o envio. O mesmo botão existe na ficha individual. Se o jogador não tiver telefone cadastrado, o app abre o WhatsApp para escolher o contato, e **📋 Copiar** continua disponível. Cada link vai somente ao seu dono.
- **Lembretes:** `send-reminders.mjs` gera dois tipos de link `wa.me` nas janelas de 24 h e 2 h antes do jogo: **📢 grupo** (um aviso único com o link `VW-` da visão pública) e **🔔 jogador** (chat direto quando há telefone cadastrado). As frases são editáveis em **Configurações → Lembretes automáticos** e aceitam `{jogo}`, `{data}`, `{horario}` e `{link}` (além de `{jogador}` no lembrete individual); se `{link}` não for usado, ele é acrescentado no fim. Nome e horário são campos opcionais no cadastro do jogo — sem eles, a frase mostra “Racha do Loló” e “horário a definir”. As frases ficam em `reminderTexts` no registro do servidor, **fora da parte pública** do retrato, e são publicadas junto com o link. O aviso do grupo traz só dados públicos — nunca tokens `VP-`, telefones, mensalidades ou PIX. Os telefones ficam em `contacts`, também fora da parte pública. O retrato guardado no Netlify traz telefones e tokens `VP-` na parte privada, usados só para identificação e lembretes. `get-view.mjs` e `get-player-view.mjs` não devolvem frases nem contatos. O agendamento diário em `netlify.toml` chama a função automaticamente; para chamadas manuais, configure `REMINDER_SECRET` e envie o header `x-reminder-secret`. O painel oferece os mesmos links em Configurações → Lembretes automáticos.
- **Conciliação:** `reconcile-licenses.mjs` roda às 03h e compara todas as assinaturas com o Mercado Pago, corrigindo o acesso se um webhook tiver sido perdido. Chamada manual: configure `RECONCILE_SECRET` e envie `x-reconcile-secret`.
- Sem Netlify (GitHub Pages) esses recursos **não funcionam**: dependem de funções e Netlify Blobs. Use sempre o domínio principal.

## Pagamentos no link individual

No link do jogador (`jogador.html`), o fluxo depende do tipo cadastrado no app:

- **Mensalista:** a área **Minha mensalidade** mostra os meses em aberto com o **PIX do administrador** (chave cadastrada em Configurações). O jogador toca em **📋 Copiar PIX da mensalidade** e paga no app do banco.
- **Diarista:** toca em **📋 Copiar PIX da diária**. O código usa a mesma chave do administrador e o valor configurado em **Configurações → Diária (R$/jogo)**. Se ele tiver crédito de jogo cancelado, aparece **✅ Confirmar com crédito** e a vaga é garantida na hora. Se não houver vaga, o jogador entra na fila e não paga.

**Diferença entre os planos no link do jogador:**

- **Básico:** depois de pagar, o jogador toca em **📣 Avisar que paguei**. O aviso aparece em **Configurações → Confirmação manual**, mas a mensalidade/diária e a presença só são liberadas quando você dá a baixa.
- **PRO/conta master vitalícia do proprietário com PIX manual:** não existe botão “Já paguei”. Depois de pagar na chave do administrador, o jogador toca em **✅ Vou jogar** para confirmar presença/avisar que pagou — **esse toque não baixa a pendência**. O aviso aparece para você conferir, mas quem dá a baixa é o administrador em **Configurações → Confirmação manual**.
- **Mercado Pago conectado:** o jogador pode pagar a diária/mensalidade por PIX gerado no Mercado Pago, cartão ou cobrança automática. O pagamento aprovado chega pelo webhook, baixa a pendência e libera a presença sozinho; o toque em **✅ Vou jogar** continua servindo só para presença e fila. O PIX manual da sua chave permanece como alternativa, com aviso ao administrador.

> No PIX manual, **nenhum clique do jogador baixa o pagamento**: “Vou jogar” serve só para presença/aviso. Como o dinheiro cai direto na sua chave, nenhum banco avisa o app; quem confirma e dá a baixa é o administrador, inclusive no PRO/conta master vitalícia do proprietário. No Mercado Pago, quem confirma o pagamento é o webhook.

**Modelo comercial:** o administrador escolhe em **Configurações → Pagamentos no link** entre **PIX manual** (padrão) e **Mercado Pago**. Para usar o Mercado Pago, ele vincula a conta dele com **um clique** no botão **Conectar com Mercado Pago** e segue o passo a passo dentro do app; client_secret e tokens ficam só no servidor/Blob da licença, nunca no navegador. O PIX manual continua disponível como alternativa mesmo nesse modo. O modo efetivo de cada link é decidido no servidor na publicação (`paymentMode`) e só vale se a conta estiver realmente vinculada. O check-in automático por declaração (`autoCheckin`) foi **removido como forma de baixar pagamento**: no PIX manual, sempre o administrador dá a baixa, mesmo no PRO/conta master vitalícia do proprietário. No Mercado Pago, a baixa é pelo webhook.

> **Taxa e fluxo de caixa:** a taxa do cartão é acrescentada somente ao valor que o jogador paga. O caixa, os KPIs, o CSV e o retrato do grupo usam sempre o **valor líquido** da mensalidade/diária. O webhook grava o bruto e a taxa apenas no registro privado do servidor, para conferência; não os soma como receita nem como despesa. Se o administrador colar o valor bruto no campo “Valor pago”, o app registra só o líquido. Linhas de extrato com descrição de taxa/tarifa do Mercado Pago não são importadas como despesa — isso evitaria descontar a taxa duas vezes.

O controle fica em **Configurações → Pagamentos no link**:

- escolher o **meio de pagamento dos jogadores**: **PIX manual (padrão)** ou **Mercado Pago**;
- conectar a conta com **🔗 Conectar com Mercado Pago** (um botão), ver o status e seguir o passo a passo; se ainda não tiver conta, há o link **Criar conta no Mercado Pago**;
- depois de conectar e escolher o modo, salvar as premissas e usar **Atualizar agora** no link do grupo para publicar a escolha;
- ligar/desligar a exigência do PIX da diária (campo também está em **Financeiro**); a mensalidade precisa sempre estar em dia;
- ver quantas mensalidades e diárias foram pagas, quantas estão aguardando e quantos créditos existem;
- cancelar um jogo escolhendo **💳 Cancelar e virar crédito** (o valor fica para a próxima diária do mesmo jogador; no link dele aparece **✅ Confirmar com crédito**, sem gerar novo PIX) ou **↩️ Cancelar e estornar** (devolução combinada com o administrador, fora do app).

Em **Configurações → Confirmação manual** você vê os **avisos dos jogadores**, resolve os casos sem PIX e dá a baixa: escolhe o jogador, o jogo (quando precisa) e marca **presença**, **pagamento** ou os dois. No PIX manual, é **sempre aqui** que o pagamento é baixado — dinheiro, PIX feito na sua chave ou qualquer exceção — inclusive no PRO/conta master vitalícia do proprietário; o clique do jogador sozinho nunca baixa. O servidor exige a licença ativa do aparelho vinculado e grava quem fez a baixa. Para mensalista, a baixa manual marca a pendência mais antiga como paga; para diarista, marca a diária do jogo escolhida. O botão **✅ Marcar avisos como vistos** limpa a lista depois que você conferiu. Se o diarista pagou em dinheiro e o jogo for cancelado, o estorno também é registrado localmente — não vai ao Mercado Pago porque não há pagamento lá.

Regras de segurança: o tipo do jogador, os PIX e os créditos ficam só no registro privado do servidor; `get-player-view.mjs` devolve ao jogador apenas o próprio PIX, a própria pendência e o estado da cobrança dele. A lista de avisos (`paymentNotices`) fica nesse registro privado e só volta para o administrador em `manage-daily-payments`, nunca na visão pública nem na área do jogador. No PIX manual, o código gerado usa somente a chave do administrador e o valor da pendência; não há cobrança no Mercado Pago, estorno automático nem confirmação por webhook, e o clique do jogador nunca baixa a pendência. No modo Mercado Pago, cada cobrança usa o token da conta daquele administrador (`mpTokenFor`), com renovação automática no servidor; o navegador nunca recebe token, refresh ou segredo. O webhook valida a assinatura HMAC com `MP_WEBHOOK_SECRET` e só baixa cobranças de links que estejam no modo MP. O acesso aos links `VW`/`VP` respeita o limite de tentativas por minuto.

> status: código versionado, Lote 5 aplicado e **publicação de produção concluída em 27/11/2026**. Antes de vender, faltam conta/variáveis do Mercado Pago, webhook e teste em sandbox; conferir novamente home, três páginas, cabeçalhos de segurança e funções com `scripts/security-check.ps1`.

## Aviso legal

Este projeto é de uso exclusivo do titular. O código, o nome, a identidade visual e os materiais são protegidos e **todos os direitos estão reservados**. O fato de o repositório ser público permite apenas a visualização; não autoriza copiar, modificar, redistribuir, revender ou publicar em outro domínio sem permissão por escrito. Veja o arquivo [LICENSE](LICENSE) e os [Termos de Uso](termos.html).

## Arquivos

`index.html`, `styles.css`, `app.js`, `subscription.js`, `visualizar.html`, `visualizar.js`, `jogador.html`, `jogador.js`, `ao-vivo.html`, `ao-vivo.js`, `manifest.webmanifest`, `sw.js`, `icon.svg`, `icon-192.png`, `icon-512.png`, `termos.html`, `privacidade.html`, `netlify.toml`, `package.json`, `LICENSE`, `netlify/functions/*.mjs` (checkout, webhook, licença, cancelamento, conta master, publicação/revogação da visualização do grupo, respostas, notas, placar ao vivo, lembretes e reconciliação), `servir.bat` / `servir.ps1` (servidor local), `servir-celular.bat` / `servir-celular.ps1` (servidor para testar no celular), `contato.html` (formulário de contato), `comunidade.html`, `comunidade.js` e `comunidade.json` (comunidade por cidade), `tests/mp-flows.test.html` (bateria automática) e este README.

## Como usar

1. Abra o arquivo `index.html` no navegador (duplo clique).
2. Não precisa instalar nada: funciona sem internet e sem servidor.
3. Os dados ficam salvos no `localStorage` **deste navegador**.
4. Use **⬇ Backup** no topo para baixar um arquivo `.json`. Guarde-o em local seguro.
5. Para restaurar: **Configurações → ⬆ Importar backup**.

> **Fotos e cópias automáticas:** as fotos ficam no `IndexedDB` do navegador (o `localStorage` tem cota pequena), mas são incluídas no backup `.json`. Em **Configurações** você encontra as **últimas 5 cópias automáticas** (a cada 10 minutos de alteração) e a **trilha de auditoria** com cadastros, mensalidades, despesas, presenças e exclusões. Se o navegador não oferecer IndexedDB, as fotos permanecem no modo antigo, dentro do `localStorage`.

> O app começa com **dados de demonstração** para você ver tudo funcionando. Em **Visão geral**, clique em **Limpar demonstração** (ou em Configurações) para começar do zero. Suas premissas são mantidas.

> **Acesso rápido na Visão geral:** o cartão **Link do grupo** fica no topo. Com ele você gera o link (quando ainda não existe) e, depois de gerado, vê os botões **📤 Enviar ao grupo** e **📋 Copiar p/ grupo**. São os mesmos botões de **Configurações → Link para o grupo**; o link é secreto e deve ir somente ao grupo.

## Módulos (equivalentes às abas da planilha)

| Aba da planilha | Módulo no app |
|---|---|
| Premissas | Configurações |
| Jogadores | Jogadores (com perfil individual e características) |
| Sorteio de equipes | Sorteador |
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

- **Agenda de jogos**: gere todos os rachas cadastrados para o mês ou para o ano inteiro. Cada jogo aceita **nome**, **horário** e **local** opcionais, usados nas frases dos lembretes. Se um racha não vai acontecer, use **🚫 Cancelar** na linha dele: o status vira **Cancelado**, ele sai da agenda do grupo, do Sorteador e dos lembretes, e pode ser **↩ Reativado** depois.
- **Check-in em lote**: marque quem jogou e lance todas as diárias de uma vez.
- **Cobrança via WhatsApp**: link pronto com mensagem para o mensalista atrasado (basta ter o telefone cadastrado).
- **Dashboard com gráficos**: receitas × despesas, saldo acumulado, progresso da meta e da reserva do churrasco.
- **Simulador interativo**: arraste mensalidade, nº de mensalistas, diaristas e jogos; veja o resultado na hora e o ponto de equilíbrio.
- **Ranking com pódio** e filtros por trimestre/ano. A foto de perfil aparece no pódio, nos destaques (Xerifão e Artilheiro) e na tabela; quem não tem foto vê as iniciais.
- **Pontuação do campeonato:** todos os itens são digitados como **quantidade** na aba Pontuação — gols, assistências, presenças, desarmes/interceptações, **defesas difíceis, paredões e gols sofridos**, fair play, pontualidade, cartões, **Farrapou / Faltou** e **Atrasado**. Nas premissas você define quanto vale **cada unidade**; as três novas categorias começam valendo **0 pontos**, então nenhuma pontuação antiga muda sozinha — configure um valor positivo para defesas/paredões e negativo para gols sofridos se quiser que contem no ranking. No **Farrapou / Faltou**, digitar 2 significa que o jogador farrapou/faltou 2 vezes e perde 2 × o valor configurado; em **Atrasado**, digitar 2 significa 2 atrasos e a mesma perda por unidade. Esses saldos entram no ranking e na escolha de 1º/2º/3º lugar. Os valores de cada item aparecem no retrato público para o cálculo do ranking do grupo.
- **Perfil do jogador**: pontos, gols, assistências, mensalidades pagas e diárias recebidas. A ficha ampliada mostra presença mês a mês, situação das 12 mensalidades, posição por trimestre, média força/velocidade e botões para copiar ou enviar no WhatsApp o link individual do jogador.
- **Perfil, busca e filtros** em jogadores.
- **Exportação CSV** de caixa e jogadores.
- **Importação CSV** vinda do Excel (Configurações → Importar CSV).
- **Conciliação com extrato bancário**: em Configurações → **Conciliar extrato**, cole um CSV ou OFX. O app compara valor/data/descrição, sugere lançamentos existentes, permite importar o que faltou ou ignorar, e registra tudo na auditoria.
- **Metas genéricas**: extras mensais recorrentes ou em um mês específico entram na meta de receita; metas anuais separadas têm progresso próprio em Fluxo de caixa.
- **Relatório mensal PDF e CSV**: em Fluxo de caixa, escolha o mês e use **🖨 Relatório PDF** ou **⬇ Relatório do mês (CSV)**. Os dois trazem receitas, despesas, mensalidades, presença, pontuação (incluindo defesas, paredões e gols sofridos), ranking do trimestre e metas extras. O CSV abre no Excel com colunas fixas, vírgula decimal e nome `relatorio-MM-AAAA.csv`. O caixa completo do ano continua disponível em **Configurações → Dados → ⬇ Caixa (CSV)**, para não haver dois botões de download na mesma tela.
- **PIX de doação voluntária**: em Fluxo de caixa e no link do grupo aparece um cartão 💚 com o PIX do racha **sem valor fixo** — cada pessoa escolhe quanto quer doar. Usa a chave PIX já cadastrada em Configurações (não precisa de Mercado Pago), não conta como mensalidade/diária e pode ser desligado em Configurações. A mensagem é editável.
- **Apoio ao desenvolvedor**: na tela da licença (acessível no período grátis de 14 dias e para assinantes) há outro cartão 💚 com o PIX de quem desenvolveu o app. A chave fica no arquivo `developer.js`, igual para todas as instalações (atualmente `rachadololo@gmail.com`, favorecido `RACHA DO LOLO - DESENVOLVEDOR`, cidade `MACEIO - AL`), e pode ser trocada editando esse arquivo. É doação opcional: não altera licença, dados nem cobrança.
- **Tema claro/escuro**, layout responsivo e atalhos de lançamento.
- **Foto do jogador**: adicione/troque/remova a foto na aba Jogadores (botão 📷). A imagem é redimensionada automaticamente.
- **Cores personalizáveis**: em Configurações → Aparência, escolha cores ou paletas prontas.
- **Cargos da diretoria**: além de **Mensalista** e **Diarista**, o cadastro aceita **Presidente**, **Vice-Presidente**, **Diretor** e **Conselheiro**. Eles pagam como mensalistas (entram na grade, no previsto, no link individual e no PIX/cartão), mas podem ter valor próprio: em **Configurações → Financeiro** você define quanto cada cargo paga por mês. Deixando **0**, o cargo cobra igual ao mensalista; digitando, por exemplo, **100**, ele paga R$ 100,00. O app **nunca cobra menos** que a mensalidade base: ao salvar, qualquer valor de cargo abaixo da base é ajustado automaticamente para o valor da mensalista. **Só pode haver 1 Presidente e 1 Vice-Presidente** — o app bloqueia o segundo e avisa; Diretores e Conselheiros não têm limite. O cargo aparece na lista de jogadores, no link do grupo e na área do jogador.
- **Link de cobrança por jogador** (botão 🔗 na aba Jogadores): gera link de pagamento, código PIX copia-e-cola e envio via WhatsApp; ao confirmar **no app, pelo administrador**, a mensalidade recebe a baixa.
- **Comprovante de pagamento** com ID único após a baixa: copiar texto, baixar PNG ou salvar em PDF.
- **PWA instalável** no celular, com service worker para funcionar offline.
- **Ficha completa do jogador**: além de contato e observação, guarde idade, altura, peso e as características **força** e **velocidade** (em %). O perfil mostra tudo e calcula a **nota geral** (média de força e velocidade).
- **Sorteador de equipes**: aba dedicada para montar os times do racha. Marque os jogadores que confirmaram presença (por data de jogo ou avulso), escolha o tamanho da equipe (padrão 6) e sorteie em modo **equilibrado** (usa força/velocidade e distribui os goleiros), **aleatório**, **por posição**, **por nota**, **sem repetir duplas**, **ordem de chegada + equilibrado** ou **manual**. Há **refazer sorteio** e o histórico garante que as equipes **não se repetem**. Depois de sortear, o botão **✏️ Ajustar times** permite mover um jogador para outra equipe e salvar no mesmo resultado — sem criar novo sorteio e sem mexer em pagamento. No cartão do resultado, o botão **📤 WhatsApp** (ou **📋 Copiar p/ WhatsApp**) envia a formação dos times com o nome de cada jogador. Na lista de confirmados e nos times sorteados, o nome do jogador vem acompanhado da categoria (**Mensalista**, **Diarista**, **Presidente**, **Vice-Presidente**, **Diretor** ou **Conselheiro**).
- **Vários horários na semana**: em **Configurações → Horários da semana** você cadastra quantos horários quiser (ex.: Segunda às 19h e Quinta às 20h), cada um com **nome, dia da semana, horário, duração, local e regras/observações**. Na aba **Jogos & Diárias**, o botão **Gerar rachas do mês** cria todas as sessões do mês e o botão **Gerar ano todo** cria os 12 meses de uma vez, sem repetir jogos já existentes. Há um filtro para ver **Ano todo** ou só um mês. Cada linha da agenda mostra quantos jogadores estão **confirmados no Sorteador** e quantos fizeram **check-in**; o botão **👥 Ver** abre a lista completa, com ordem de chegada, quem compareceu e quem ainda não confirmou. O check-in agora guarda todos os presentes, mesmo quem não paga diária. O jogo avulso (**＋ Jogo**) também pode escolher um racha e herda nome/horário/local/regras. No **⏱️ Cronômetro**, escolher um racha ajusta o horário e mantém a sugestão de **10 minutos por partida**. Horários inativos ficam fora da agenda e do Cronômetro. Em Configurações você pode marcar vários rachas e usar **🧹 Limpar selecionados** ou **🧹 Limpar todos**. Na confirmação aparece a opção **Apagar também os jogos gerados por este racha**, desmarcada por padrão: se você marcar, são removidos os jogos, check-ins, diárias, confirmações e ordem de chegada daqueles rachas; se não marcar, os jogos já criados ficam na agenda.
- **⏱️ Cronômetro das partidas**: aba própria que usa a **duração do racha cadastrada em Configurações** (por exemplo, `1h30`) e sugere **10 minutos por partida** — dando 9 partidas. O administrador pode trocar os minutos (de 1 a 240) e o horário de início sem mexer em Configurações. Cada partida pode ser **iniciada**, **pausada**, **retomada** e **encerrada**; ao fim do tempo há aviso sonoro e mensagem na tela. O histórico guarda, por **24 horas**, início e fim reais, início e fim previstos, tempo de pausa, os times do último sorteio, placar e quem marcou os gols (jogador, time e minuto). É possível excluir uma partida ou limpar todo o histórico. Tudo fica salvo só no aparelho; o link do grupo não recebe esses dados.
- **Chamada · Ordem de chegada**: a chamada usa a **mesma lista de Jogadores confirmados** — não há uma segunda lista de nomes. A ordem aparece no **topo do cartão**, em uma fila compacta: cada jogador ganha um selo **1º, 2º, 3º...** e pode ser reposicionado com **← / →**, sem precisar rolar até o fim da página. Toque no nome no momento em que ele chega: o toque confirma a presença e registra a ordem, mostrando o selo também no chip. **✕** tira apenas da chamada (o jogador continua confirmado); **↩ Desfazer** e **🧹 Limpar** ajustam a fila sem mexer nas confirmações. O formulário **Montagem das equipes** fica na mesma área, logo acima da lista de nomes, com o botão de sortear também junto ao fim dos chips — sem precisar ir ao fim da página. **Limpar** no topo apaga confirmações e chamada juntas. A ordem é salva por jogo e é usada pelo modo **Ordem de chegada + Equilibrado**: quem chegou primeiro entra primeiro, e cada jogador seguinte vai para a equipe com menos gente e menor soma de força/velocidade. Quem ainda não chegou fica no fim da fila. O resultado do sorteio mostra a ordem usada.

## Formatos aceitos na importação CSV

Use `;` ou `,` como separador. A primeira linha deve conter os cabeçalhos.

- **Jogadores**: `Nome;Tipo;Posição;Telefone;Observação;Idade;Altura;Peso;Força;Velocidade` (as cinco últimas colunas são opcionais)
- **Mensalidades**: `Jogador;Jan;Fev;Mar;Abr;Mai;Jun;Jul;Ago;Set;Out;Nov;Dez` (informe apenas os valores pagos)
- **Despesas**: `Data;Categoria;Descrição;Valor` (data em `dd/mm/aaaa` ou `aaaa-mm-dd`)
- **Diárias**: `Data;Jogador;Valor`

Para conciliação, o extrato pode ser **CSV** (`Data;Histórico;Valor`, com `;` ou `,` e cabeçalho opcional) ou **OFX/QFX** (tags `<STMTTRN>`, `<DTPOSTED>`, `<TRNAMT>`, `<FITID>` e `<MEMO>`). Datas aceitas: `aaaa-mm-dd` ou `dd/mm/aaaa`.

## Observações

- O ano de controle padrão é o **ano atual** (por exemplo, **2026**). Pode ser alterado em Configurações ou no seletor de ano no topo. Ao criar jogo, diária, despesa ou benefício, a data sugerida já vem dentro desse ano; se você digitar uma data de outro ano, o app avisa — troque o ano no topo antes de salvar.
- **Capitão do dia (avaliar depois da publicação):** ideia guardada para depois que a conta e as variáveis estiverem prontas. Seria um acesso **temporário por jogo**, criado pelo administrador, para outra pessoa de confiança cuidar do check-in, do sorteio, do cronômetro e das estatísticas daquela partida na ausência do administrador. O acesso teria validade curta, poderia ser revogado e **não permite** mexer em pagamento, caixa, configurações, licença ou aparelho. Jogador continua só com check-in, fila e pagamento. **Não implementado agora** — depende de variáveis e autorização explícita.
- **Um horário não é outro racha.** **Configurações → Horários da semana** serve só para cadastrar dias/horários diferentes **do mesmo racha** — mesma turma, mesmo grupo de WhatsApp, mesmo caixa, mesmo PIX. Use quantos horários quiser, sem cobrança extra. Para organizar uma **outra turma**, com grupo, caixa e jogadores próprios, é preciso contratar uma **segunda assinatura** (Básico ou PRO); não existe cobrança por “racha criado”.
- **Despesas e dívidas de outros anos ficam intactas.** As despesas fixas (Quadra, Goleiros, Arbitragem, Churrasco) são recalculadas somente no ano de controle; um lançamento histórico não é reescrito nem apagado quando você troca de ano. O PIX de uma mensalidade em aberto usa o ano em que a dívida foi lançada, e o comprovante baixa esse mesmo ano — uma pendência antiga não ganha o ano corrente sem querer.
- **Despesas fixas acompanham as premissas:** ao salvar Configurações (e também ao abrir o app), os lançamentos são recalculados automaticamente. **Quadra** = Aluguel mensal do campo; **Goleiros** = Nº de goleiros × Valor por goleiro × Jogos por mês com goleiros; **Arbitragem** = Arbitragem por jogo × Jogos por mês com arbitragem; **Churrasco** = Custo por pessoa × Pessoas (quantidade conforme “Churrascos por ano”); **Brindes** = reserva mensal dividida em **50% para o 1º, 30% para o 2º e 20% para o 3º**, acompanhando a demonstração. Mudar qualquer um desses campos atualiza na hora Visão Geral, Despesas, Fluxo de caixa e relatórios — não é preciso editar mês por mês. Eles aparecem marcados como “fixo” na tabela de Despesas. Lançamentos manuais dessas categorias não são sobrescritos: para virar fixo, apague o lançamento manual e salve Configurações novamente. Ao abrir **＋ Despesa**, escolher **Quadra** ou **Goleiros** já preenche valor e descrição com essas premissas; os atalhos **＋ Aluguel** e **＋ Goleiros** foram removidos da tabela.
- **Goleiros e arbitragem racha por racha:** em **Configurações → Horários da semana**, cada horário tem as opções **goleiros pagos** e **arbitragem paga**, ambas ligadas por padrão. Se você desligar uma delas, aquele racha deixa de entrar no cálculo da despesa correspondente. O valor de **Jogos por mês** é dividido entre os rachas ativos: com 4 jogos/mês e 2 rachas, desligar o goleiro em um deles reduz Goleiros de 4 para 2 jogos. Se todos estiverem desligados, a despesa some. A tabela de rachas mostra **Goleiros: sim/não · Árbitro: sim/não**; Visão Geral, Despesas, Fluxo de caixa, metas e relatórios acompanham o mesmo número.
- **Lançar churrasco em Despesas:** em **Configurações → Cenário e churrasco**, o botão **＋ Lançar churrasco em Despesas** cria um lançamento manual no mês atual com “custo por pessoa × nº de pessoas”. Ele não substitui a reserva automática dos churrascos por ano e pode ser editado ou apagado normalmente na aba Despesas. Fica desabilitado se a reserva estiver desativada ou se custo/pessoas estiverem zerados.
- **Limpar despesas:** em **Despesas**, cada linha tem uma caixa de seleção. Use **🧹 Limpar selecionados** para apagar só o que você marcou, com confirmação mostrando quantidade e total. O botão **🧹 Limpar todas** apaga todos os lançamentos da tabela, de todos os anos, depois de **duas confirmações**. Nenhum dos dois mexe em pagamentos, diárias, benefícios nem premiações. As despesas fixas voltam ao salvar **Configurações** novamente.
- **Premiações são só 1º, 2º e 3º lugares.** Os vencedores são automaticamente os **maiores pontuadores do mês** (mesmo cálculo da aba Pontuação): não há mais campos para melhor goleiro, fair play, craque etc. Para cada colocação você ajusta brinde, custo e se já foi entregue. O custo total soma as três colocações e entra em **Brindes** no fluxo de caixa. Premiações salvas manualmente ficam como você digitou; apenas os dados de demonstração continuam seguindo a reserva mensal (50% / 30% / 20%).
- Benefícios a mensalistas e brindes/premiações entram automaticamente no fluxo de caixa (não precisam ser duplicados em Despesas).
- Os cálculos de meta seguem a planilha: aluguel + goleiros + arbitragem + provisão do churrasco + reserva de brindes + metas mensais extras cadastradas. O KPI "Meta anual" soma a meta de cada mês, respeitando extras específicas.
- A reserva do churrasco pode ser **ligada/desligada** em Configurações → “Cenário e churrasco”. Desligada, ela sai da meta mensal e das linhas de reserva do fluxo de caixa e do painel; os valores configurados são preservados. A categoria `Churrasco` também desaparece dos KPIs de Despesas, do select de novos lançamentos, da tabela de fluxo e do CSV exportado. Lançamentos reais já existentes continuam contando nos totais e são exibidos como `Outros` (a descrição original é mantida).
- **Material e Brindes podem ser opcionais:** Material só entra no fluxo quando há lançamento. Na tabela e nos cartões grandes de **Despesas**, aparecem apenas as categorias com valor (Quadra e Goleiros ficam sempre, por serem a base do racha). Se você lançar uma despesa de `Arbitragem`, `Brindes` ou `Outros`, um novo cartão **total no ano** aparece junto com os outros. `Brindes` também é uma opção no campo **Categoria** de **Despesas** — ele soma o que foi cadastrado em **Premiações** com o que for lançado diretamente. Arbitragem e Churrasco agora são fixos quando há premissa cadastrada; sem premissa, você ainda pode lançar manualmente.
- **Despesa repetida:** no formulário de nova despesa, o campo **Repetir** cria vários lançamentos de uma vez: **Por jogo** (um por jogo do ano, com o valor informado por jogo), **Por mês** (12 lançamentos, janeiro a dezembro) ou **Ano todo** (um único lançamento com o valor total). Cada série aparece marcada como “repetição” na tabela e pode ser apagada inteira pelo botão 🧹; o 🗑️ continua apagando só a linha. Nas repetições **por mês** de **Quadra** e **Goleiros**, a descrição ganha o nome do mês (“Aluguel de Janeiro”, “2 goleiros × 4 jogos · Fevereiro” etc.). Isso prepara o terreno para transformar a categoria em despesa fixa, como Goleiros, no futuro.
- Este é um app de uso local: o dia a dia fica no navegador, mas a publicação do link do grupo envia uma cópia ao Netlify (ver seção **Links do grupo, do jogador e ao vivo**). Para sincronizar entre dispositivos, use o backup JSON.

## Instalar no celular (PWA)

O app é um **PWA**: pode ser instalado na tela inicial e abre em tela cheia, como um app nativo.

**Versão pública (HTTPS):** https://rachadololo.netlify.app — instalação sem senha; versão `v1.1.3` publicada em 27/11/2026 e verificada. O uso depende da assinatura. Use o endereço do GitHub Pages https://luzeus27.github.io/Racha-do-Lolo/ apenas como espelho, sem funções do servidor (ainda na versão antiga). Abra no celular e use **Adicionar à tela inicial**.

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

## Link de cobrança e baixa manual — como funciona

1. Em **Jogadores**, clique em **🔗** na linha do jogador.
2. O app mostra o valor, o mês, o **link de pagamento**, o **código PIX** (copia e cola) e o botão de WhatsApp.
3. Configure sua **chave PIX** em **Configurações → Financeiro** para gerar o código PIX manual e o PIX de doação.

   **Importante:** essa chave é o destino do **PIX manual** dos jogadores (mensalidade e diária) e cai direto na sua conta. Se você escolher Mercado Pago em **Pagamentos no link**, o jogador também poderá gerar PIX no Mercado Pago, pagar no cartão ou ativar cobrança automática; a chave continua valendo como alternativa. Nunca cole Access Token, client_secret, refresh token, `MASTER_SETUP_SECRET`, `REMINDER_SECRET` ou `RECONCILE_SECRET` no app, no GitHub ou na conversa.
4. Quem recebe o link vê o PIX com o valor da pendência, copia o código, paga no banco e envia o comprovante a você.
5. Você dá a baixa em **Configurações → Confirmação manual** (ou pelo botão **"Já recebi — dar baixa"** no modal de cobrança, quando o pagamento foi feito em dinheiro). Até a baixa, o jogador continua com a presença bloqueada.

## Comprovante de pagamento

Após qualquer baixa, o app gera automaticamente um **recibo com ID único** (ex.: `RL-2027-03-P1-ABCD`) contendo jogador, mês, valor, forma de pagamento, ID da transação, data/hora e status.

- Na **baixa pelo link**, o comprovante já aparece na própria tela de pagamento.
- Na **baixa pelo modal de cobrança**, ele abre automaticamente em uma janela.
- Em **Mensalidades**, clique na célula do mês pago e use **🧾 Comprovante** para revisar quando quiser.

O comprovante pode ser **copiado como texto**, **baixado em PNG** ou **salvo em PDF** pelo botão 🖨️ (abrir a caixa de impressão e escolher "Salvar como PDF").

**Importante:** o recibo é um **registro interno do app**. No **PIX manual**, o dinheiro cai na chave do administrador e quem confirma o pagamento é ele em **Confirmação manual** — inclusive no PRO/conta master vitalícia do proprietário; o app não reconhece depósitos pelo banco. No **Mercado Pago**, quem confirma é o webhook. A sincronização automática vale entre abas do mesmo navegador/dispositivo, onde os dados locais estão salvos.

---

## Assinatura recorrente (14 dias grátis + Básico/PRO)

O app tem uma estrutura completa de cobrança recorrente já integrada ao Mercado Pago; para funcionar, depende das variáveis de ambiente e do webhook configurados.

### Planos e preços

| Plano | Mensal | Anual | O que inclui |
|---|---:|---:|---|
| **Básico** | R$ 9,90 | R$ 99,00 | O app completo de hoje: jogos, presença, sorteio, pontuação, ranking, premiações, caixa, despesas, PIX, link do grupo, área do jogador, PDF, backup local e PWA. |
| **PRO** (antigo Intermediário) | R$ 19,90 | R$ 199,00 | Tudo do Básico + presença confirmada pelo jogador, backup JSON local com cópias automáticas no aparelho, link do grupo com validade configurável, lembretes automáticos, relatório mensal, identidade do racha na área do jogador e histórico de alterações. |

> Os nomes internos (`intermediate_monthly`/`intermediate_yearly`) e as variáveis `MP_PRICE_INTERMEDIATE_*` foram mantidos para não quebrar licenças já emitidas nem exigir renomeação de variáveis no Netlify. A mudança é **apenas comercial**: nome visível e preços.

O **período gratuito de 14 dias** libera todos os recursos dos dois planos. A **conta vitalícia é exclusiva do proprietário/desenvolvedor** (conta master), **não é vendida ao público** e fica com o nível PRO para sempre — sem cobrança e sem renovação. Ela existe apenas para você administrar/testar o serviço; nenhum cliente recebe esse plano no checkout. Os recursos antes chamados de “check-in automático” continuam disponíveis como **presença confirmada pelo jogador**, sem baixar pagamento. Um futuro plano ainda mais avançado (senha no link, domínio próprio e vários rachas) fica guardado para depois.

### Como funciona para quem usa

1. Ao abrir o app pela primeira vez, começa o **período gratuito de 14 dias**, sem cartão.
2. Em **Assinatura**, o usuário escolhe **Básico ou PRO**, **mensal ou anual**, informa o e-mail e é levado ao Mercado Pago.
3. O Mercado Pago faz a primeira cobrança e, a partir daí, renova automaticamente.
4. Ao voltar para o app, a licença é confirmada por um aviso automático (webhook). Se estiver offline, o app aceita até **3 dias** sem conexão.
5. Se o período gratuito acabar sem assinatura, o app entra em **modo somente leitura**: dados, backup e comprovantes continuam acessíveis, mas novos cadastros e edições ficam bloqueados.
6. Cada assinatura gera uma **chave de licença** (ex.: `RL-1A2B3C4D5E6F`), copiável na tela Assinatura. A chave fica vinculada ao aparelho onde a assinatura foi feita — se alguém tentar usá-la em outro dispositivo, o acesso é bloqueado até o titular confirmar o e-mail da compra no aparelho novo.
7. Para trocar de celular, abra **Assinatura** no novo aparelho, digite a chave e informe o **e-mail usado no checkout**: o vínculo é transferido (uma licença ativa por aparelho por vez).
8. O próprio titular pode cancelar a recorrência em **Assinatura → Cancelar assinatura**. O acesso continua até o fim do período já pago, sem multa, conforme o CDC (art. 49 garante 7 dias de arrependimento).

### Upgrade do Básico para o PRO

Cliente com **Básico ativo** vê em **Assinatura → Minha chave de licença** o botão **⚡ Fazer upgrade para o PRO**. O passo a passo dentro do app mostra o valor atual, o novo valor e explica que:

- a **mesma chave `RL-`** e o mesmo aparelho continuam valendo;
- a **mesma assinatura** do Mercado Pago é alterada — não nasce uma segunda assinatura;
- **não há cobrança dupla** e a data da próxima cobrança é mantida;
- só é permitido o upgrade de **mensal → PRO mensal** ou **anual → PRO anual**, porque a frequência da assinatura não pode ser mudada na API do Mercado Pago;
- para trocar mensal por anual (ou o contrário), o titular cancela a renovação e assina no novo ciclo.

O servidor usa `change-plan.mjs`: valida chave, aparelho e licença ativa, chama `PUT /preapproval/{id}` para alterar `auto_recurring.transaction_amount`, grava o novo `plan`/`amount` no Blobs e deixa o webhook sincronizar o restante. Se a API do Mercado Pago falhar, nada é alterado no app.

### Modalidades de pagamento da assinatura

A assinatura do **app** é sempre recorrente e passa pelo checkout do Mercado Pago. Não existe um modo separado de “PIX avulso mensal” para a licença; o **PIX manual do app** serve para a mensalidade/diária dos jogadores, não para a assinatura do administrador.

- **Mensal (R$ 9,90 ou PRO R$ 19,90):** o cliente escolhe o meio no checkout do Mercado Pago e as cobranças seguintes acontecem automaticamente na data da primeira compra.
- **Anual (R$ 99,00 ou PRO R$ 199,00):** mesmo fluxo, com uma cobrança a cada 12 meses. O meio (PIX, cartão, dinheiro em conta ou boleto) depende do que estiver habilitado na conta Mercado Pago.
- **Cartão recorrente:** é o caminho tradicional — o cliente cadastra/confirma o cartão uma vez e o Mercado Pago cobra sozinho a cada ciclo.
- **Pix recorrente:** depende do suporte a Pix/Pix Automático habilitado na conta Mercado Pago e da autorização do cliente. O app não força um meio específico: ele deixa o checkout do Mercado Pago oferecer as opções válidas.

> Se você quiser oferecer **somente cartão** ou **somente Pix**, isso é configurado na conta Mercado Pago / no plano de assinatura, não neste código. Nunca coloque tokens ou segredos no app.

### Falar com o Administrador

A tela **Assinatura** tem o botão **✉️ Falar com o Administrador**. Ele abre `contato.html` em outra aba, com campos para nome, e-mail de resposta, mensagem e **uma foto opcional (até 7 MB)**. O envio usa **Netlify Forms**: o formulário está declarado diretamente no HTML (`name="contato-admin"`, `data-netlify="true"`) e o JavaScript manda `FormData` para `/` sem definir `Content-Type`, para o navegador gerar o `multipart/form-data`. Se o envio falhar, a página oferece um link `mailto:` com o texto já preenchido — nesse caso o cliente anexa a foto manualmente no aplicativo de e-mail.

> Configuração única no Netlify: em **Forms → Enable form detection**, ativar e publicar de novo; depois, em **Forms → contato-admin → Notifications**, cadastrar **rachadololo@gmail.com** como e-mail que recebe as mensagens. Sem isso, o formulário aparece mas não entrega. O destinatário é escolhido no painel do Netlify, nunca no código — não coloque e-mail ou senha de e-mail em variáveis do navegador.

### Comunidade por cidade

A navegação lateral tem a aba **🌍 Comunidade**, que abre a página **dentro do próprio app** (sem nova janela). O HTML continua em `comunidade.html` para o Netlify Forms detectar os formulários; o app lê esse HTML e usa o mesmo código de `comunidade.js`. A página tem dois caminhos:

1. **Minha cidade é capital** — o assinante escolhe o estado; a capital correspondente aparece sozinha no seletor e já conta como grupo existente. Ele só preenche nome do racha (e, se quiser, os **4 últimos dígitos** da chave `RL-`) e toca em **Pedir acesso**.
2. **Minha cidade não é capital** — ele digita `cidade - UF` (ex.: `Arapiraca - AL`) no campo separado e toca em **Pedir criação da cidade**. O pedido vai para `rachadololo@gmail.com`; o administrador cria o grupo e depois adiciona a pessoa **na mão**. Nenhum convite fica exposto no app.

> As 27 capitais estão no código (`CAPITAIS`) e já têm grupo cadastrado, mas o pedido ainda é analisado pelo administrador. O arquivo `comunidade.json` registra apenas cidades **não capitais** já criadas pelo administrador (array de `{ "uf", "cidade", "nome", "descricao" }`); quando o cliente digita uma dessas cidades, aparece a opção **Pedir acesso a esta cidade**. Os dois formulários (`comunidade-acesso` e `comunidade-criacao`) usam Netlify Forms e são cobertos pela notificação já cadastrada para `rachadololo@gmail.com`.

### Páginas legais

- [Termos de Uso](termos.html)
- [Política de Privacidade](privacidade.html)

Elas já explicam renovação, cancelamento, o direito de arrependimento de 7 dias (CDC, art. 49) e o tratamento dos dados.

### O que já está pronto no código

| Arquivo | Função |
|---|---|
| `subscription.js` | Controla trial, chave de licença, tolerância offline e a interface de status |
| `netlify/functions/create-checkout.mjs` | Cria a assinatura no Mercado Pago e devolve o link de pagamento |
| `netlify/functions/mp-webhook.mjs` | Recebe a confirmação do Mercado Pago, grava o status da licença e baixa as cobranças dos jogadores no modo MP |
| `netlify/functions/mp-connect.mjs` | Vincula a conta do administrador em um clique (OAuth); code/token/refresh ficam no servidor |
| `netlify/functions/license.mjs` | Consulta se a chave está ativa, valida o aparelho e transfere o vínculo mediante o e-mail do titular |
| `netlify/functions/cancel-subscription.mjs` | Cancela a recorrência no Mercado Pago a pedido do titular |
| `netlify/functions/create-master.mjs` | Cria a licença vitalícia do administrador (protegida por segredo) |
| `netlify/functions/revoke-view.mjs` | Revoga o link do grupo e invalida tokens VW/VP imediatamente |
| `netlify/functions/_shared.mjs` | Configuração compartilhada (Blobs, preços, CORS, chamadas à API, validade do link) |
| `netlify.toml` | Habilita as funções e define Node 20 |
| `package.json` | Instala a biblioteca `@netlify/blobs` usada pelas funções |

### Configuração única (o que falta fazer no painel)

#### 1. Mercado Pago

1. Entre em **Suas integrações** no portal de desenvolvedores do Mercado Pago e crie uma aplicação.
2. Copie o **Access Token de produção** (ou o de teste, para os primeiros testes). Ele continua sendo usado para a **assinatura do app**.
3. Em **Webhooks > Configurar notificações**, cadastre a URL:
   `https://rachadololo.netlify.app/.netlify/functions/mp-webhook`
   e marque os eventos de **Assinaturas** (`subscription_preapproval`), **Pagamentos** (`payment`) e **Cobranças de assinatura** (`subscription_authorized_payment` / `invoice`). Sem eventos de pagamento, a baixa automática dos jogadores não funciona.
4. Copie a **chave secreta do webhook** gerada pelo Mercado Pago. Ela serve para confirmar que a notificação realmente veio dele.
5. No mesmo aplicativo, cadastre a **URL de redirecionamento OAuth** exatamente como:
   `https://rachadololo.netlify.app/.netlify/functions/mp-connect`
6. Copie o **Client ID** e o **Client Secret** dessa aplicação. O cliente não copia nada: ele só toca em **Conectar com Mercado Pago** no app e autoriza. O código, o token e o refresh ficam no servidor e são salvos no Blob da licença; o navegador recebe somente um status (e-mail mascarado, por exemplo). O token do vendedor dura 180 dias e é renovado sozinho quando perto do vencimento.

#### 2. Netlify

No projeto **rachadololo**, abra **Project configuration > Environment variables** e adicione:

| Variável | Valor |
|---|---|
| `MP_ACCESS_TOKEN` | O Access Token copiado do Mercado Pago |
| `MP_WEBHOOK_SECRET` | A chave secreta do webhook |
| `MP_PRICE_MONTHLY` | Preço do **Básico mensal** em reais (padrão: `9.9`). Configure `9.9` explicitamente para não depender do padrão. |
| `MP_PRICE_YEARLY` | Preço do **Básico anual** em reais (padrão: `99`). Configure `99` explicitamente para não depender do padrão. |
| `MP_PRICE_INTERMEDIATE_MONTHLY` | Preço do **PRO mensal** (padrão: `19.9`). O nome da variável continua o mesmo; configure com `19.9`. |
| `MP_PRICE_INTERMEDIATE_YEARLY` | Preço do **PRO anual** (padrão: `199`). Configure com `199`. |
| `MP_CLIENT_ID` | Client ID do aplicativo Mercado Pago, usado no botão **Conectar com Mercado Pago** |
| `MP_CLIENT_SECRET` | Client Secret do mesmo aplicativo. Nunca vai para o navegador |
| `MP_REDIRECT_URI` | Opcional. Só configure se for diferente de `https://rachadololo.netlify.app/.netlify/functions/mp-connect` |
| `MP_CARD_FEE` | Taxa do cartão quando o administrador escolhe Mercado Pago (padrão `4.98` = 4,98%). O valor cobrado é `líquido / (1 - taxa)`, arredondado para cima |
| `PLAYER_PAYMENTS` | Opcional. Deixe sem configurar = `manual`. Só use `mp` como padrão global se quiser forçar todos os links; a escolha por cliente já basta. |
| `SITE_URL` | `https://rachadololo.netlify.app` |
| `ALLOWED_ORIGINS` | Opcional. Outras origens autorizadas a chamar as funções, separadas por vírgula |
| `LICENSE_GRACE_DAYS` | Opcional. Dias de tolerância após o vencimento (padrão: `3`) |
| `RECONCILE_SECRET` | Opcional. Segredo para disparar `reconcile-licenses` manualmente pelo header `x-reconcile-secret` |
| `MASTER_SETUP_SECRET` | **Obrigatória** para criar conta master (licença vitalícia). Não reaproveita mais a chave do webhook. |
| `REMINDER_SECRET` | Opcional. Segredo para disparar `send-reminders` manualmente pelo header `x-reminder-secret`. |

Esses segredos — `MP_ACCESS_TOKEN`, `MP_CLIENT_SECRET`, `MP_WEBHOOK_SECRET`, `MASTER_SETUP_SECRET`, `REMINDER_SECRET` e `RECONCILE_SECRET` — ficam **só no Netlify**, nunca no navegador.

Depois de salvar, faça um novo deploy (ou dispare um **Trigger deploy**) para as variáveis valerem.

> Enquanto `MP_ACCESS_TOKEN` não estiver configurado, os botões de assinatura aparecem desativados e o app funciona normalmente no modo gratuito — nada quebra.

#### 3. Teste antes de cobrar de verdade

1. Use um **Access Token de teste** e uma conta de comprador de teste do Mercado Pago.
2. Clique em **Assinar mensal**, informe o e-mail de teste e conclua o pagamento com um cartão de teste.
3. Confira se a chave aparece em **Assinatura** e se o banner muda para **Assinatura ativa**.
4. Só depois disto troque para o token de produção.

### Observações importantes

- **O GitHub Pages é apenas um espelho.** Ele serve os arquivos estáticos, mas não roda funções. Para assinar, use sempre o endereço do Netlify. O app detecta isso e avisa.
- **O uso diário continua local, mas a publicação envia uma cópia ao servidor.** Ao gerar o link do grupo, o app manda ao Netlify Blobs um retrato com jogadores (nome, posição e tipo), fotos, valores/regras/configurações, logo, textos de lembrete, telefones e tokens `VP-` — telefones e tokens ficam na parte privada e nunca aparecem no retrato público. A assinatura não sincroniza jogadores nem valores entre dispositivos; use o backup JSON para isso. Veja a [Política de Privacidade](privacidade.html).
- **O bloqueio real fica no servidor.** Como o repositório é público, alguém pode copiar o código, mas sem uma chave de licença válida (confirmada pelo webhook) não consegue liberar a edição no site publicado.
- **Nunca coloque segredos dentro do `app.js` ou de outro arquivo do site.** `MP_ACCESS_TOKEN`, `MP_CLIENT_SECRET`, `MP_WEBHOOK_SECRET`, `MASTER_SETUP_SECRET`, `REMINDER_SECRET` e `RECONCILE_SECRET` ficam apenas nas variáveis de ambiente do Netlify, nunca no navegador.
- **Conta master (vitalícia):** `netlify/functions/create-master.mjs` cria uma licença sem cobrança para o administrador. O endpoint exige o segredo `MASTER_SETUP_SECRET`, que é **obrigatório** — não reaproveita mais a chave secreta do webhook. Ela nunca aparece no checkout dos clientes.

### Segurança do backend

- **URLs de pagamento fixas:** `back_url` e `notification_url` saem sempre de `SITE_URL`/`URL` (variáveis do servidor). O header `Origin` enviado pelo navegador nunca é usado, então um visitante não consegue redirecionar o retorno do checkout.
- **CORS restrito:** as funções só refletem origens permitidas (site principal, espelho do GitHub Pages, `localhost` para testes e o que estiver em `ALLOWED_ORIGINS`). O cabeçalho `Vary: Origin` evita cache indevido.
- **Webhook à prova de falha:** sem `MP_WEBHOOK_SECRET`, o endpoint responde `503` e não aceita nenhuma notificação. A assinatura HMAC é sempre verificada com `timingSafeEqual` e janela de 10 minutos.
- **Estorno e chargeback:** revogam o acesso imediatamente. Reassinar depois de cancelar limpa o pedido antigo e libera a licença no novo período.
- **Limite de requisições:** checkout, consulta de licença, respostas do grupo, identificação do jogador e publicação do retrato têm limite por IP (com `429` e `Retry-After`), evitando abuso sem atrapalhar o uso normal. A identificação por 4 dígitos do telefone continua sem ser prova forte de identidade; por isso o link `VP-` vai só ao dono do aparelho e, no PIX manual, a baixa depende do administrador.
- **Reconciliação diária:** `reconcile-licenses.mjs` consulta o Mercado Pago às 03h e corrige o status das assinaturas caso algum webhook não tenha chegado. Para disparar manualmente, configure `RECONCILE_SECRET` e envie `x-reconcile-secret`.
- **Headers de segurança:** CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` e HSTS são aplicados pelo `netlify.toml` a todas as páginas.

### Testes automáticos das funções de pagamento

`tests/mp-flows.test.html` roda **139 checagens** no navegador, sem deploy, sem chaves reais e sem mexer nos dados do racha. Ele cobre: taxa e modo de pagamento, vínculo OAuth em um clique, PIX/cartão/cobrança automática da diária e da mensalidade, webhook (assinatura, duplicidade, estorno, valor divergente), respostas do jogador, link vencido/revogado, isolamento da taxa do fluxo de caixa, LGPD, o upgrade Básico → PRO sem segunda assinatura, a comunidade por cidade com pedido de acesso fechado, o ajuste manual das equipes depois do sorteio, as estatísticas de goleiro/zagueiro, o relatório mensal em CSV e os cargos com mensalidade própria.

Como o navegador bloqueia leitura de arquivos `file://`, use o servidor local incluído:

```
powershell -ExecutionPolicy Bypass -File tests\servir-testes.ps1
```

Depois abra `http://localhost:8765/tests/mp-flows.test.html`. O resultado esperado é **“Todos os 130 testes passaram”** (25 grupos, incluindo bloqueio por tentativas, deduplicação do webhook, segredo da conta master, proteção das funções agendadas, LGPD/dupla confirmação, o plano PRO com R$ 19,90/R$ 199, o upgrade sem cobrança dupla, a troca de aparelho pelo próprio titular, o formulário de contato com foto, a comunidade abrindo dentro do app, com capitais já disponíveis, pedido de criação para outras cidades e leitura offline, o ajuste manual das equipes depois do sorteio, o placar ao vivo com 3 a 6 equipes, o bloqueio de escrita com assinatura vencida sem travar consultas, o menu mobile, as estatísticas de goleiro/zagueiro, o relatório mensal em CSV, os cargos da diretoria e as despesas/dívidas de outros anos). Para encerrar o servidor, pressione **Ctrl+C** na janela do PowerShell.

> **Regra do caixa verificada nos testes:** `cardGross(60) = 63,15` é o valor cobrado do jogador, mas `amount`, `paidAmount`, `revenue()`, KPIs, CSV e o retrato do grupo continuam em **R$ 60,00**. O bruto e a taxa ficam só no registro privado do servidor. Se o administrador digitar o valor bruto no campo “Valor pago”, o app registra o líquido; linhas de extrato com descrição de taxa/tarifa do Mercado Pago não são importadas como despesa.

### Lembretes 100% automáticos no grupo (opcional — não implementado)

O link `wa.me` abre o WhatsApp, mas sempre exige o toque final de envio. Em navegadores antigos (como o navegador interno do OpenCode), o WhatsApp Web pede para atualizar o Chrome; nesses casos use o botão **📋 Copiar p/ WhatsApp**. Ele copia o mesmo link e, se o navegador não permitir a cópia automática, abre o link já marcado para você dar **Ctrl+C** e colar no Chrome/Edge. Para disparar sem intervenção é preciso da **WhatsApp Business Cloud API** com a **Groups API** da Meta (`recipient_type: group` e um `group_id`). Isso exige:

- conta **Meta Business verificada** e número de telefone **dedicado** — não pode ser o WhatsApp pessoal do administrador;
- token com permissão de mensagens e o grupo criado/gerenciado por esse número (o grupo atual precisaria ser migrado);
- templates aprovados e cobrança por mensagem/conversa. A proposta em `docs/proposta-chatbot-whatsapp.md` estima **R$ 0–300/mês**.

Até lá, o aviso **📢 Grupo** do painel resolve com um toque. **Não use bots de WhatsApp Web** (Evolution, wa-automation e similares): violam os termos do WhatsApp e podem banir o número.
