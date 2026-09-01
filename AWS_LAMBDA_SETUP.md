# Setup do backend na AWS Lambda

Checklist de configuracao manual, uma vez so, na conta AWS da empresa (regiao
`us-east-2` — a mesma onde o Cognito ja roda em producao). Depois disso, o deploy do
codigo (`lambda/` + `lib/`) passa a ser automatico a cada push em `main` via
`.github/workflows/deploy-backend.yml`.

Rode os comandos abaixo com a AWS CLI configurada (`aws configure` ou
`aws sso login`) com um usuario/role que tenha permissao de administrador nessa conta.

## 0. Confirmar a conta certa

```bash
aws sts get-caller-identity --query Account --output text
```

Guarde o número que sair — é o `<ACCOUNT_ID>` usado em todos os comandos abaixo.

## 1. Provider OIDC do GitHub (uma vez so por conta)

Pule este passo se a conta ja tiver um provider para `token.actions.githubusercontent.com`
(confira em IAM > Identity providers no console antes de rodar).

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

## 2. Chave no AWS KMS para o Cofre

```bash
aws kms create-key \
  --description "koinops dashboard vault encryption key" \
  --region us-east-2

# anote o KeyId retornado, depois crie um alias amigavel:
aws kms create-alias --alias-name alias/koinops-vault --target-key-id <KMS_KEY_ID>
```

## 3. Role de execucao da Lambda

Salve como `lambda-trust-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Principal": { "Service": "lambda.amazonaws.com" }, "Action": "sts:AssumeRole" }
  ]
}
```

Salve como `lambda-kms-policy.json` (substitua `<ACCOUNT_ID>` e `<KMS_KEY_ID>`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["kms:Encrypt", "kms:Decrypt"],
      "Resource": "arn:aws:kms:us-east-2:<ACCOUNT_ID>:key/<KMS_KEY_ID>"
    }
  ]
}
```

```bash
aws iam create-role \
  --role-name koinops-backend-lambda-role \
  --assume-role-policy-document file://lambda-trust-policy.json

aws iam attach-role-policy \
  --role-name koinops-backend-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam put-role-policy \
  --role-name koinops-backend-lambda-role \
  --policy-name koinops-vault-kms \
  --policy-document file://lambda-kms-policy.json
```

Essa role **nao** precisa de permissao nenhuma pra Supabase/OpenAI/Gemini/redes
sociais — tudo isso e chamada HTTPS com chave de API guardada em variavel de
ambiente, nao e nativo da AWS.

## 4. Role de deploy do GitHub Actions

Salve como `deploy-trust-policy.json` (substitua `<ACCOUNT_ID>`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
        "StringLike": { "token.actions.githubusercontent.com:sub": "repo:orbitustech/Dashboard-Automa-o-Codex:ref:refs/heads/main" }
      }
    }
  ]
}
```

Salve como `deploy-permission-policy.json` (substitua `<ACCOUNT_ID>`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration"
      ],
      "Resource": "arn:aws:lambda:us-east-2:<ACCOUNT_ID>:function:koinops-backend"
    }
  ]
}
```

```bash
aws iam create-role \
  --role-name koinops-backend-deploy-role \
  --assume-role-policy-document file://deploy-trust-policy.json

aws iam put-role-policy \
  --role-name koinops-backend-deploy-role \
  --policy-name koinops-lambda-deploy \
  --policy-document file://deploy-permission-policy.json
```

Essa role so pode atualizar o codigo/config dessa Lambda especifica — nada de criar
funcoes, nada de KMS, nada de IAM.

Depois de criada, pegue o ARN dela (`aws iam get-role --role-name koinops-backend-deploy-role --query Role.Arn --output text`)
e cadastre como secret no repositorio GitHub:
`Settings > Secrets and variables > Actions > New repository secret` →
nome `AWS_DEPLOY_ROLE_ARN`, valor o ARN da role.

## 5. Tabela `vault_audit_log` no Supabase

Rode no SQL Editor do Supabase:

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
-- Sem nenhuma policy de proposito: com RLS ligado e zero policy, so a
-- service role key (que ignora RLS) consegue ler/escrever — mesmo padrao
-- que o resto do backend ja usa.
```

Antes de rodar, confira no painel do Supabase se a tabela `support_messages` ja segue
esse mesmo padrao (RLS ligado, sem policy), pra manter consistencia.

## 6. Criar a funcao Lambda pela primeira vez

Na raiz do repositorio local:

