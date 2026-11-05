-- severity: error
-- descricao: todo lead e conversao vem de uma marca do cadastro (config/brands.json)
SELECT 'lead' AS kind, brand_id FROM mart.fct_leads WHERE brand_id NOT IN (SELECT brand_id FROM mart.dim_brand)
UNION ALL
SELECT 'conversao', brand_id FROM mart.fct_conversoes WHERE brand_id NOT IN (SELECT brand_id FROM mart.dim_brand)
