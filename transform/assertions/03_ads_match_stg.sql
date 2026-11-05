-- severity: error
-- descricao: o mart nao perde nem duplica gasto em relacao ao stg (por conta e dia, tolerancia de 1 centavo)
SELECT s.channel_id, s.account_id, s.date, s.spend AS stg_spend, m.spend AS mart_spend
FROM (SELECT channel_id, account_id, date, sum(spend) AS spend FROM stg.ads_daily GROUP BY ALL) s
FULL JOIN (SELECT channel_id, account_id, date, sum(spend) AS spend FROM mart.fct_ads_daily GROUP BY ALL) m
  USING (channel_id, account_id, date)
WHERE abs(coalesce(s.spend, 0) - coalesce(m.spend, 0)) > 0.01
