# KoinOps Dashboard

Dashboard operacional para gerenciar sites de pesquisa com Coins, premios, redes sociais, automacoes, conteudo e aprovacoes.

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
- Editor simples de post com upload JPG/PNG via backend seguro
- Fila de publicacao e distribuicao com agendamento, UTMs e link publicado
- Coins com snapshots de metricas, premios, estoque, resgates e alertas
- Fila de aprovacao humana com aprovar/rejeitar
- Suporte e comunidade com classificacao, resposta sugerida e FAQ
- Relatorios com trafego, posts, cadastros e resumo executivo
- Governanca com regras operacionais e referencias de cofre

## Como usar cada aba

- `Sites`: cadastre cada projeto e mantenha apenas a referencia do cofre, nunca a senha.
- `Redes`: registre os perfis oficiais de cada site e acompanhe cadencia, posts, cliques, crescimento e proxima acao.
- `Automacoes`: cadastre rotinas que o Codex ou integracoes externas vao executar. Use `Rodar` para registrar uma execucao manual e `Pausar` quando a rotina precisar de revisao.
- `Conteudo`: acompanhe tarefas editoriais em kanban. Ao aprovar um item, o dashboard cria automaticamente uma tarefa de Buffer para cada rede ativa do site; publicacao real depende do workflow e do `buffer_post_id`.
- `Coins`: registre uma leitura atual dos saldos e cadastre premios com custo, estoque, resgates e status.
- `Aprovacoes`: envie decisoes sensiveis para fila humana, como campanhas, premios, respostas de suporte ou mudancas de regras.
- `Suporte`: classifique mensagens por tema, gere uma resposta sugerida, marque como respondida e transforme perguntas repetidas em FAQ.
- `Relatorios`: registre trafego, posts e cadastros por dia para alimentar os graficos e o resumo executivo.
- `Governanca`: mantenha regras de seguranca e limites de automacao, alem das referencias de cofre vindas dos sites.

## Diagnostico e operacao

- `DIAGNOSTICO_AUTOMACAO.md`: mostra o que falta, o que ja foi feito e quais integracoes precisam da sua intervencao.
- `BACKEND_SETUP.md`: como ativar upload de imagem e publicacao imediata via backend.
- `operacao/PROMPTS_CODEX.md`: prompts fixos para auditoria, conteudo, risco, relatorio e FAQ.
- `operacao/FLUXO_CONTEUDO_CODEX.md`: fluxo onde Codex cria, voce aprova e a automacao publica/agenda.
- `operacao/FLUXO_MELHORIA_POSTS.md`: como pedir ajustes de texto/imagem pelo campo `Prompt de melhoria`.
- `operacao/CHECKLIST_ACEITE.md`: criterios de aceite antes de publicar, responder ou registrar automacoes.
- `operacao/_template_site`: modelo para criar uma pasta de contexto para cada site real.
- `AWS_AUTOMACAO_PLANO.md`: como usar AWS para rodar automacoes, guardar segredos, agendar tarefas e enviar alertas.
- `BUFFER_AUTOMACAO_SETUP.md`: passo a passo para conectar Buffer, GitHub Actions e fila de publicacao.

## Buffer e publicacao social

O dashboard ja tem campos para `Buffer Channel ID`, texto do post e midia. Agora existem duas camadas:

- GitHub Actions publica a fila automaticamente a cada 5 minutos.
- Backend seguro permite upload JPG/PNG e botao `Publicar fila agora`.

A automacao de envio fica em:

```txt
api/publish.js
api/upload-media.js
lib/buffer-publisher.mjs
scripts/buffer-publish.mjs
.github/workflows/buffer-publish.yml
.github/workflows/buffer-list-channels.yml
```

Para ativar, crie no GitHub Actions o segredo `BUFFER_API_KEY` com a chave salva no 1Password. O workflow `Buffer Publish` roda manualmente e tambem a cada 5 minutos; antes do primeiro envio real, rode uma vez com `dry_run = 1`.

Para ativar upload de imagem, publique o backend e configure as variaveis descritas em `BACKEND_SETUP.md`. Depois preencha `Governanca > Backend seguro` no dashboard.

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
