# Checklist de segurança — Racha do Loló

Versão enxuta, montada após a análise dos vídeos do Instagram. Atualizado em 27/11/2026.
Regra: só entra o que passou pelo filtro "serve para o nosso app".

## Bloqueante — não vender antes disso

- [x] **Deploy de produção liberado e publicado em 27/11/2026** (plano Netlify **Personal** ativo). Conferido no ar: home abre em `v1.1.3`; `visualizar.html`, `jogador.html`, `ao-vivo.html`, `comunidade.html` e `contato.html` respondem **200**; cabeçalhos de segurança do `netlify.toml` presentes; `sw.js` e a função de licença respondem; bateria local **148/148** (27 grupos) sem erro de console. `scripts/security-check.ps1` é somente leitura e não existe um script separado só de deploy. O espelho do GitHub Pages também está em `v1.1.3`.

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

### Lote 5 — concluído em 27/11/2026

- [x] `mp-webhook` valida a assinatura HMAC **antes** de consultar o Mercado Pago ou gravar no Blobs, e aplica limite de requisições. Sem segredo, sem assinatura válida ou com o Blobs de limite fora, nenhuma notificação é processada.
- [x] `mp-webhook` aceita apenas GET e POST (o Mercado Pago notifica pelos dois); PUT/DELETE e outros verbos recebem 405.
- [x] `reconcile-licenses`, `send-reminders` e a transferência de aparelho em `license` comparam segredo/e-mail do titular com `timingSafeEqual`, e as duas funções agendadas também têm limite de requisições.
- [x] Corpo `null` em `create-checkout`, `create-master`, `cancel-subscription`, `change-plan` e `publish-view` devolve 400, sem exceção não tratada.
- [x] Mensagens de erro das funções de pagamento não devolvem `err.message` de rede (detalhe de DNS/proxy/endereço interno).
- [x] Respostas de nota e de resposta do jogador conferem se o `gameId` existe no retrato publicado.
- [x] Respostas 204 do preflight também saem com `Cache-Control: no-store`.

### Lote 6 — auditoria final aplicada localmente em 27/11/2026

- [x] Trava atômica (`racha-cobrancas-lock`) em PIX/cartão mensal e diário: duas chamadas simultâneas devolvem 409 em vez de criar duas cobranças.
- [x] `mp-webhook` usa `onlyIfNew` para deduplicar eventos de forma atômica, libera a reserva do evento e devolve **502** se a consulta ao Mercado Pago falhar (o MP reentrega).
- [x] Estorno devolve crédito ao jogador, `amountWarning` é limpo e a reassinatura após cancelamento volta a liberar acesso.
- [x] BR Code do PIX manual gera bytes EMV ASCII, aceita chave longa/acentuada e mantém CRC16 válido.
- [x] `qr_code_base64` é reaproveitado quando o MP não devolve `qr_code`, e `jogador.js` mostra a imagem do QR.
- [x] Lembretes usam `America/Sao_Paulo` para data/24h/2h; nota só é aceita para jogo já realizado.
- [x] Confirmação manual respeita a capacidade (`hasSlot`); resposta “Vou jogar” no PIX manual cria reserva de vaga sem marcar presença.
- [x] IDs de backup/`storage` são sanitizados, atributos `data-*` usam `esc()`, cores são validadas como hex e fotos passam por allowlist (`data:image/(png|jpeg|webp)` ou `blob:` local).
- [x] Importar backup e desativar cobrança automática pedem confirmação explícita.
- [x] `script-src` trocou `unsafe-inline` por hashes SHA-256 dos scripts inline (mais `unsafe-hashes` para o único `onclick` de impressão).
- [x] Bateria ampliada para **148 testes em 27 grupos**, sem erro de console.

## Não se aplica ou não vale a pena agora

- **SQL injection**: não existe banco SQL no projeto.
- **Prompt injection**: o site publicado não usa IA; a IA atua só no desenvolvimento.
- **"Banco aberto" estilo Supabase**: não usamos Supabase; a proteção equivalente (checagem de licença/token nas funções) já existe.
- **Strix / OpenVAS / wp-scan**: guardar para depois. O Strix é sério, mas exige Docker, chave de modelo e faz testes agressivos. O wp-scan é só para WordPress (nosso app não é). Nenhum dos dois deve ser apontado para produção sem acompanhamento.
- **Cursos e "skills BLINDAGEM"**: não comprar por medo. O que serve ali nós já revisamos e podemos rever de graça aqui.

## Pendente no painel (deploy já conferido em 27/11/2026)

1. Confirmar que `https://rachadololo.netlify.app` abre e que `visualizar.html`, `jogador.html` e `ao-vivo.html` não dão 404.
2. Rodar `scripts/security-check.ps1` (ou conferir a tarefa do Windows **Racha do Lolo - Seguranca**, verificada em 26/11/2026 como habilitada e diária às **09:30**). Ele confere home, as três páginas, os cabeçalhos de segurança, funções com token inválido, segredos no código e o domínio antigo. Ele grava `relatorio-seguranca.txt` na raiz do projeto **somente quando as páginas respondem 200** — com o deploy atual ele encerra sem gravar. É **somente leitura**: não ataca, não envia formulário, não muda nada. Não existe um script separado só de deploy.
3. Testar no celular, na prática: link do grupo, link individual, confirmação de presença, placar ao vivo e lembretes com as frases editáveis.
4. Verificar se existe webhook **global** no painel do Mercado Pago; se existir, apontá-lo para `https://rachadololo.netlify.app/.netlify/functions/mp-webhook`.
5. Confirmar que o domínio antigo `teal-griffin-a37fbe.netlify.app` continua fora do ar.
6. Testar os pagamentos: mensalista com pendência vê “Pagar mensalidade”, gera o PIX, paga e só é liberado após a baixa do administrador; diarista gera o PIX, paga e **também** só é baixado pelo administrador, inclusive no PRO. No Mercado Pago, quem confirma é o webhook. Testar cancelar um jogo escolhendo crédito e depois estorno. Testar também a confirmação manual: marcar presença e pagamento de um mensalista e de um diarista sem PIX e conferir que o link do jogador atualiza.
7. Se o relatório mostrar `FALHA`, me mandar a linha exata — eu corrijo.

## Regras permanentes

- Nunca colar tokens, senhas ou chaves na conversa, nem em print; variáveis só nos painéis.
- Não comercializar para terceiros ainda; o visualizador é benefício incluído para assinantes/compradores. Só vender depois de vincular a conta Mercado Pago, cadastrar variáveis, configurar o webhook e testar em sandbox.
- Upgrade Netlify **Personal** contratado em 27/11/2026 (US$ 9/mês, auto recharge desligado). Não contratar mais nada sem autorização.
- Manter abertas apenas as abas realmente em uso.

## Agendamento

A tarefa do Windows existe e estava habilitada em 25/11/2026, com execução diária às 09:30. O relatório `relatorio-seguranca.txt` só é gravado quando as quatro páginas (home + três páginas do link) respondem `200`.

- Ver task: `schtasks /query /tn "Racha do Lolo - Seguranca"`
- Cancelar: `schtasks /delete /tn "Racha do Lolo - Seguranca" /f`
- Rodar agora, manualmente: `powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\CONTA\OneDrive\Documentos\Projeto Padrão\scripts\security-check.ps1"`
