# Publicacao direto nas APIs oficiais

Este arquivo substitui o antigo `BUFFER_AUTOMACAO_SETUP.md`. O dashboard nao usa mais o Buffer como intermediario: cada rede social e publicada com a API oficial da propria plataforma, usando o adaptador correspondente em `lib/platform-publisher.mjs`.

## Diferenca importante em relacao ao Buffer

- Cada rede exige seu proprio processo de aprovacao antes de aceitar posts via API. Nao existe uma chave unica que libera tudo de uma vez.
- Nenhuma API oficial mantem fila/agendamento como o Buffer mantinha; toda chamada e "publicar agora". O agendamento futuro e feito por nos: o item fica pendente em `distribution_tasks` com `scheduled_for` no futuro, e o GitHub Actions (`Publish Social Queue`, a cada 5 minutos) publica de verdade quando a hora chega.
- Falta de token de uma rede nao trava as outras: cada tarefa de distribuicao e independente.

## Requisitos de aprovacao por rede

| Rede | O que precisa antes de postar de verdade |
|---|---|
| Instagram | Conta Instagram profissional vinculada a uma Pagina do Facebook, app Meta com Business Verification e permissao `instagram_content_publish` aprovada. |
| Threads | App Meta com acesso a Threads API liberado (revisao geralmente mais rapida que Instagram). |
| Facebook | Pagina do Facebook + app Meta com permissao `pages_manage_posts` aprovada. |
| TikTok | App TikTok com *Content Posting API* aprovada em App Review. Sem aprovacao, o endpoint so publica para contas de teste cadastradas no proprio app (modo sandbox). |
| LinkedIn | Parceria aprovada no LinkedIn Marketing Developer Platform para postar em nome de uma Organization Page (perfil pessoal tem fluxo mais simples, mas ainda exige app revisado). |
| X (Twitter) | Conta de desenvolvedor com API v2 no tier pago (Basic ou superior) para escrever posts. |

Enquanto uma rede nao tiver aprovacao, deixe o token dela vazio: a tarefa de distribuicao fica com status `erro` e a mensagem explica que falta o segredo, sem afetar as demais redes.

## Segredos por plataforma

Preencha nos Secrets do GitHub Actions **e** nas variaveis de ambiente do backend (Vercel) so o que ja estiver aprovado:

```txt
INSTAGRAM_ACCESS_TOKEN      # token de longa duracao da conta Instagram
INSTAGRAM_USER_ID           # IG User ID (ou preencha por conta em Redes > ID oficial/API)
THREADS_ACCESS_TOKEN
THREADS_USER_ID
FACEBOOK_PAGE_ACCESS_TOKEN  # ou META_PAGE_ACCESS_TOKEN
FACEBOOK_PAGE_ID
TIKTOK_ACCESS_TOKEN
LINKEDIN_ACCESS_TOKEN
LINKEDIN_AUTHOR_URN         # urn:li:person:... ou urn:li:organization:...
X_ACCESS_TOKEN
```

O campo `ID oficial/API` cadastrado por conta na aba `Redes` (coluna `buffer_channel_id` no Supabase, reaproveitada) tem prioridade sobre a variavel de ambiente generica — assim cada site/perfil pode usar uma conta diferente da mesma rede.

## Passo a passo

1. Escolha a primeira rede que ja tem (ou consegue liberar rapido) aprovacao de API.
2. Gere o token de acesso de longa duracao na plataforma e guarde a referencia no 1Password.
3. No GitHub, abra o repositorio `Dashboard-Automa-o-Codex` em `Settings > Secrets and variables > Actions > New repository secret` e crie os segredos dessa rede.
4. Configure as mesmas variaveis no backend (Vercel), seguindo `BACKEND_SETUP.md`.
5. Na aba `Redes` do dashboard, preencha `ID oficial/API` com o ID da conta/pagina/URN correspondente.
6. Rode o workflow `Publish Social Queue` manualmente com `dry_run = 1` primeiro.
7. Confirme no log que o payload monta corretamente para essa rede, depois rode com `dry_run = 0` ou aprove um post real pelo dashboard com `Postar agora`.
8. Repita para as proximas redes conforme forem sendo aprovadas.

Nunca cole token nenhum no chat, em arquivo do projeto ou no dashboard.

## Como preencher o dashboard

### Aba Redes

Cadastre cada perfil social e preencha:

- `Rede`: Instagram, TikTok, Facebook, Threads, LinkedIn, X etc.
- `Perfil`: @usuario ou nome da pagina.
- `ID oficial/API`: IG User ID, Page ID, author URN etc., conforme a rede.
- `Cadencia`: frequencia planejada.
- `Status`: ativo, pausado ou atencao.

### Aba Conteudo

- `Titulo`: nome interno do conteudo.
- `Canal`: rede ou formato principal.
- `Texto do post`: legenda/copy final.
- `Imagem JPG/PNG` ou `Video MP4`: upload local, quando o backend estiver conectado.
- `Midia URL`: alternativa com link publico da imagem ou video.
- `Status`: fica em `Aprovacao` ate voce decidir `Postar agora` ou `Agendar`.

### Fila de distribuicao

Depois que voce aprovar um conteudo (`Postar agora` ou `Agendar`), o dashboard cria a fila automaticamente:

- Uma tarefa por rede ativa do mesmo site que tiver `ID oficial/API` preenchido.
- `Postar agora` dispara a chamada real na hora.
- `Agendar` guarda `scheduled_for` no futuro; o cron publica quando o horario chegar.
- UTMs basicas sao preenchidas automaticamente.
- Uma tarefa com erro pode ser reenviada pelo botao `Reenviar` na aba Distribuicao.

## Limitacoes conhecidas dos adaptadores atuais

- Instagram com video (Reels) aguarda o processamento do container antes de publicar; se o Instagram demorar demais, a tarefa fica com erro e pode ser reenviada.
- LinkedIn publica texto e imagem; video ainda nao e suportado (a API de video do LinkedIn usa upload em partes, mais complexo).
- TikTok publica pelo fluxo `PULL_FROM_URL`, que exige que a midia esteja num dominio verificado no app do TikTok.
- Todas as chamadas de publicacao rodam no momento em que a tarefa fica devida; nao ha reenvio automatico apos falha, exceto reaprovando o conteudo ou clicando em `Reenviar`.

## Referencias oficiais

- Instagram Graph API (Content Publishing): https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing
- Threads API: https://developers.facebook.com/docs/threads
- Facebook Graph API (Pages): https://developers.facebook.com/docs/pages-api
- TikTok Content Posting API: https://developers.tiktok.com/doc/content-posting-api-get-started
- LinkedIn Marketing API (Posts): https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
- X API v2 (Posts): https://developer.x.com/en/docs/x-api/tweets/manage-tweets/introduction
