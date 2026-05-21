# Automacao Buffer + Codex

Este arquivo deixa a publicacao social pronta para rodar sem guardar senha no repositorio.

## O que ja esta pronto

- O Supabase tem os campos para conectar cada rede ao Buffer.
- O dashboard permite cadastrar `Buffer Channel ID`, texto do post e URL de midia.
- O script `scripts/buffer-publish.mjs` busca a fila em `distribution_tasks` e cria posts no Buffer.
- O GitHub Actions `.github/workflows/buffer-publish.yml` roda o publicador manualmente.
- O script `scripts/buffer-list-channels.mjs` lista os canais conectados no Buffer quando a chave estiver disponivel.

## O que voce precisa fazer

1. No Buffer, conecte Instagram, TikTok, Facebook e as outras redes que vai usar.
2. No GitHub, abra o repositorio `Dashboard-Automa-o-Codex`.
3. Va em `Settings > Secrets and variables > Actions > New repository secret`.
4. Crie o segredo `BUFFER_API_KEY` com a chave que voce guardou no 1Password.
5. Opcional: crie `SUPABASE_ANON_KEY` com a chave publicavel do Supabase. Se nao criar, o script usa a chave que ja esta no dashboard.
6. Rode o workflow `Buffer Publish` primeiro com `dry_run = 1`.
7. Quando estiver tudo certo, rode de novo com `dry_run = 0`.

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

Cadastre o post:

- `Titulo`: nome interno do conteudo.
- `Canal`: rede ou formato principal.
- `Texto do post`: legenda/copy final que eu vou criar e voce aprova.
- `Midia URL`: link publico da imagem ou video, quando existir.
- `Status`: deixe em `Aprovacao` ate voce aprovar; depois avance para `Agendado`.

### Fila de distribuicao

Crie a tarefa de envio:

- `Conteudo aprovado`: selecione o post.
- `Destino`: Instagram, TikTok, Facebook etc.
- `Buffer Channel ID`: o canal exato onde vai postar.
- `Agendar para`: opcional. Se ficar vazio, entra no proximo horario da fila do Buffer.
- `UTM`: opcional para rastrear cliques.

## Como eu vou automatizar a rotina

1. Eu crio o calendario e os rascunhos no dashboard.
2. Voce aprova ou pede ajuste.
3. Eu movo o conteudo aprovado para a fila de distribuicao.
4. O GitHub Actions envia a fila para o Buffer.
5. O dashboard recebe `buffer_post_id` e marca a tarefa como `agendado`.
6. Depois podemos ativar uma rotina recorrente para rodar o workflow em horario fixo.

## Referencias oficiais

- Buffer GraphQL API: https://developers.buffer.com/
- Criar post de texto: https://developers.buffer.com/examples/create-text-post.html
- Criar post com imagem: https://developers.buffer.com/examples/create-image-post.html
- Buscar canais: https://developers.buffer.com/examples/get-channels.html
