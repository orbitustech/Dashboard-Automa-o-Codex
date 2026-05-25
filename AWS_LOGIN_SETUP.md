# AWS login setup

Este repositorio ja esta preparado para login com Amazon Cognito usando Authorization Code + PKCE.

## O que eu ja deixei pronto

- O dashboard tem uma area em `Governanca > Login AWS Cognito`.
- O navegador faz o login pelo Hosted UI do Cognito.
- O backend pode validar JWT do Cognito quando `AWS_COGNITO_ISSUER` e `AWS_COGNITO_CLIENT_ID` estiverem na Vercel.
- A chave antiga `KOINOPS_ADMIN_TOKEN` continua funcionando como fallback administrativo.

## O que voce precisa fazer na AWS

1. Abra o CloudFormation no sandbox da empresa.
2. Crie uma stack usando `aws/cognito-dashboard-login.yaml`.
3. Informe um `DomainPrefix` unico, por exemplo `koinops-nicolas-sandbox`.
4. Use:
   - Callback URL: `https://dashboard-redes-automatico.vercel.app/dashboard/`
   - Logout URL: `https://dashboard-redes-automatico.vercel.app/dashboard/`
5. Depois que a stack terminar, copie os outputs:
   - `HostedUiDomain`
   - `UserPoolClientId`
   - `Issuer`

## O que configurar no dashboard

Na aba `Governanca > Login AWS Cognito`:

- marque `Exigir login AWS neste navegador`
- cole `HostedUiDomain` em `Dominio Cognito`
- cole `UserPoolClientId` em `Client ID`
- confirme as URLs de callback/logout
- salve e clique em `Entrar`

## O que configurar na Vercel

Para o backend aceitar o login AWS no lugar da chave do painel, adicione:

- `AWS_COGNITO_ISSUER`: output `Issuer`
- `AWS_COGNITO_CLIENT_ID`: output `UserPoolClientId`

Depois rode um deploy de producao.

## Observacao de seguranca

Enquanto `AWS_COGNITO_ISSUER` e `AWS_COGNITO_CLIENT_ID` nao estiverem na Vercel, o backend ainda exige `KOINOPS_ADMIN_TOKEN`.
