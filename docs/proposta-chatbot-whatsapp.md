# Proposta externa — Chatbot de atendimento no WhatsApp (fora do escopo do Racha do Loló)

> Documento de outro projeto, mantido só como referência. Não implementado nem integrado ao Racha do Loló; existe apenas um protótipo local em `../prototipo-chatbot/`.

**Cenário:** uma empresa, canal WhatsApp, com transferência para atendimento humano.
**Status:** proposta externa, sem integração em produção.
**Data:** novembro/2026.

---

## 1. Objetivo

Automatizar o primeiro atendimento no WhatsApp da empresa: responder dúvidas frequentes, qualificar o contato e encaminhar para um atendente humano quando necessário — 24 horas por dia, sem perder o tom de voz da marca.

**Metas de sucesso (primeiros 90 dias):**

| Indicador | Meta inicial |
|---|---|
| Conversas resolvidas sem humano | ≥ 50% |
| Tempo da primeira resposta | < 10 segundos |
| Transferências com contexto (histórico anexado) | 100% |
| Satisfação (CSAT pós-atendimento) | ≥ 4,0 / 5 |

---

## 2. Escopo do protótipo

### Dentro do escopo

1. **Recepção automática** — saudação personalizada, menu leve e identificação do assunto.
2. **Respostas com base de conhecimento** — horários, endereço, serviços, preços, prazos, políticas de troca/cancelamento, formas de pagamento.
3. **Qualificação de lead** — nome, necessidade e contato registrados automaticamente.
4. **Transferência para humano** — botão/palavra-chave ("atendente", "humano") e escalonamento automático quando a IA não souber responder.
5. **Histórico unificado** — o atendente vê tudo o que o bot conversou antes de assumir.
6. **Painel administrativo** — editar base de conhecimento, ver conversas, métricas e pausar o bot.
7. **Conformidade LGPD** — aviso de atendimento automatizado, política de privacidade, retenção configurável e exclusão sob solicitação.

### Fora do escopo (fase 2)

- Pagamentos e cobranças dentro do chat.
- Agendamento com calendário integrado.
- Campanhas/mensagens em massa (marketing ativo).
- Integração com CRM/ERP.
- Catálogo nativo do WhatsApp e carrinho.
- Atendimento por voz/áudio e múltiplos números.
- Vários atendentes simultâneos com filas e SLA.

---

## 3. Arquitetura proposta

```
Cliente (WhatsApp)
      │
      ▼
WhatsApp Business Cloud API (Meta)
      │  webhook HTTPS
      ▼
Netlify Function  ──►  Orquestrador
 (valida assinatura)      │
                          ├─► Banco (Postgres/Supabase): contatos, conversas, mensagens
                          ├─► Busca semântica (pgvector): trechos da base de conhecimento
                          ├─► LLM (API): gera a resposta com o contexto recuperado
                          └─► Regras: janela de 24h, opt-out, escalonamento
                                  │
                                  ▼
                          Resposta via Cloud API
```

### Componentes e por quê

| Camada | Escolha | Motivo |
|---|---|---|
| Canal | **WhatsApp Business Cloud API** (oficial Meta) | Único caminho estável e sem risco de banimento; número dedicado |
| Backend | **Netlify Functions** (já usado no projeto) | Mesma stack, deploy simples, HTTPS pronto |
| Banco | **Supabase (Postgres + pgvector)** | Conversas + busca semântica no mesmo lugar; plano gratuito no início |
| IA | **LLM via API** (OpenAI/Anthropic/Google) | Qualidade de linguagem; troca de fornecedor sem reescrever |
| Conhecimento | **RAG** — documentos → chunks → embeddings | Respostas baseadas apenas no material da empresa (menos invenção) |
| Painel | **Site estático** publicado no Netlify + autenticação | Reaproveita a experiência atual do projeto |
| Mídia | **Supabase Storage** | Áudios, imagens e PDFs recebidos/enviados |

### Por que RAG e não "treinar" o modelo

Fine-tuning é caro, lento para atualizar e continua sujeito a erro. Com RAG, a empresa edita um texto no painel e a próxima resposta já usa a informação nova — sem retreinar nada.

---

## 4. Fluxo de atendimento

```
Mensagem recebida
   │
   ├─ É opt-out / pedido de exclusão? ──► registra e encerra
   ├─ Pediu humano? ────────────────────► transfere com resumo
   │
   ▼
Classifica intenção (saudação, dúvida, orçamento, reclamação, outro)
   │
   ▼
Busca trechos relevantes na base de conhecimento
   │
   ├─ Encontrou com boa confiança ──► LLM responde citando o contexto
   └─ Não encontrou / baixa confiança ──► "Vou chamar um atendente" + transferência
   │
   ▼
Registra mensagem, tokens, custo e resultado
```

**Regras anti-alucinação (obrigatórias):**

1. O modelo só responde com base nos trechos recuperados.
2. Preço, prazo e política nunca são inventados: se não estiver na base, escala para humano.
3. Toda conversa começa com aviso de que o atendimento é automatizado.
4. O bot nunca promete desconto, prazo ou condição que não esteja cadastrada.
5. Se a confiança da resposta for baixa, o bot **não tenta adivinhar**: transfere para humano e registra a pergunta como lacuna na base.

---

## 5. Telas do painel

1. **Visão geral** — conversas do dia, taxa de resolução pelo bot, tempo médio, custo estimado.
2. **Conversas** — lista com filtros (bot/humano, resolvida, pendente) e leitura completa.
3. **Base de conhecimento** — cadastro por blocos (texto, link, PDF), com pré-visualização do que o bot responderia.
4. **Transferência** — fila de conversas aguardando humano e botão "assumir".
5. **Configurações** — saudação, horário de atendimento, aviso LGPD, tempo de retenção, tom de voz.
6. **Métricas** — perguntas mais frequentes, assuntos sem resposta (lacunas na base).

