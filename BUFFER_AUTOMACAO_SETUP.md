# Automacao Buffer + Codex

Este arquivo deixa a publicacao social pronta para rodar sem guardar senha no repositorio.

## O que ja esta pronto

- O Supabase tem os campos para conectar cada rede ao Buffer.
- O dashboard permite cadastrar `Buffer Channel ID`, texto do post e URL de midia.
- Ao aprovar um conteudo, o dashboard cria automaticamente uma tarefa de distribuicao para cada rede ativa com `Buffer Channel ID`.
- O script `scripts/buffer-publish.mjs` busca a fila em `distribution_tasks` e cria posts no Buffer.
- O GitHub Actions `.github/workflows/buffer-publish.yml` roda o publicador manualmente e tambem a cada 5 minutos.
- O GitHub Actions `.github/workflows/buffer-list-channels.yml` lista os canais conectados no Buffer.
- O script `scripts/buffer-list-channels.mjs` lista os canais conectados no Buffer quando a chave estiver disponivel.

## O que voce precisa fazer

1. No Buffer, conecte Instagram, TikTok, Facebook e as outras redes que vai usar.
2. No GitHub, abra o repositorio `Dashboard-Automa-o-Codex`.
3. Va em `Settings > Secrets and variables > Actions > New repository secret`.
4. Crie o segredo `BUFFER_API_KEY` com a chave que voce guardou no 1Password.
5. Opcional: crie `SUPABASE_ANON_KEY` com a chave publicavel do Supabase. Se nao criar, o script usa a chave que ja esta no dashboard.
6. Rode o workflow `Buffer List Channels` e copie os IDs exibidos no log.
7. Preencha esses IDs na aba `Redes`.
8. Rode o workflow `Buffer Publish` primeiro com `dry_run = 1`.
9. Quando estiver tudo certo, rode de novo com `dry_run = 0`.

Nunca cole a chave do Buffer no chat, em arquivo do projeto ou no dashboard.

## Como preencher o dashboard

### Aba Redes

Cadastre cada perfil social e preencha:

- `Rede`: Instagram, TikTok, Facebook etc.
- `Perfil`: @usuario ou nome da pagina.
- `Buffer Channel ID`: ID do canal retornado pelo Buffer.
- `Cadencia`: frequencia planejada.
- `Status`: ativo, pausado ou atencao.

### Aba Conteudo

Eu posso cadastrar o post diretamente no Supabase/dashboard. Voce revisa:

- `Titulo`: nome interno do conteudo.
- `Canal`: rede ou formato principal.
- `Texto do post`: legenda/copy final que eu vou criar e voce aprova.
- `Midia URL`: link publico da imagem ou video, quando existir.
- `Status`: fica em `Aprovacao` ate voce decidir.

### Fila de distribuicao

Depois que voce clicar em `Aprovar`, o dashboard cria a fila automaticamente:

- Uma tarefa por rede ativa do mesmo site.
- Cada tarefa usa o `Buffer Channel ID` cadastrado na aba `Redes`.
- Se nao houver horario especifico, o post entra na proxima vaga da fila do Buffer.
- UTMs basicas sao preenchidas automaticamente.
- Nao existe mais botao manual de `Publicado` na fila. Publicacao real precisa vir do Buffer, com `buffer_post_id`.

## Como eu vou automatizar a rotina

1. Eu crio o calendario e os rascunhos no dashboard.
2. Voce aprova ou pede ajuste.
3. O clique de aprovacao cria a fila para Instagram, Threads, TikTok etc.
4. O GitHub Actions verifica a fila a cada 5 minutos e envia para o Buffer.
5. O dashboard recebe `buffer_post_id` e marca a tarefa como `agendado`.
6. Voce so volta a intervir se quiser rejeitar, pausar ou pedir ajuste.

## O que ainda precisa para ficar automatico de verdade

- `BUFFER_API_KEY` precisa estar configurado nos Secrets do GitHub.
- O workflow `Buffer Publish` precisa rodar uma vez com `dry_run = 1` e depois com `dry_run = 0`.
- A primeira execucao real precisa confirmar que o formato enviado para a API do Buffer esta aceito para cada rede.
- Imagens precisam ter URL publica; hoje usamos GitHub Pages, depois podemos migrar para Supabase Storage ou AWS S3.
- TikTok precisa de video, nao apenas imagem quadrada.
- Status `Publicado` real ainda depende de sincronizar retorno/status do Buffer depois do agendamento.

## Referencias oficiais

- Buffer GraphQL API: https://developers.buffer.com/
- Criar post de texto: https://developers.buffer.com/examples/create-text-post.html
- Criar post com imagem: https://developers.buffer.com/examples/create-image-post.html
- Buscar canais: https://developers.buffer.com/examples/get-channels.html
