-- severity: error
-- descricao: fct_leads tem um registro por marca x lead_id
SELECT brand_id, lead_id, count(*) AS n
FROM mart.fct_leads
GROUP BY ALL
HAVING count(*) > 1