---

## 6. Cronograma sugerido

| Fase | Entrega | Duração |
|---|---|---|
| 0. Descoberta | Número verificado, base de conhecimento inicial, tom de voz, casos de uso | 3–5 dias |
| 1. Fundação | Webhook, envio/recebimento, banco, log de conversas | 1 semana |
| 2. Inteligência | RAG + LLM + regras anti-alucinação + testes com perguntas reais | 1–2 semanas |
| 3. Humano | Transferência, painel de conversas, notificação ao atendente | 1 semana |
| 4. Painel e LGPD | Base de conhecimento editável, métricas, textos legais, retenção | 1 semana |
| 5. Homologação | Testes com número real, ajustes de tom, treinamento da equipe | 3–5 dias |

**Total estimado: 5 a 7 semanas** para uma eventual integração externa, dependendo da velocidade de aprovação do número na Meta e da entrega do material pela empresa.

> A verificação do número e a aprovação dos templates na Meta são o principal fator externo de atraso. Recomendo iniciar esse processo na fase 0.

---

## 7. Custos mensais estimados

Valores de referência para um volume de **1.000 a 3.000 conversas/mês** — confirmar tabelas vigentes antes de contratar.

| Item | Faixa mensal |
|---|---|
| WhatsApp Cloud API (Meta) | R$ 0 – 300 (conversas de serviço iniciadas pelo cliente tendem a ser gratuitas; templates cobrados por mensagem) |
| LLM (API) | R$ 30 – 200 |
| Supabase | R$ 0 – 130 (gratuito no início; Pro ~US$ 25) |
| Netlify | R$ 0 – 100 (funções têm franquia generosa) |
| Domínio / e-mail / monitoramento | R$ 20 – 50 |
| **Total** | **R$ 50 – 780 / mês** |

Custos únicos: configuração do número e eventuais serviços de design/conteúdo.

**Alavancas de economia:** limitar o contexto enviado ao LLM, cachear respostas frequentes, usar modelo menor para triagem e maior apenas quando necessário.

---

## 8. Segurança e LGPD

- **Base legal:** legítimo interesse/execução de contrato para atendimento; consentimento para comunicações ativas.
- **Aviso claro** na primeira mensagem de que se trata de atendimento automatizado, com opção de falar com humano.
- **Minimização:** não solicitar CPF, dados de cartão ou saúde no chat; se necessário, direcionar para canal seguro.
- **Retenção:** prazo definido (sugestão: 6 a 12 meses) e rotina automática de expurgo.
- **Direitos do titular:** comando "excluir meus dados" registrado e executado; contato do encarregado (DPO) divulgado.
- **Fornecedores:** verificar cláusulas de tratamento de dados com Meta, provedor de LLM e hospedagem; preferir opções com não-treinamento sobre os dados.
- **Acesso:** painel com autenticação, perfis (admin/atendente) e registro de quem acessou o quê.
- **Segurança técnica:** validação da assinatura do webhook, segredos em variáveis de ambiente (nunca no front-end), rate limiting e logs sem conteúdo sensível.

---

## 9. Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Reprovação/atraso do número na Meta | Alto | Iniciar fase 0 imediatamente; ter número reserva |
| IA responder informação errada | Alto | RAG restrito + regras + revisão humana nas primeiras semanas |
| Base de conhecimento desatualizada | Médio | Responsável definido e revisão mensal no painel |
| Custo do LLM acima do previsto | Médio | Limite de tokens, cache, alerta de consumo |
| Dependência de um fornecedor de IA | Baixo | Camada de abstração permite trocar de modelo |
| Mudança nas regras de cobrança da Meta | Médio | Acompanhar comunicados; modelo de custo por mensagem já previsto |

---

## 10. O que precisamos da empresa para começar

1. **Número de telefone** dedicado ao atendimento (não pode estar em uso no app WhatsApp comum).
2. **CNPJ e dados de verificação** do Meta Business.
3. **Base de conhecimento**: serviços, preços, horários, endereço, prazos, políticas, perguntas frequentes.
4. **Tom de voz**: formal ou informal; exemplos de conversas boas.
5. **Responsável pelo atendimento humano** e horário de cobertura.
6. **Logotipo e identidade** para a saudação e o painel.

---

## 11. Próximos passos

1. Validar este escopo e o orçamento.
2. Reunir os itens da seção 10.
3. Abrir a verificação do número no Meta Business (prazo externo).
4. Iniciar a fase 1 com um ambiente de testes e um número sandbox.

---

## 12. Protótipo navegável

Foi criado um protótipo local em [`../prototipo-chatbot/`](../prototipo-chatbot/) para visualizar o fluxo antes de investir na integração real.

**O que ele mostra:**

- Conversa no formato WhatsApp, com respostas rápidas e transferência para humano.
- Painel de “bastidores” com intenção detectada, trechos encontrados na base, confiança e decisão tomada.
- Base de conhecimento editável: mudar um preço e ver a próxima resposta já atualizada.
- Controles de tom de voz, limiar de confiança e regra para reclamações.
- Métricas de contenção, transferências, custo estimado e lacunas de conhecimento.
- Aba “Como vira produção”, mapeando cada peça simulada para o serviço real.

**O que ele não faz:** enviar mensagens reais, usar um LLM de verdade ou persistir dados fora do navegador. Ele serve para validar fluxo, regras, tom e base de conhecimento — não a qualidade final da IA.

Para abrir: execute `abrir.bat` dentro da pasta do protótipo ou siga as instruções do `README.md` local.
