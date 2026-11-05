-- Saude dos dados: o que cada fonte entregou, quando, e o que precisa de gente.
-- O status "atrasada" depende da hora em que alguem olha, entao a API
-- compara last_ok_at com o SLA na hora da consulta; aqui fica so o fato.

CREATE OR REPLACE TABLE ops.source_runs AS
SELECT
  run_id, source_id,
  timezone('America/Sao_Paulo', CAST(started_at AS TIMESTAMPTZ)) AS started_at,
  timezone('America/Sao_Paulo', CAST(finished_at AS TIMESTAMPTZ)) AS finished_at,
  status, error_code, message, rows, window_start, window_end
FROM raw.source_runs;

CREATE OR REPLACE TABLE ops.source_last AS
SELECT
  s.source_id, s.source_name, s.kind, s.channel_id, s.frequency, s.sla_hours, s.scope, s.n_accounts, s.sort_order,
  max(r.started_at) AS last_run_at,
  arg_max(r.status, r.started_at) AS last_status,
  arg_max(r.error_code, r.started_at) AS last_error_code,
  arg_max(r.message, r.started_at) AS last_message,
  max(r.started_at) FILTER (WHERE r.status = 'ok') AS last_ok_at,
  arg_max(r.rows, r.started_at) FILTER (WHERE r.status = 'ok') AS last_ok_rows
FROM seed.sources s
LEFT JOIN ops.source_runs r USING (source_id)
GROUP BY ALL;

-- Ultimo status de cada fonte em cada dia. Uma falha resolvida por nova
-- tentativa automatica no mesmo dia nao conta como falha.
CREATE OR REPLACE TABLE ops.run_days AS
SELECT CAST(started_at AS DATE) AS day, source_id,
  arg_max(status, started_at) AS last_status,
  count(*) FILTER (WHERE status = 'error') AS errors
FROM ops.source_runs
GROUP BY ALL;

-- Criterio de aceite: 7 dias seguidos sem intervencao manual. Conta os dias
-- completos (ate ontem) em que toda fonte diaria terminou o dia sem erro.
CREATE OR REPLACE TABLE ops.streak AS
WITH daily_sources AS (
  SELECT count(*) AS n FROM seed.sources WHERE frequency NOT LIKE 'Semanal%'
),
days AS (
  SELECT d.day,
    count(*) FILTER (WHERE d.last_status IN ('ok', 'skipped')) AS ok_sources
  FROM ops.run_days d
  JOIN seed.sources s USING (source_id)
  WHERE s.frequency NOT LIKE 'Semanal%' AND d.day < getvariable('as_of')
  GROUP BY ALL
),
spine AS (
  SELECT CAST(t.d AS DATE) AS day
  FROM generate_series((SELECT min(day) FROM ops.run_days), getvariable('as_of') - INTERVAL 1 DAY, INTERVAL 1 DAY) AS t(d)
),
judged AS (
  SELECT s.day, coalesce(d.ok_sources, 0) >= (SELECT n FROM daily_sources) AS all_ok
  FROM spine s LEFT JOIN days d USING (day)
)
SELECT
  coalesce(date_diff('day', max(day) FILTER (WHERE NOT all_ok), getvariable('as_of')) - 1, count(*)) AS days_without_failure,
  max(day) FILTER (WHERE NOT all_ok) AS last_failure_day,
  7 AS target_days
FROM judged;

-- Leads pagos com campanha identificada (criterio de aceite: >= 80%), ultimos 7 dias completos.
CREATE OR REPLACE TABLE ops.attribution_coverage AS
SELECT
  CASE WHEN grouping(brand_id) = 1 THEN '_grupo' ELSE brand_id END AS brand_id,
  count(*) FILTER (WHERE is_paid) AS paid_leads,
  count(*) FILTER (WHERE is_paid AND campaign_key IS NOT NULL) AS paid_leads_with_campaign,
  count(*) FILTER (WHERE is_paid AND campaign_key IS NOT NULL) / nullif(count(*) FILTER (WHERE is_paid), 0) AS coverage,
  count(*) FILTER (WHERE attribution_method = 'sem_origem') / count(*) AS share_without_origin
FROM mart.fct_leads
WHERE NOT is_duplicate
  AND created_date >= getvariable('as_of') - INTERVAL 7 DAY AND created_date < getvariable('as_of')
GROUP BY GROUPING SETS ((brand_id), ());
