# Diagnostico de Automacao - KoinOps

Data do diagnostico: 2026-05-22

## Resumo

O dashboard, o Supabase, o GitHub Pages e a base de backend ja estao prontos como operacao inicial. O que falta agora e configurar os segredos no ambiente real e fazer o primeiro teste controlado de publicacao.

## Estado atual

| Area | Status | Diagnostico |
|---|---|---|
| Dashboard | Em ajuste operacional | Publicado no GitHub Pages, com fluxo simplificado de Conteudo, upload JPG/PNG via backend e persistencia no Supabase. |
| Supabase | Pronto para teste | Tabelas criadas para sites, redes, automacoes, conteudo, distribuicao, Coins, aprovacoes, suporte, FAQ, relatorios e governanca. |
| Backend | Implementado, pendente de segredos | APIs `health`, `upload-media` e `publish` existem. Falta configurar variaveis no host. |
| Seguranca | Parcial | O dashboard guarda referencia do cofre; backend usa token simples, mas ainda falta login/RLS por usuario. |
| Fase 3 - Pasta operacional | Feita agora em template | Criada a pasta `operacao/_template_site` com arquivos base para cada site. |
| Fase 4 - Auditoria real | Pendente de integracoes | Falta conectar uptime, SSL, SEO, Search Console/Analytics e funil real do site. |
| Fase 5 - Conteudo automatico | Parcial | Dashboard tem kanban; falta contexto por site preenchido em todos os sites (campo Prompt de temas) para a geracao automatica funcionar bem. |
| Fase 6 - Publicacao | Avancada | Fila, UTMs, adaptadores por rede (APIs oficiais), upload de midia, backend de disparo, script de envio e GitHub Actions existem; falta aprovar cada rede na respectiva plataforma e configurar os tokens. |
| Fase 7 - Suporte | Parcial | Classificacao, resposta sugerida e FAQ existem; falta conectar canais de suporte/redes. |
| Fase 8 - Coins/premios | Parcial | Metricas e premios existem; falta API real de saldo, resgates e antifraude. |
| Fase 9 - Relatorios | Parcial | Relatorios manuais existem; falta automacao diaria/semanal/mensal. |

## Dados atuais no Supabase

Contagem real consultada por SQL:

| Tabela | Registros |
|---|---:|
| sites | 1 |
| social_accounts | 0 |
| automations | 0 |
| content_items | 0 |
| distribution_tasks | 0 |
| support_messages | 0 |
| faq_entries | 0 |
| prizes | 0 |
| koin_metrics | 1 |
| approvals | 0 |
| report_metrics | 0 |
| governance_rules | 0 |

## O que ja pude fazer sem sua intervencao

- Criar o dashboard operacional.
- Criar as tabelas no Supabase.
- Publicar no GitHub Pages.
- Criar fila de conteudo, distribuicao, suporte, FAQ, aprovacoes e relatorios.
- Criar templates de operacao por site.
- Criar checklist de aceite para auditoria, conteudo, suporte, relatorios e publicacao.
- Documentar quais integracoes faltam e quais permissoes devem ser criadas.
- Preparar a integracao com as APIs oficiais das redes, com scripts e workflow do GitHub Actions.
- Criar backend seguro para upload JPG/PNG e disparo imediato da fila aprovada.

## Intervencoes que preciso de voce

### 1. Cofre e credenciais

Voce precisa:

