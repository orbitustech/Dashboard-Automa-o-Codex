-- Forecast_MKT_Empresas. A planilha e sempre carga completa: vale so a
-- ultima leitura. Marca e canal sao escritos a mao, entao o mapeamento e por
-- apelido normalizado; o que nao casar vai para stg.budget_unmapped.

CREATE OR REPLACE TABLE stg.budget_raw AS
SELECT
  CAST(mes || '-01' AS DATE) AS month,
  marca, canal,
  norm_text(marca) AS marca_norm,
  norm_text(canal) AS canal_norm,
  parse_brl(orcamento) AS budget,
  TRY_CAST(parse_brl(meta_leads) AS BIGINT) AS goal_leads,
  TRY_CAST(parse_brl(meta_vendas) AS BIGINT) AS goal_sales,
  _ingested_at
FROM raw.forecast_budget
WHERE _ingested_at = (SELECT max(_ingested_at) FROM raw.forecast_budget);

CREATE OR REPLACE TABLE stg.budget AS
SELECT b.month, a.brand_id, c.channel_id, b.budget, b.goal_leads, b.goal_sales, b._ingested_at
FROM stg.budget_raw b
JOIN seed.brand_aliases a ON a.alias = b.marca_norm
JOIN seed.channels c ON c.campaign_token = b.canal_norm OR c.channel_id = b.canal_norm OR norm_text(c.channel_name) = b.canal_norm;

CREATE OR REPLACE TABLE stg.budget_unmapped AS
SELECT b.*
FROM stg.budget_raw b
WHERE NOT EXISTS (SELECT 1 FROM seed.brand_aliases a WHERE a.alias = b.marca_norm)
   OR NOT EXISTS (SELECT 1 FROM seed.channels c WHERE c.campaign_token = b.canal_norm OR c.channel_id = b.canal_norm OR norm_text(c.channel_name) = b.canal_norm);
