# Diagnostico de Automacao - KoinOps

Data do diagnostico: 2026-05-20

## Resumo

O dashboard, o Supabase e o GitHub Pages ja estao prontos como base operacional. O que falta agora nao e mais "tela": falta conectar ferramentas externas, criar credenciais tecnicas e ativar rotinas recorrentes do Codex.

## Estado atual

| Area | Status | Diagnostico |
|---|---|---|
| Dashboard | Pronto para uso inicial | Publicado no GitHub Pages, com abas operacionais e persistencia no Supabase. |
| Supabase | Pronto para teste | Tabelas criadas para sites, redes, automacoes, conteudo, distribuicao, Koins, aprovacoes, suporte, FAQ, relatorios e governanca. |
| Seguranca | Parcial | O dashboard guarda referencia do cofre, mas ainda falta login/RLS por usuario e tokens tecnicos. |
| Fase 3 - Pasta operacional | Feita agora em template | Criada a pasta `operacao/_template_site` com arquivos base para cada site. |
| Fase 4 - Auditoria real | Pendente de integracoes | Falta conectar uptime, SSL, SEO, Search Console/Analytics e funil real do site. |
| Fase 5 - Conteudo automatico | Parcial | Dashboard tem kanban; falta contexto por site preenchido e rotina do Codex para gerar calendario/conteudo. |
| Fase 6 - Publicacao | Parcial | Fila, UTMs e status existem; falta conectar CMS/agendador social para publicar de verdade. |
| Fase 7 - Suporte | Parcial | Classificacao, resposta sugerida e FAQ existem; falta conectar canais de suporte/redes. |
| Fase 8 - Koins/premios | Parcial | Metricas e premios existem; falta API real de saldo, resgates e antifraude. |
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
- Criar prompts base para o Codex.
- Criar checklist de aceite para auditoria, conteudo, suporte, relatorios e publicacao.
- Documentar quais integracoes faltam e quais permissoes devem ser criadas.

## Intervencoes que preciso de voce

### 1. Cofre e credenciais

Voce precisa:

- Escolher/confirmar o cofre: Bitwarden, 1Password ou outro.
- Mover senhas reais para o cofre.
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

Resultado esperado: Codex criar rascunhos/artigos e atualizar status no dashboard.

### 3. Publicacao social

Escolha uma rota:

- Metricool
- Buffer
- Publer
- Meta Business Suite
- API direta de cada rede, quando disponivel

Preciso de:

- Contas/perfis oficiais.
- Quais redes podem receber posts automaticamente.
- Se publicacao deve ser rascunho, agendada ou publicada.
- Referencia do token/API no cofre.

Resultado esperado: fila de distribuicao virar agendamento real.

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

### 6. Koins, premios e antifraude

Preciso de:

- Como o saldo de Koins e registrado hoje.
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
7. Conectar Koins/premios somente em leitura.
8. Adicionar login e RLS no Supabase antes de dados sensiveis.

## Proximo pedido ideal para o Codex

Use este pedido quando estiver pronto para a proxima etapa:

```txt
Codex, vamos conectar o primeiro site real. O CMS e [ferramenta], o cofre tem a referencia [referencia], quero permissao apenas para criar rascunhos. Use o dashboard e a pasta operacao para configurar a automacao em modo seguro.
```

