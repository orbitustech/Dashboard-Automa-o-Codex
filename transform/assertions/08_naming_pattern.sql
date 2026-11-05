-- severity: warn
-- descricao: campanha ativa fora do padrao ORB | Marca | Objetivo | Canal (PMKT-307)
SELECT campaign_key, campaign_name FROM mart.dim_campaign WHERE is_active AND NOT naming_ok
