# KoinOps Dashboard

Dashboard operacional para gerenciar sites de pesquisa com Koins, premios, redes sociais, automacoes, conteudo e aprovacoes.

## Como abrir localmente

Abra `index.html` no navegador ou rode um servidor estatico:

```bash
python -m http.server 8765
```

Depois acesse `http://127.0.0.1:8765`.

## O que inclui

- Visao geral da operacao
- Inventario de sites salvo no Supabase
- Campos principais: nome do site, URL, objetivo, status, referencia do cofre, tipo de API, ultima auditoria e proxima acao
- Redes sociais e cadencia editorial
- Automacoes recorrentes
- Esteira de conteudo
- Koins, premios e alertas
- Fila de aprovacao humana
- Relatorios e governanca

## Supabase

O projeto ja esta apontando para:

```txt
https://nbbprjduqtndkwbknyud.supabase.co
```

Para ativar o salvamento em nuvem, abra `dashboard/config.js` e troque:

```js
anonKey: "COLE_SUA_SUPABASE_ANON_KEY_AQUI"
```

pela chave `anon public` em Supabase > Project Settings > API. Depois faca commit e push. O GitHub Pages vai usar essa configuracao publicada.

## Seguranca

O dashboard nao deve armazenar senhas nem tokens em texto aberto. Guarde apenas a referencia do item no cofre de senhas.

Sem login, as politicas atuais do Supabase permitem leitura e escrita com a chave publica anonima. Isso e pratico para testar, mas antes de colocar dados sensiveis ou operacao real em producao, adicione login e politicas RLS por usuario.
