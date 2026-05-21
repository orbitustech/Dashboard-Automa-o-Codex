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
- Redes sociais com perfil, cadencia, metricas e proxima acao
- Automacoes recorrentes com agenda, dono, risco, status, execucao manual e ultima execucao
- Esteira de conteudo em kanban: Rascunho, Aprovacao, Agendado e Publicado
- Fila de publicacao e distribuicao com agendamento, UTMs e link publicado
- Koins com snapshots de metricas, premios, estoque, resgates e alertas
- Fila de aprovacao humana com aprovar/rejeitar
- Suporte e comunidade com classificacao, resposta sugerida e FAQ
- Relatorios com trafego, posts, cadastros e resumo executivo
- Governanca com regras operacionais e referencias de cofre

## Como usar cada aba

- `Sites`: cadastre cada projeto e mantenha apenas a referencia do cofre, nunca a senha.
- `Redes`: registre os perfis oficiais de cada site e acompanhe cadencia, posts, cliques, crescimento e proxima acao.
- `Automacoes`: cadastre rotinas que o Codex ou integracoes externas vao executar. Use `Rodar` para registrar uma execucao manual e `Pausar` quando a rotina precisar de revisao.
- `Conteudo`: acompanhe tarefas editoriais em kanban. O botao `Avancar` move o item pela esteira ate `Publicado`. A fila de distribuicao registra destino, agendamento, UTM e link publicado.
- `Koins`: registre uma leitura atual dos saldos e cadastre premios com custo, estoque, resgates e status.
- `Aprovacoes`: envie decisoes sensiveis para fila humana, como campanhas, premios, respostas de suporte ou mudancas de regras.
- `Suporte`: classifique mensagens por tema, gere uma resposta sugerida, marque como respondida e transforme perguntas repetidas em FAQ.
- `Relatorios`: registre trafego, posts e cadastros por dia para alimentar os graficos e o resumo executivo.
- `Governanca`: mantenha regras de seguranca e limites de automacao, alem das referencias de cofre vindas dos sites.

## Diagnostico e operacao

- `DIAGNOSTICO_AUTOMACAO.md`: mostra o que falta, o que ja foi feito e quais integracoes precisam da sua intervencao.
- `operacao/PROMPTS_CODEX.md`: prompts fixos para auditoria, conteudo, risco, relatorio e FAQ.
- `operacao/FLUXO_CONTEUDO_CODEX.md`: fluxo onde Codex cria, voce aprova e a automacao publica/agenda.
- `operacao/CHECKLIST_ACEITE.md`: criterios de aceite antes de publicar, responder ou registrar automacoes.
- `operacao/_template_site`: modelo para criar uma pasta de contexto para cada site real.
- `AWS_AUTOMACAO_PLANO.md`: como usar AWS para rodar automacoes, guardar segredos, agendar tarefas e enviar alertas.
- `BUFFER_AUTOMACAO_SETUP.md`: passo a passo para conectar Buffer, GitHub Actions e fila de publicacao.

## Buffer e publicacao social

O dashboard ja tem campos para `Buffer Channel ID`, texto do post e midia. A automacao de envio fica em:

```txt
scripts/buffer-publish.mjs
.github/workflows/buffer-publish.yml
.github/workflows/buffer-list-channels.yml
```

Para ativar, crie no GitHub Actions o segredo `BUFFER_API_KEY` com a chave salva no 1Password. Depois rode o workflow `Buffer Publish` primeiro com `dry_run = 1`.

## Supabase

O projeto ja esta apontando para:

```txt
https://nbbprjduqtndkwbknyud.supabase.co
```

O arquivo `dashboard/config.js` ja inclui uma chave publicavel do Supabase para ativar o salvamento em nuvem no GitHub Pages.

Tabelas usadas:

```txt
sites
social_accounts
automations
content_items
distribution_tasks
prizes
koin_metrics
approvals
support_messages
faq_entries
report_metrics
governance_rules
```

## Seguranca

O dashboard nao deve armazenar senhas nem tokens em texto aberto. Guarde apenas a referencia do item no cofre de senhas.

Sem login, as politicas atuais do Supabase permitem leitura e escrita com a chave publica anonima. Isso e pratico para testar, mas antes de colocar dados sensiveis ou operacao real em producao, adicione login e politicas RLS por usuario.
