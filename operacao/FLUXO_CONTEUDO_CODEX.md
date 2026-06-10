# Fluxo de Conteudo: Codex cria, usuario aprova, automacao publica

## Papel do Codex

Eu posso:

- Planejar calendario editorial.
- Criar ideias por site e por rede.
- Escrever posts, artigos, e-mails, FAQs e roteiros.
- Adaptar o mesmo tema para varios canais.
- Classificar risco do conteudo.
- Enviar conteudo sensivel para aprovacao.
- Depois da aprovacao, preparar a tarefa de publicacao no dashboard.

## Papel do usuario

Voce aprova:

- Promessas sobre premios.
- Regras de Coins.
- Comparacoes com concorrentes.
- Comunicados sensiveis.
- Respostas de reclamacao.
- Qualquer publicacao que possa afetar reputacao.

## Papel da automacao/AWS

Depois da aprovacao, a automacao pode:

- Criar rascunho no CMS.
- Agendar post em ferramenta social.
- Adicionar UTM.
- Registrar link publicado.
- Atualizar status no dashboard.
- Enviar alerta se falhar.

## Estados no dashboard

| Estado | Significado |
|---|---|
| Rascunho | Ideia ou texto inicial. |
| Aprovacao | Precisa de revisao humana. |
| Agendado | Aprovado e pronto para distribuicao. |
| Publicado | Publicado ou registrado como publicado. |

## Regra de seguranca

Enquanto nao houver tokens e integracoes revisadas, a automacao nao publica fora do dashboard. Ela apenas prepara rascunhos, tarefas e sugestoes.

## Prompt de producao semanal

```txt
Codex, crie o calendario de conteudo da semana para o site [nome]. Use o contexto em operacao/[site]. Gere 5 ideias, 3 posts curtos, 1 artigo, 1 FAQ e 1 e-mail. Classifique o risco de cada item e mande para aprovacao tudo que citar premios, Coins, prazos, ganhos ou regras.
```

## Prompt de adaptacao multicanal

```txt
Codex, transforme este tema em: artigo curto, post Instagram, roteiro de video curto, e-mail e FAQ. Mantenha linguagem transparente, sem promessa de ganho garantido. Inclua CTA e indique se exige aprovacao humana.
```

## Prompt de publicacao apos aprovacao

```txt
Codex, pegue os conteudos aprovados no dashboard, gere as tarefas de distribuicao com destino, UTM source, UTM medium, UTM campaign e proxima acao. Nao publique nada sem token configurado e sem status aprovado.
```

