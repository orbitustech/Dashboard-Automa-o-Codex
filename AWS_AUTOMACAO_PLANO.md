# Plano AWS para Automacao KoinOps

Data: 2026-05-20

## Resumo curto

A AWS pode ser usada como infraestrutura de execucao, agendamento, logs, filas, segredos e notificacoes. Ela nao substitui as APIs das redes sociais, CMS, analytics ou sistema de Koins. Para publicar de verdade, cada plataforma ainda precisa liberar token, escopo e permissao.

## Papel da AWS

| Necessidade | Servico AWS recomendado | Uso no KoinOps |
|---|---|---|
| Rodar tarefas recorrentes | EventBridge Scheduler + Lambda | Auditoria diaria, relatorio semanal, leitura de metricas e sincronizacao com Supabase. |
| Guardar tokens/API keys | Secrets Manager | Tokens de CMS, redes, analytics, suporte e ferramentas externas. |
| Logs e erros | CloudWatch Logs | Registrar execucoes, falhas, tempo de resposta e alertas. |
| Fila de tarefas | SQS | Separar tarefas de conteudo, suporte, publicacao e auditoria para processamento seguro. |
| Alertas | SNS ou SES | Enviar alertas por e-mail quando algo quebrar ou exigir aprovacao. |
| Webhooks externos | API Gateway + Lambda | Receber eventos de CMS, formularios, suporte e ferramentas de agendamento. |
| Arquivos e relatorios | S3 | Guardar exports, relatorios, imagens e anexos operacionais. |
| Hospedagem estatica opcional | S3 + CloudFront | Alternativa ao GitHub Pages para servir o dashboard. |

## O que a AWS consegue fazer bem

- Rodar auditorias em horario fixo.
- Buscar dados em APIs externas.
- Atualizar o Supabase automaticamente.
- Criar tarefas no dashboard.
- Enviar alertas.
- Guardar credenciais fora do codigo.
- Registrar logs de tudo que foi executado.
- Processar filas sem depender do seu computador ligado.

## O que a AWS nao resolve sozinha

- Postar no Instagram/TikTok/Facebook sem permissao/API da plataforma.
- Criar artigo no WordPress/Webflow sem token do CMS.
- Ler GA4/Search Console sem autorizacao Google.
- Responder e-mail/chat sem conectar o canal.
- Alterar saldo de Koins sem acesso seguro ao sistema onde o saldo vive.
- Aprovar decisoes sensiveis sem regra humana.

## Fluxo desejado: Codex cria, voce aprova, automacao posta

1. Codex gera ideias, calendario, post, artigo, e-mail ou FAQ.
2. O item entra no dashboard como `Aprovacao` ou `Agendado`.
3. Voce revisa e aprova.
4. O item aprovado entra em `distribution_tasks`.
5. Uma Lambda agendada ou webhook pega o item.
6. A Lambda usa o token correto no Secrets Manager.
7. A Lambda cria rascunho, agenda ou publica na ferramenta externa.
8. O dashboard recebe status, UTM e link publicado.

## Modelo seguro de permissao

Comecar sempre com permissoes pequenas:

- CMS: criar rascunho, nao publicar.
- Redes sociais: agendar, nao publicar direto.
- Analytics: somente leitura.
- Suporte: gerar sugestao, nao responder direto.
- Koins/premios: somente leitura.
- Saldo, bloqueio, premio negado: sempre aprovacao humana.

## Credenciais que preciso de voce

Nao envie senha no chat. Eu preciso apenas das referencias no cofre e dos nomes das ferramentas:

| Area | Informacao necessaria |
|---|---|
| AWS | Regiao preferida, nome da conta/projeto, se posso usar IAM/Secrets Manager/Lambda/EventBridge. |
| CMS | Ferramenta, URL admin, permissao desejada e referencia do token no cofre. |
| Redes | Ferramenta de agendamento escolhida: Metricool, Buffer, Publer, Meta Business Suite ou API direta. |
| Analytics | GA4, Search Console e permissao de leitura. |
| Suporte | Gmail/Outlook/chat/rede social que deve entrar no fluxo. |
| Koins | Origem dos dados: API, banco, painel ou export CSV. |

## Primeira arquitetura recomendada

```txt
EventBridge Scheduler
  -> Lambda automation-runner
    -> Secrets Manager
    -> APIs externas
    -> Supabase REST
    -> CloudWatch Logs
    -> SNS/SES alertas
```

## Primeiras automacoes AWS

1. `daily-dashboard-sync`: ler APIs conectadas e atualizar Supabase.
2. `weekly-content-plan`: criar tarefas de conteudo no dashboard para aprovacao.
3. `publication-runner`: procurar distribuicoes aprovadas e criar rascunhos/agendamentos.
4. `support-triage`: classificar mensagens e sugerir respostas.
5. `koins-watch`: monitorar premios, resgates pendentes e riscos.
6. `executive-report`: gerar resumo semanal.

## Ordem de implementacao

1. Criar IAM user/role com permissao minima para Lambda, EventBridge, Secrets Manager, CloudWatch e SQS.
2. Criar Secrets Manager com tokens externos.
3. Criar Lambda `automation-runner`.
4. Criar EventBridge Scheduler para rodar rotinas.
5. Testar primeiro em modo leitura/rascunho.
6. Ativar publicacao/agendamento depois que o fluxo estiver confiavel.

## Decisoes pendentes

- Qual regiao AWS usar.
- Se a AWS vai apenas automatizar ou tambem hospedar o dashboard.
- Qual ferramenta sera usada para redes sociais.
- Qual CMS sera conectado primeiro.
- Se o envio de e-mails sera por SES.
- Se suporte entra por e-mail, chat ou redes sociais.

