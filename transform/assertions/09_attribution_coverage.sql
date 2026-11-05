-- severity: warn
-- descricao: marca com menos de 80% dos leads pagos com campanha identificada nos ultimos 7 dias
SELECT brand_id, coverage FROM ops.attribution_coverage WHERE coverage < 0.8
