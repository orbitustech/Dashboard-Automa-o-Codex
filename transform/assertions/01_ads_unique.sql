-- severity: error
-- descricao: fct_ads_daily tem uma linha por dia x canal x conta x campanha x anuncio
SELECT date, channel_id, account_id, campaign_id, ad_id, count(*) AS n
FROM mart.fct_ads_daily
GROUP BY ALL
HAVING count(*) > 1