```bash
zip -r function.zip lambda lib

aws lambda create-function \
  --function-name koinops-backend \
  --runtime nodejs20.x \
  --role arn:aws:iam::<ACCOUNT_ID>:role/koinops-backend-lambda-role \
  --handler lambda/handler.handler \
  --zip-file fileb://function.zip \
  --timeout 60 \
  --memory-size 256 \
  --region us-east-2
```

(Timeout de 60s cobre o caso do Instagram, que precisa esperar o container de video
processar antes de publicar.)

Configure as variaveis de ambiente (mais facil pela primeira vez direto no console,
em Lambda > Configuration > Environment variables, pra nao errar aspas com ~20
segredos na CLI):

| Variavel | Valor |
|---|---|
| `KOINOPS_ALLOWED_ORIGIN` | `https://orbitustech.github.io` |
| `KOINOPS_ADMIN_TOKEN` | (o mesmo token ja usado hoje) |
| `AWS_COGNITO_ISSUER` | `https://cognito-idp.us-east-2.amazonaws.com/us-east-2_fsv23otfO` |
| `AWS_COGNITO_CLIENT_ID` | `3035tmlje9mph30ngbbdl75p00` |
| `SUPABASE_URL` | `https://nbbprjduqtndkwbknyud.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | (do painel do Supabase) |
| `AWS_KMS_KEY_ID` | (o KeyId do passo 2) |
| `OPENAI_API_KEY` | |
| `OPENAI_TEXT_MODEL` | opcional, tem default |
| `OPENAI_IMAGE_MODEL` | opcional, tem default |
| `GEMINI_API_KEY` | |
| `GEMINI_VIDEO_MODEL` | opcional, tem default |
| `SUPABASE_STORAGE_BUCKET` | `content-assets` |
| `SUPABASE_VIDEO_STORAGE_BUCKET` | `content-videos` |
| `KOINOPS_MEDIA_STORAGE_ENABLED` | `1` |
| `KOINOPS_IMAGE_UPLOAD_MAX_BYTES` | opcional, default 12MB |
| `KOINOPS_VIDEO_UPLOAD_MAX_BYTES` | opcional, default 50MB |
| `KOINOPS_CRON_CREATE_IMAGE` | opcional |
| `PUBLISH_LIMIT` | opcional, default 10 |
| `INSTAGRAM_ACCESS_TOKEN` / `INSTAGRAM_USER_ID` | pro botao "Publicar fila agora" |
| `THREADS_ACCESS_TOKEN` / `THREADS_USER_ID` | idem |
| `FACEBOOK_PAGE_ACCESS_TOKEN` / `FACEBOOK_PAGE_ID` | idem |
| `TIKTOK_ACCESS_TOKEN` (+ opcionais `TIKTOK_PRIVACY_LEVEL` etc.) | idem |
| `LINKEDIN_ACCESS_TOKEN` / `LINKEDIN_AUTHOR_URN` | idem |
| `X_ACCESS_TOKEN` | idem |

Repare que **nao** precisa configurar `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` —
a propria Lambda injeta isso sozinha a partir da execution role a cada chamada.

## 7. Function URL

```bash
aws lambda create-function-url-config \
  --function-name koinops-backend \
  --auth-type NONE \
  --cors '{"AllowOrigins":["https://orbitustech.github.io"],"AllowMethods":["GET","POST","OPTIONS"],"AllowHeaders":["Content-Type","Authorization"]}'

aws lambda add-permission \
  --function-name koinops-backend \
  --statement-id FunctionURLAllowPublicAccess \
  --action lambda:InvokeFunctionUrl \
  --principal "*" \
  --function-url-auth-type NONE
```

`--auth-type NONE` e o certo aqui: a autenticacao ja acontece dentro do app
(`requireOperatorAuth`, admin token ou JWT do Cognito), igual ja era na Vercel. Usar
`AWS_IAM` exigiria assinar cada request do navegador, que nao tem credencial AWS
nenhuma.

Pegue a URL retornada (formato `https://<id>.lambda-url.us-east-2.on.aws/`).

## 8. Apontar o dashboard pra nova URL

Edite `dashboard/config.js`, campo `KOINOPS_BACKEND.baseUrl`, trocando a URL da
Vercel pela Function URL do passo 7. Isso e uma edicao de arquivo — faca via commit
normal, nao precisa rodar nada na AWS pra isso.

## Depois de tudo configurado

A partir do proximo push em `main` que toque `lambda/` ou `lib/`, o workflow
`Deploy Backend to AWS Lambda` builda e publica sozinho. Nao precisa repetir nenhum
passo deste checklist depois — so voltar aqui se precisar rotacionar uma chave, trocar
a regiao, ou adicionar uma variavel de ambiente nova.
