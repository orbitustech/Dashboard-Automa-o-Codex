-- Fecha o acesso publico as tabelas do dashboard.
--
-- Rode SOMENTE depois de:
--   1. o PR estar mergeado na main;
--   2. a Lambda estar publicada com o codigo novo (node scripts/deploy-lambda.mjs);
--   3. o secret SUPABASE_SERVICE_ROLE_KEY existir no GitHub Actions.
--
-- Antes disso o dashboard e o cron de publicacao param de enxergar os dados,
-- porque hoje os dois usam a chave anonima.
--
-- Com RLS ligado e nenhuma policy criada, so a service role key (que ignora
-- RLS) acessa as tabelas. E exatamente o mesmo padrao ja aplicado em
-- vault_credentials e vault_audit_log, que estao protegidos e funcionando.

alter table sites              enable row level security;
alter table social_accounts    enable row level security;
alter table automations        enable row level security;
alter table content_items      enable row level security;
alter table distribution_tasks enable row level security;
alter table approvals          enable row level security;
alter table faq_entries        enable row level security;
alter table report_metrics     enable row level security;
alter table governance_rules   enable row level security;

-- Tabelas orfas da aba Coins, removida do dashboard. Nao sao mais lidas por
-- nada; ficam protegidas ate voce decidir se apaga.
alter table prizes       enable row level security;
alter table koin_metrics enable row level security;

-- Conferencia: todas devem aparecer com rowsecurity = true.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
