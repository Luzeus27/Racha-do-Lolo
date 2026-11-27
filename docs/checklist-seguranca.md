# Checklist de segurança — Racha do Loló

Versão enxuta, montada após a análise dos vídeos do Instagram. Atualizado em 25/11/2026.
Regra: só entra o que passou pelo filtro "serve para o nosso app".

## Bloqueante — não vender antes disso

- [ ] **Deploy de produção pausado por créditos da Netlify.** A versão publicada está desatualizada: `visualizar.html`, `jogador.html` e `ao-vivo.html` ainda dão **404** no ar. É obrigatório **publicar a versão atual** e conferir: (1) home abre; (2) as três páginas abrem sem 404; (3) os cabeçalhos de segurança do `netlify.toml` aparecem; (4) as funções novas respondem. Quem faz essa verificação é `scripts/security-check.ps1` (somente leitura); não existe um script separado só de deploy.

## Já está feito — não refazer

- [x] `MP_ACCESS_TOKEN`, `MP_CLIENT_SECRET`, `MP_WEBHOOK_SECRET`, `MASTER_SETUP_SECRET`, `REMINDER_SECRET` e `RECONCILE_SECRET` **só** nas variáveis da Netlify (nada no app, nada no navegador, nada no GitHub). `MASTER_SETUP_SECRET` é obrigatória para criar conta master; não reaproveita mais a chave do webhook.
- [x] Link do grupo `VW-` separado dos links individuais `VP-`.
- [x] Telefones, PIX, comprovantes, observações, despesas individuais e frases de lembrete **fora** do retrato público.
- [x] `get-view` e `get-player-view` devolvem só campos permitidos (lista branca).
- [x] Publicar exige licença ativa e dispositivo vinculado.
- [x] Limite de requisições nas funções do servidor. As funções sensíveis têm limite e, se o Blobs falhar, a requisição é **recusada** (falha fechada) em vez de liberar o excesso. A identificação do jogador também bloqueia por 15 minutos após 5 erros com o mesmo nome/IP, com mensagem igual para nome e número errados.
- [x] O clique do jogador **nunca** baixa pagamento: no PIX manual a baixa é sempre do administrador, inclusive no PRO e na conta master vitalícia do proprietário; no Mercado Pago a baixa vem do webhook, que agora deduplica eventos repetidos e exige que o parâmetro `?cliente=` pertença ao dono do registro.
- [x] Conta master exige `MASTER_SETUP_SECRET` própria (não reaproveita a chave do webhook); funções agendadas exigem o identificador de agendamento além do corpo `next_run`.
- [x] Webhook com assinatura HMAC e reconciliação diária com o Mercado Pago.
- [x] Cabeçalhos de segurança + HSTS no `netlify.toml`.
- [x] Validade e revogação do link, com troca automática do token na próxima publicação.
- [x] Backup JSON e auditoria local das ações do administrador.
- [x] Área do jogador sem senha, com limite de tentativas no servidor; identificação por 4 dígitos do telefone + nome ou link `VP-` não é prova forte de identidade — o link individual vai só ao dono do aparelho.
- [x] No PIX manual, o clique do jogador nunca baixa pagamento: a baixa é sempre do administrador, inclusive no PRO e na conta master vitalícia do proprietário. No Mercado Pago, a baixa vem pelo webhook.
- [x] Pagamentos no link: tipo do jogador, PIX e créditos ficam só no servidor; cada jogador vê apenas o próprio PIX.
- [x] Webhook valida assinatura, valor e vagas; cancelamento do jogo oferece crédito ou estorno.
- [x] Mensalista com pendência não confirma: o servidor exige o PIX da mensalidade e dá baixa só após aprovação — webhook no Mercado Pago ou baixa do administrador no PIX manual.
- [x] Confirmação manual do administrador marca presença e/ou pagamento no link, com licença ativa e registro de quem fez a baixa.
- [x] App em HTML/CSS/JS puro no navegador, sem bibliotecas no front-end; uma dependência no backend (`@netlify/blobs`).
- [x] LGPD: telefone do jogador é opcional; não há dados pessoais completos em logs; a política cita o WhatsApp/Meta como terceiro de envio **manual** e traz o procedimento de incidente com comunicação à ANPD em prazo razoável, conforme a LGPD e a regulamentação da ANPD. O botão **Apagar tudo** pede duas confirmações.
- [x] Upgrade Básico → PRO usa a mesma chave e a mesma `subscriptionId`: o servidor valida dispositivo, licença ativa e ciclo, altera o valor com `PUT /preapproval/{id}` e não cria segunda assinatura; a confirmação final do valor depende do Mercado Pago.

