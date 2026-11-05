-- severity: error
-- descricao: gasto, impressoes e cliques nao negativos e cliques <= impressoes
SELECT *
FROM mart.fct_ads_daily
WHERE spend < 0 OR impressions < 0 OR clicks < 0 OR clicks > impressions
