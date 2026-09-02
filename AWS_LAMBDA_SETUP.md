# Backend na AWS Lambda

O backend saiu da Vercel e roda numa Lambda na conta da empresa. Este documento
descreve o que existe hoje e como publicar mudancas.

## O que esta no ar

| Item | Valor |
|---|---|
| Conta AWS | `980413094123` (perfil SSO `orbitus`) |
| Regiao | `us-east-2` |
| Funcao | `koinops-backend` |
| Function URL | `https://7klvpt3aodrou2ywmwvbghwkwi0dszzw.lambda-url.us-east-2.on.aws` |
| Handler | `lambda/handler.handler` |
| Runtime | `nodejs22.x`, timeout 90s, 512 MB |
| Execution role | `koinops-backend-role-yfgvde7o` |
| Chave KMS do Cofre | `042fc6e8-773b-4256-b18e-8b1adcbddea1` |
| Auth da Function URL | `NONE` (a autenticacao e feita no app, via Cognito ou `KOINOPS_ADMIN_TOKEN`) |

Boa parte disso ja existia de um trabalho anterior — a funcao, a Function URL,
a chave KMS e as variaveis de ambiente estavam configuradas. O que mudou nesta
migracao foi o codigo (agora vem de `lambda/` + `lib/` deste repositorio), o
handler e a origem liberada no CORS.

## Publicar uma mudanca

```bash
aws sso login --profile orbitus   # so quando a sessao expirar
node scripts/deploy-lambda.mjs
```

O script empacota `lambda/` + `lib/`, envia com `update-function-code` e espera
a funcao ficar pronta. Use `--build-only` para gerar o zip sem publicar.

## CI/CD: por que ainda e manual

O deploy automatico a cada push (`.github/workflows/deploy-backend.yml`) exige
que o GitHub Actions se autentique na AWS por OIDC, e isso depende de um
*OpenID Connect provider* registrado no IAM da conta. Criar esse provider pede a
permissao `iam:CreateOpenIDConnectProvider`, negada para o acesso atual:

```
AccessDenied: User: .../nicolasforcione@orbitustech.com is not authorized to
perform: iam:CreateOpenIDConnectProvider
```

Nao ha como contornar isso pelo Cognito: o Identity Pool tambem aceita apenas
ARNs de providers OIDC ja registrados no IAM, ou seja, cai na mesma permissao.

Por isso o workflow esta com gatilho manual (`workflow_dispatch`) em vez de
`push` — assim ele nao falha em todo commit. Para ativar o deploy automatico:

1. Peca a quem administra a conta AWS para criar **um** provider OIDC:
   - URL: `https://token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`
2. Crie a role de deploy (voce tem permissao para isso):
   ```bash
   aws iam create-role --profile orbitus --role-name koinops-backend-deploy-role \
     --assume-role-policy-document file://aws/deploy-trust-policy.json
   aws iam put-role-policy --profile orbitus --role-name koinops-backend-deploy-role \
     --policy-name koinops-lambda-deploy \
     --policy-document file://aws/deploy-permission-policy.json
   ```
   Essa role so pode atualizar o codigo desta Lambda — nada alem disso.
3. Cadastre o ARN da role como secret `AWS_DEPLOY_ROLE_ARN` no GitHub.
4. No workflow, troque `on: workflow_dispatch` de volta para o gatilho de push.

## Pendencias conhecidas

- **Upload de midia desligado**: `KOINOPS_MEDIA_STORAGE_ENABLED=0` na Lambda.
  Enquanto estiver assim, anexar imagem/video pelo dashboard nao funciona e a
  geracao de imagem volta so uma previa temporaria. Para ligar, mude a variavel
  para `1` (o bucket do Supabase e criado sozinho no primeiro upload).
- **Botao "Publicar fila agora"**: os tokens das redes sociais nao estao na
  Lambda (estao nos secrets do GitHub, usados pelo cron de 5 em 5 minutos do
  `publish.yml`). O cron continua publicando normalmente; so o botao manual do
  dashboard precisa desses tokens tambem na Lambda para funcionar.
- **`vault_audit_log`**: a tabela de auditoria do Cofre ainda precisa ser criada
  no Supabase:
  ```sql
  create table if not exists vault_audit_log (
    id uuid primary key default gen_random_uuid(),
    vault_id uuid,
    action text not null,
    actor text,
    actor_type text,
    detail text,
    created_at timestamptz not null default now()
  );
  alter table vault_audit_log enable row level security;
  ```
  Sem ela o Cofre funciona, mas as revelacoes/edicoes nao ficam registradas.
