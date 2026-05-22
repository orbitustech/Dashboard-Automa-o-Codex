# Backend seguro do KoinOps

Este backend existe para duas coisas que nao devem acontecer direto no navegador:

- subir imagem JPG/PNG para uma URL publica;
- publicar a fila aprovada no Buffer usando a `BUFFER_API_KEY`.

## Arquivos criados

```txt
api/health.js
api/upload-media.js
api/publish.js
lib/buffer-publisher.mjs
lib/storage-upload.mjs
lib/multipart.mjs
```

## Variaveis de ambiente do backend

Configure no Vercel, ou em outro host Node 20:

```txt
KOINOPS_ADMIN_TOKEN=crie-uma-chave-longa-e-guarde-no-1password
BUFFER_API_KEY=chave-do-buffer
SUPABASE_URL=https://nbbprjduqtndkwbknyud.supabase.co
SUPABASE_ANON_KEY=chave-publicavel-ou-anon
SUPABASE_SERVICE_ROLE_KEY=service-role-do-supabase
SUPABASE_STORAGE_BUCKET=content-assets
KOINOPS_ALLOWED_ORIGIN=https://nicolasorbithustech.github.io
```

`SUPABASE_SERVICE_ROLE_KEY` fica somente no backend. Nunca coloque essa chave no dashboard, no GitHub Pages ou no chat.

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
```

Variaveis que ainda precisam ser adicionadas por voce, usando o 1Password:

```txt
KOINOPS_ADMIN_TOKEN
BUFFER_API_KEY
SUPABASE_SERVICE_ROLE_KEY
```

## Como conectar no dashboard

1. Abra `Governanca`.
2. Em `Backend seguro`, coloque a URL do backend, por exemplo `https://seu-projeto.vercel.app`.
3. Cole a `KOINOPS_ADMIN_TOKEN`.
4. Clique em `Salvar conexao`.
5. Clique em `Testar`.

A partir dai, a aba `Conteudo` consegue enviar JPG/PNG e tambem disparar `Publicar fila agora`.

## Como fica a automacao

1. Codex cria ou edita o post no dashboard.
2. Voce aprova em `Conteudo`.
3. O dashboard cria a fila para as redes ativas com `Buffer Channel ID`.
4. Se o backend estiver configurado, ele tenta enviar a fila ao Buffer imediatamente.
5. Se o backend nao estiver configurado, o GitHub Actions `Buffer Publish` continua verificando a fila a cada 5 minutos.

## Por que manter GitHub Actions

No plano gratuito da Vercel, Cron Jobs tem limite menor e nao serve bem para checar a cada 5 minutos. Por isso a rotina recorrente gratuita continua no GitHub Actions. O backend fica para upload seguro e disparo imediato.
