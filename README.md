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

- `Sites`: cadastre cada projeto (nome, URL, objetivo) e mantenha apenas a referencia do cofre, nunca a senha. O campo `Prompt de temas` guia a geracao de posts para aquele site especifico (publico, tom, o que sempre citar, o que nunca prometer); sem ele, sites novos recebem apenas uma legenda generica e segura ate o prompt ser preenchido. Ao adicionar um site, o dashboard ja cria as 4 automacoes padrao (rascunho de post e de video, 14h e 18h).
- `Redes`: registre os perfis oficiais de cada site e acompanhe cadencia, posts, cliques, crescimento e proxima acao.
- `Automacoes`: cadastre rotinas que a automacao (OpenAI/Gemini via cron) ou integracoes externas vao executar. Use `Rodar` para registrar uma execucao manual e `Pausar` quando a rotina precisar de revisao.
- `Conteudo`: acompanhe tarefas editoriais em kanban. Ao aprovar um item, o dashboard cria automaticamente uma tarefa de distribuicao para cada rede ativa do site; publicacao real depende do workflow e do token de cada rede.
- `Coins`: registre uma leitura atual dos saldos e cadastre premios com custo, estoque, resgates e status.
- `Aprovacoes`: envie decisoes sensiveis para fila humana, como campanhas, premios, respostas de suporte ou mudancas de regras.
- `Suporte`: classifique mensagens por tema, gere uma resposta sugerida, marque como respondida e transforme perguntas repetidas em FAQ.
- `Relatorios`: registre trafego, posts e cadastros por dia para alimentar os graficos e o resumo executivo.
- `Governanca`: mantenha regras de seguranca e limites de automacao, alem das referencias de cofre vindas dos sites.

## Diagnostico e operacao

- `BACKEND_SETUP.md`: como ativar upload de imagem e publicacao imediata via backend.
- `AWS_LOGIN_SETUP.md`: como configurar o login AWS Cognito do dashboard.
- `OPENAI_AUTOMACAO_SETUP.md`: variaveis de ambiente para geracao de texto/imagem com OpenAI.
- `operacao/FLUXO_MELHORIA_POSTS.md`: como pedir ajustes de texto/imagem pelo campo `Prompt de melhoria`.
- `operacao/CHECKLIST_ACEITE.md`: criterios de aceite antes de publicar, responder ou registrar automacoes.
- `operacao/_template_site`: modelo para criar uma pasta de contexto para cada site real.
- `OFFICIAL_APIS_SETUP.md`: passo a passo para aprovar cada rede social, gerar tokens, conectar o GitHub Actions e a fila de publicacao.

## Publicacao social (APIs oficiais)

O dashboard publica direto nas APIs oficiais de cada rede (Instagram, Threads, Facebook, TikTok, LinkedIn, X) em vez de um intermediario como o Buffer. Existem duas camadas:

- GitHub Actions verifica a fila a cada 5 minutos e publica o que estiver com o horario vencido (`scheduled_for` no passado ou vazio).
- Backend seguro permite upload JPG/PNG e o botao `Publicar fila agora`, que forca a publicacao imediata de tudo que estiver pendente.

Como nenhuma API oficial mantem fila/agendamento proprio, o agendamento e feito aqui: o item fica em `distribution_tasks` com `scheduled_for` no futuro e status `fila`; o cron do GitHub Actions publica de verdade quando a hora chega.

A automacao de envio fica em:

```txt
api/publish.js
api/upload-media.js
lib/platform-publisher.mjs
scripts/publish.mjs
.github/workflows/publish.yml
```

Para ativar, crie nos segredos do GitHub Actions (e nas variaveis de ambiente do backend) o token de cada rede que for usar:

```txt
INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID
THREADS_ACCESS_TOKEN, THREADS_USER_ID
FACEBOOK_PAGE_ACCESS_TOKEN, FACEBOOK_PAGE_ID
TIKTOK_ACCESS_TOKEN
LINKEDIN_ACCESS_TOKEN, LINKEDIN_AUTHOR_URN
X_ACCESS_TOKEN
```

So preencha o token da rede que ja tiver aprovacao/acesso liberado na plataforma; as demais ficam pendentes sem quebrar o restante. Detalhes de cada API, requisitos de aprovacao e como preencher o `ID oficial/API` de cada rede na aba `Redes` estao em `OFFICIAL_APIS_SETUP.md`. O workflow `Publish Social Queue` roda manualmente e tambem a cada 5 minutos; antes do primeiro envio real, rode uma vez com `dry_run = 1`.

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
