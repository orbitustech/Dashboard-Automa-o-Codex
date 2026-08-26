# Backend seguro do KoinOps

Este backend existe para coisas que nao devem acontecer direto no navegador:

- subir imagem JPG/PNG ou video MP4 para uma URL publica;
- publicar a fila aprovada direto nas APIs oficiais das redes sociais, usando os tokens de cada plataforma.

## Arquivos criados

```txt
api/health.js
api/upload-media.js
api/publish.js
lib/platform-publisher.mjs
lib/storage-upload.mjs
lib/multipart.mjs
```

## Variaveis de ambiente do backend

Configure no Vercel, ou em outro host Node 20:

```txt
KOINOPS_ADMIN_TOKEN=crie-uma-chave-longa-e-guarde-no-1password
SUPABASE_URL=https://nbbprjduqtndkwbknyud.supabase.co
SUPABASE_ANON_KEY=chave-publicavel-ou-anon
SUPABASE_SERVICE_ROLE_KEY=service-role-do-supabase
SUPABASE_STORAGE_BUCKET=content-assets
KOINOPS_ALLOWED_ORIGIN=https://nicolasorbithustech.github.io
```

Mais o token de cada rede social que for usar (preencha so o que ja tiver acesso aprovado na plataforma):

```txt
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_USER_ID=
THREADS_ACCESS_TOKEN=
THREADS_USER_ID=
FACEBOOK_PAGE_ACCESS_TOKEN=
FACEBOOK_PAGE_ID=
TIKTOK_ACCESS_TOKEN=
LINKEDIN_ACCESS_TOKEN=
LINKEDIN_AUTHOR_URN=
X_ACCESS_TOKEN=
```

Detalhes de como conseguir cada token e os requisitos de aprovacao de cada plataforma estao em `OFFICIAL_APIS_SETUP.md`.

`SUPABASE_SERVICE_ROLE_KEY` e os tokens das redes ficam somente no backend. Nunca coloque essas chaves no dashboard, no GitHub Pages ou no chat.

## Deploy atual

O projeto foi criado na Vercel em:

```txt
Team: koinops-nicolas
Projeto: tenho-5-sites-e-contas-em
URL de producao: https://tenho-5-sites-e-contas-em.vercel.app
```

Variaveis ja configuradas:

```txt
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_STORAGE_BUCKET
KOINOPS_ADMIN_TOKEN
SUPABASE_SERVICE_ROLE_KEY
```

Os tokens de cada rede social ainda precisam ser adicionados conforme cada plataforma for aprovada.

## Como conectar no dashboard

1. Abra `Governanca`.
2. Em `Backend seguro`, coloque a URL do backend, por exemplo `https://seu-projeto.vercel.app`.
3. Clique em `Salvar conexao`.
4. Entre com AWS Cognito (o dashboard exige login antes de liberar as abas). O token da sessao autentica as chamadas ao backend, sem precisar colar `KOINOPS_ADMIN_TOKEN` no navegador.
5. Clique em `Testar`.

A partir dai, a aba `Conteudo` consegue enviar JPG/PNG/MP4 e tambem disparar `Publicar fila agora`. O teste de backend mostra quantas redes sociais ja tem token configurado (`socialPlatforms` em `/api/health`).

## Como fica a automacao

1. A automacao cria o rascunho (ou voce edita manualmente) no dashboard.
2. Voce aprova em `Conteudo`, escolhendo `Postar agora` ou `Agendar`.
3. O dashboard cria a fila para as redes ativas com `ID da conta (API oficial)` preenchido em `Redes`.
4. Se o backend estiver configurado, `Postar agora` chama a API oficial da rede na hora.
5. Um item agendado fica pendente ate o horario chegar; o GitHub Actions `Publish Social Queue` verifica a fila a cada 5 minutos e publica o que estiver vencido, mesmo sem o backend configurado (ele so precisa dos tokens como segredo do repositorio).

## Por que manter GitHub Actions

No plano gratuito da Vercel, Cron Jobs tem limite menor e nao serve bem para checar a cada 5 minutos. Por isso a rotina recorrente gratuita continua no GitHub Actions — e e ela quem funciona como "agendador", ja que nenhuma API oficial mantem fila/agendamento proprio como o Buffer mantinha. O backend fica para upload seguro e disparo imediato pelo dashboard.
