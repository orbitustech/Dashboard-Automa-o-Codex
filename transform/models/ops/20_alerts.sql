-- Alertas (PMKT-308). Cada regra vira linhas aqui; o envio por e-mail/Slack
-- le esta tabela depois do build. Severidade: erro (acao hoje) ou aviso.

CREATE OR REPLACE TABLE ops.alerts AS
-- Ultima execucao da fonte falhou.
SELECT
  'erro' AS severity, source_id, last_run_at AS detected_at,
  CASE last_error_code
    WHEN 'token_expired' THEN source_name || ': token recusado pela API. Renovar e atualizar o Secrets Manager.'
    WHEN 'auth' THEN source_name || ': sem permissão na conta. Conferir o acesso do e-mail técnico.'
    WHEN 'rate_limited' THEN source_name || ': limite de chamadas atingido. O reprocessamento de amanhã cobre o dia.'
    WHEN 'contract_violation' THEN source_name || ': o painel enviou dado pessoal. Carga bloqueada.'
    ELSE source_name || ': ' || coalesce(last_message, 'falha sem mensagem')
  END AS message
FROM ops.source_last
WHERE last_status = 'error'

UNION ALL
-- Conta que gastava e parou de mandar dado ha 2 dias.
SELECT 'erro', 'ads', now(),
  a.account_name || ' (' || ch.channel_name || '): conta com gasto e sem dado desde ' || strftime(max(f.date), '%d/%m') || '.'
FROM mart.dim_account a
JOIN mart.dim_channel ch USING (channel_id)
JOIN mart.fct_ads_daily f ON f.account_id = a.account_id AND f.channel_id = a.channel_id
GROUP BY a.account_name, ch.channel_name
HAVING max(f.date) < getvariable('as_of') - INTERVAL 2 DAY
   AND sum(f.spend) FILTER (WHERE f.date >= getvariable('as_of') - INTERVAL 10 DAY) > 0

UNION ALL
-- Campanha ativa fora do padrao de nome: quebra a ligacao anuncio -> lead.
SELECT 'aviso', c.channel_id, now(),
  'Campanha fora do padrão ORB | Marca | Objetivo | Canal: "' || c.campaign_name || '" (R$ '
    || CAST(round(sum(f.spend)) AS BIGINT) || ' nos últimos 7 dias, sem marca).'
FROM mart.dim_campaign c
JOIN mart.fct_ads_daily f USING (campaign_key)
WHERE NOT c.naming_ok AND f.date >= getvariable('as_of') - INTERVAL 7 DAY
GROUP BY c.channel_id, c.campaign_name

UNION ALL
-- Cobertura de atribuicao abaixo do criterio de aceite.
SELECT 'aviso', 'atribuicao', now(),
  b.short_name || ': ' || CAST(round(100 * a.coverage) AS BIGINT) || '% dos leads pagos com campanha identificada (meta: 80%).'
FROM ops.attribution_coverage a
JOIN mart.dim_brand b USING (brand_id)
WHERE a.coverage < 0.8

UNION ALL
-- Marca e canal com gasto no mes e sem orcamento na planilha.
SELECT 'aviso', 'forecast_sheet', now(),
  b.short_name || ' · ' || ch.channel_name || ': gasto no mês sem orçamento na Forecast_MKT_Empresas.'
FROM mart.agg_daily d
JOIN mart.dim_brand b USING (brand_id)
JOIN mart.dim_channel ch USING (channel_id)
WHERE d.date >= CAST(date_trunc('month', getvariable('as_of')) AS DATE) AND d.spend > 0
  AND NOT EXISTS (
    SELECT 1 FROM mart.fct_budget fb
    WHERE fb.month = CAST(date_trunc('month', getvariable('as_of')) AS DATE) AND fb.brand_id = d.brand_id AND fb.channel_id = d.channel_id)
GROUP BY b.short_name, ch.channel_name

UNION ALL
-- Linha da planilha que nao casou com marca ou canal do cadastro.
SELECT 'aviso', 'forecast_sheet', now(),
  'Linha da Forecast_MKT_Empresas não reconhecida: marca "' || marca || '", canal "' || canal || '".'
FROM stg.budget_unmapped;