## Não se aplica ou não vale a pena agora

- **SQL injection**: não existe banco SQL no projeto.
- **Prompt injection**: o site publicado não usa IA; a IA atua só no desenvolvimento.
- **"Banco aberto" estilo Supabase**: não usamos Supabase; a proteção equivalente (checagem de licença/token nas funções) já existe.
- **Strix / OpenVAS / wp-scan**: guardar para depois. O Strix é sério, mas exige Docker, chave de modelo e faz testes agressivos. O wp-scan é só para WordPress (nosso app não é). Nenhum dos dois deve ser apontado para produção sem acompanhamento.
- **Cursos e "skills BLINDAGEM"**: não comprar por medo. O que serve ali nós já revisamos e podemos rever de graça aqui.

## Quando o deploy voltar (retorno previsto após 17/12/2026, se houver upgrade)

1. Confirmar que `https://rachadololo.netlify.app` abre e que `visualizar.html`, `jogador.html` e `ao-vivo.html` não dão 404.
2. Rodar `scripts/security-check.ps1` (ou conferir a tarefa do Windows **Racha do Lolo - Seguranca**, verificada em 26/11/2026 como habilitada e diária às **09:30**). Ele confere home, as três páginas, os cabeçalhos de segurança, funções com token inválido, segredos no código e o domínio antigo. Ele grava `relatorio-seguranca.txt` na raiz do projeto **somente quando as páginas respondem 200** — com o deploy atual ele encerra sem gravar. É **somente leitura**: não ataca, não envia formulário, não muda nada. Não existe um script separado só de deploy.
3. Testar no celular, na prática: link do grupo, link individual, confirmação de presença, placar ao vivo e lembretes com as frases editáveis.
4. Verificar se existe webhook **global** no painel do Mercado Pago; se existir, apontá-lo para `https://rachadololo.netlify.app/.netlify/functions/mp-webhook`.
5. Confirmar que o domínio antigo `teal-griffin-a37fbe.netlify.app` continua fora do ar.
6. Testar os pagamentos: mensalista com pendência vê “Pagar mensalidade”, gera o PIX, paga e só é liberado após a baixa do administrador; diarista gera o PIX, paga e **também** só é baixado pelo administrador, inclusive no PRO. No Mercado Pago, quem confirma é o webhook. Testar cancelar um jogo escolhendo crédito e depois estorno. Testar também a confirmação manual: marcar presença e pagamento de um mensalista e de um diarista sem PIX e conferir que o link do jogador atualiza.
7. Se o relatório mostrar `FALHA`, me mandar a linha exata — eu corrijo.

## Regras permanentes

- Nunca colar tokens, senhas ou chaves na conversa, nem em print.
- Não comercializar para terceiros ainda; o visualizador é benefício incluído para assinantes/compradores. Só vender depois de concluir o bloqueante do topo.
- Não fazer upgrade do Netlify só por causa do aviso de créditos.
- Manter abertas apenas as abas realmente em uso.

## Agendamento

A tarefa do Windows existe e estava habilitada em 25/11/2026, com execução diária às 09:30. O relatório `relatorio-seguranca.txt` só é gravado quando as quatro páginas (home + três páginas do link) respondem `200`.

- Ver task: `schtasks /query /tn "Racha do Lolo - Seguranca"`
- Cancelar: `schtasks /delete /tn "Racha do Lolo - Seguranca" /f`
- Rodar agora, manualmente: `powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\CONTA\OneDrive\Documentos\Projeto Padrão\scripts\security-check.ps1"`
