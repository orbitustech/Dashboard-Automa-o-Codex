# Fluxo de melhoria de posts

Objetivo: transformar revisao subjetiva em uma instrucao clara para o Codex melhorar texto, imagem e formato antes de qualquer publicacao.

## Como voce usa

1. Abra o post na aba `Conteudo`.
2. Clique em `Editar`.
3. No campo `Prompt de melhoria`, escreva o que precisa mudar.
4. Salve a edicao.
5. Deixe o status como `Rascunho` ou `Aprovacao`, conforme o caso.

## Exemplos de prompts bons

```txt
Imagem ficou generica. Refazer com menos texto, mais cara de post social moderno, sem card branco grande, mais contraste e foco em premio/Koins.
```

```txt
Texto muito vendedor. Deixar mais natural para Threads, curto, curioso e sem parecer anuncio.
```

```txt
Criar uma versao mais premium: fundo realista de celular respondendo pesquisa, moedas Koins discretas, sem excesso de tipografia.
```

```txt
TikTok precisa de roteiro em video: gancho nos 2 primeiros segundos, cena a cena, legenda curta e CTA para o site.
```

## Como eu uso esse prompt

1. Leio os posts com `improvement_prompt` preenchido.
2. Reescrevo legenda, roteiro ou estrutura.
3. Gero ou substituo a midia.
4. Atualizo `Texto do post`, `Midia URL`, `Notas da revisao` e `Proxima acao`.
5. Volto o post para `Aprovacao` para voce decidir.

## Padrao para pedir imagem melhor

Inclua pelo menos tres coisas:

- O que ficou ruim.
- O estilo desejado.
- O que evitar.

Modelo:

```txt
O problema: [o que nao gostei].
Quero: [estilo, sensacao, composicao].
Evitar: [texto demais, visual generico, promessa exagerada, etc.].
Formato: [Threads 4:5, Instagram quadrado, TikTok vertical].
```

## Regra de seguranca

Prompt de melhoria nunca deve conter senha, token, dados pessoais de usuario ou informacao sensivel. Use apenas direcao criativa, aprovacao e contexto publico da campanha.
