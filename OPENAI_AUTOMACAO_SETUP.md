# OpenAI content automation setup

O dashboard agora tem backend para criar texto e imagem com a API da OpenAI.

## Variaveis de ambiente

Obrigatoria:

- `OPENAI_API_KEY`: chave da API da OpenAI.

Opcionais:

- `OPENAI_TEXT_MODEL`: modelo de texto. Padrao: `gpt-5.2`.
- `OPENAI_IMAGE_MODEL`: modelo de imagem. Padrao: `gpt-image-2.0`.

## Como usar no dashboard

1. Entre em `Conteudo`.
2. Escolha site e rede.
3. Em `Pedido para a OpenAI`, descreva o post.
4. Clique em:
   - `Criar texto`: gera titulo, legenda, prompt de imagem e proxima acao.
   - `Criar imagem`: gera imagem e envia para o Supabase Storage.
   - `Criar texto + imagem`: faz as duas etapas.
5. Revise tudo.
6. Salve como `Rascunho` ou envie para `Aprovacao`.
7. Somente depois de aprovar o post entra na fila do Buffer.

## Regra operacional

A OpenAI cria rascunhos. O dashboard nao deve publicar automaticamente sem a sua aprovacao.
