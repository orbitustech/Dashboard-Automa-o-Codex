-- severity: warn
-- descricao: conversao com lead_id que nao existe no painel (lead fora da janela ou id errado)
SELECT c.brand_id, c.conversao_id, c.lead_id
FROM mart.fct_conversoes c
LEFT JOIN mart.fct_leads l USING (brand_id, lead_id)
WHERE c.lead_id IS NOT NULL AND l.lead_id IS NULL
