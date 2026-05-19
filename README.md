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
- Inventario de sites e referencias de cofre
- Redes sociais e cadencia editorial
- Automacoes recorrentes
- Esteira de conteudo
- Koins, premios e alertas
- Fila de aprovacao humana
- Relatorios e governanca

## Seguranca

O dashboard nao deve armazenar senhas nem tokens em texto aberto. Guarde apenas a referencia do item no cofre de senhas.