- Manter senhas reais no 1Password.
- Copiar o token de cada rede social do 1Password para o segredo correspondente do GitHub Actions (ver OFFICIAL_APIS_SETUP.md).
- Configurar no backend `KOINOPS_ADMIN_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, os tokens de cada rede social e demais variaveis de `BACKEND_SETUP.md`.
- Ativar 2FA em CMS, redes, e-mail, analytics e ferramentas de automacao.
- Criar usuarios tecnicos separados sempre que a plataforma permitir.

Nunca envie senha no chat. No dashboard, use apenas referencias como `Bitwarden: Site X - WordPress Admin`.

### 2. CMS dos sites

Preciso saber para cada site:

- CMS usado: WordPress, Webflow, Framer, Next.js, customizado, outro.
- URL de admin.
- Se existe API para criar rascunho.
- Referencia do token no cofre.
- Permissao desejada: rascunho apenas, agendar ou publicar.

Resultado esperado: gerar rascunhos/artigos automaticamente e atualizar status no dashboard.

### 3. Publicacao social

Rota escolhida: APIs oficiais de cada rede (sem intermediario tipo Buffer). Adaptadores prontos em `lib/platform-publisher.mjs` para Instagram, Threads, Facebook, TikTok, LinkedIn e X.

Preciso de, por rede que for usar:

- App aprovado na plataforma (cada rede tem processo proprio; detalhes em `OFFICIAL_APIS_SETUP.md`).
- Token de acesso de longa duracao guardado no cofre.
- `ID oficial/API` preenchido no dashboard para cada perfil (IG User ID, Page ID, author URN, etc.).
- Segredos da rede configurados no GitHub Actions e no backend (ver `OFFICIAL_APIS_SETUP.md`).

Resultado esperado: fila de distribuicao publica de verdade quando aprovada (`Postar agora`) ou quando o horario agendado chega (cron a cada 5 minutos).

### 4. Analytics e SEO

Ferramentas recomendadas:

- Google Analytics 4.
- Google Search Console.
- Cloudflare, UptimeRobot ou Better Stack para uptime.
- API do CMS para sitemap/paginas.

Preciso de:

- Propriedades GA4/Search Console.
- Permissao de leitura.
- Lista de URLs principais por site.

Resultado esperado: auditoria automatica de trafego, SEO, links, sitemap e paginas de confianca.

### 5. Suporte e comunidade

Possiveis canais:

- Gmail/Outlook.
- Chat do site.
- Instagram/Facebook.
- Discord/Telegram/WhatsApp, se usados.

Preciso de:

- Quais canais vao entrar no fluxo.
- Quais categorias podem receber resposta automatica.
- Quais categorias sempre vao para aprovacao humana.
- FAQ e politicas oficiais por site.

Resultado esperado: mensagens entram no dashboard, recebem classificacao e resposta sugerida.

### 6. Coins, premios e antifraude

Preciso de:

- Como o saldo de Coins e registrado hoje.
- Se existe API, banco ou painel administrativo.
- Regras de resgate.
- Regras antifraude existentes.
- Quais acoes nunca podem ser automaticas.

Resultado esperado: alertas de estoque, resgates pendentes, suspeitas e relatorios sem alterar saldo automaticamente.

## Prioridade recomendada

1. Completar seguranca: cofre, 2FA e usuarios tecnicos.
2. Preencher `operacao/_template_site` para cada site real.
3. Conectar CMS em modo rascunho.
4. Conectar agendador social em modo agendamento.
5. Conectar analytics/uptime.
6. Conectar suporte em modo resposta sugerida.
7. Conectar Coins/premios somente em leitura.
8. Adicionar login e RLS no Supabase antes de dados sensiveis.

## Diagnostico AWS

Sua AWS pode ser usada como infraestrutura de automacao: Lambda, EventBridge Scheduler, Secrets Manager, CloudWatch, SQS, SNS/SES, API Gateway e S3. O plano completo esta em `AWS_AUTOMACAO_PLANO.md`.

Ponto importante: AWS nao substitui autorizacao das plataformas. Para postar em CMS, redes sociais, suporte ou e-mail, ainda precisamos dos tokens e permissoes de cada ferramenta.

## Fluxo de conteudo automatizado

1. A automacao (OpenAI/Gemini via cron) planeja e cria o rascunho de conteudo.
2. Dashboard recebe o item como rascunho/aprovacao.
3. Voce aprova.
4. Automacao cria tarefa de distribuicao.
5. AWS ou ferramenta conectada publica/agenda.
6. Dashboard recebe link, UTM e status.
