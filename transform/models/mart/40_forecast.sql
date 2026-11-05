-- Previsao do mes, niveis 1 e 2 do documento:
--   Projecao = realizado ate ontem + media diaria dos ultimos 7 dias x dias restantes
--   (dias restantes inclui hoje). Faixa de ~80% pelo desvio dos ultimos 28 dias;
--   o nivel 3 (modelo de serie temporal) substitui a faixa na Fase 3.
-- Tres niveis de agregacao: marca x canal, marca ('_todos') e grupo ('_grupo').

CREATE OR REPLACE TABLE mart.fct_forecast AS
WITH p AS (
  SELECT getvariable('as_of') AS as_of,
         CAST(date_trunc('month', getvariable('as_of')) AS DATE) AS month_start,
         last_day(getvariable('as_of')) AS month_end
),
levels AS (
  SELECT date,
    CASE WHEN grouping(brand_id) = 1 THEN '_grupo' ELSE brand_id END AS brand_id,
    CASE WHEN grouping(channel_id) = 1 THEN '_todos' ELSE channel_id END AS channel_id,
    sum(spend) AS spend, sum(leads) AS leads, sum(qualified) AS qualified,
    sum(conversions) AS conversions, sum(revenue) AS revenue
  FROM mart.agg_daily
  GROUP BY GROUPING SETS ((date, brand_id, channel_id), (date, brand_id), (date))
),
long AS (
  UNPIVOT levels ON spend, leads, qualified, conversions, revenue INTO NAME metric VALUE value
),
stats AS (
  SELECT brand_id, channel_id, metric,
    coalesce(sum(value) FILTER (WHERE date >= p.month_start AND date < p.as_of), 0) AS actual_to_date,
    coalesce(sum(value) FILTER (WHERE date >= p.as_of - INTERVAL 7 DAY AND date < p.as_of), 0) / 7.0 AS daily_avg_7d,
    coalesce(stddev_samp(value) FILTER (WHERE date >= p.as_of - INTERVAL 28 DAY AND date < p.as_of), 0) AS daily_sd_28d,
    coalesce(sum(value) FILTER (WHERE date = p.as_of), 0) AS today_partial
  FROM long, p
  GROUP BY ALL
),
budget AS (
  SELECT
    CASE WHEN grouping(b.brand_id) = 1 THEN '_grupo' ELSE b.brand_id END AS brand_id,
    CASE WHEN grouping(b.channel_id) = 1 THEN '_todos' ELSE b.channel_id END AS channel_id,
    sum(b.budget) AS budget, sum(b.goal_leads) AS goal_leads, sum(b.goal_sales) AS goal_sales
  FROM mart.fct_budget b, p
  WHERE b.month = p.month_start
  GROUP BY GROUPING SETS ((b.brand_id, b.channel_id), (b.brand_id), ())
),
proj AS (
  SELECT s.*, p.month_start, p.as_of,
    date_diff('day', p.as_of, p.month_end) + 1 AS days_remaining,
    date_diff('day', p.month_start, p.as_of) AS days_elapsed,
    date_diff('day', p.month_start, p.month_end) + 1 AS days_in_month
  FROM stats s, p
)
SELECT
  r.month_start AS month, r.as_of, r.brand_id, r.channel_id, r.metric,
  r.actual_to_date, r.today_partial, r.daily_avg_7d, r.days_remaining, r.days_elapsed, r.days_in_month,
  r.actual_to_date + r.daily_avg_7d * r.days_remaining AS projection,
  greatest(r.actual_to_date, r.actual_to_date + r.daily_avg_7d * r.days_remaining - 1.28 * r.daily_sd_28d * sqrt(r.days_remaining)) AS projection_low,
  r.actual_to_date + r.daily_avg_7d * r.days_remaining + 1.28 * r.daily_sd_28d * sqrt(r.days_remaining) AS projection_high,
  CASE r.metric
    WHEN 'spend' THEN b.budget
    WHEN 'leads' THEN b.goal_leads
    WHEN 'conversions' THEN b.goal_sales
  END AS target,
  'pacing_7d' AS method
FROM proj r
LEFT JOIN budget b ON b.brand_id = r.brand_id AND b.channel_id = r.channel_id;

-- Funil reverso (nivel 2): quanto falta investir para bater a meta do mes,
-- mantido o custo por resultado dos ultimos 28 dias. A meta de cada marca
-- e a do dicionario de KPIs (goal_metric): leads, leads qualificados ou vendas.
CREATE OR REPLACE TABLE mart.fct_reverse_funnel AS
WITH goal AS (
  SELECT b.brand_id, b.goal_metric,
    CASE b.goal_metric WHEN 'qualified_leads' THEN 'qualified' ELSE b.goal_metric END AS metric
  FROM mart.dim_brand b
),
target AS (
  SELECT brand_id, sum(goal_leads) AS goal_leads, sum(goal_sales) AS goal_sales
  FROM mart.fct_budget WHERE month = CAST(date_trunc('month', getvariable('as_of')) AS DATE)
  GROUP BY ALL
),
last28 AS (
  SELECT brand_id, sum(spend) AS spend, sum(leads) AS leads, sum(qualified) AS qualified, sum(conversions) AS conversions
  FROM mart.agg_daily
  WHERE date >= getvariable('as_of') - INTERVAL 28 DAY AND date < getvariable('as_of')
  GROUP BY ALL
)
SELECT
  g.brand_id, g.goal_metric, g.metric,
  CASE WHEN g.metric = 'conversions' THEN t.goal_sales ELSE t.goal_leads END AS target,
  f.actual_to_date, f.projection, f.days_remaining,
  CASE g.metric WHEN 'leads' THEN l.spend / nullif(l.leads, 0)
                WHEN 'qualified' THEN l.spend / nullif(l.qualified, 0)
                ELSE l.spend / nullif(l.conversions, 0) END AS cost_per_unit_28d,
  l.conversions / nullif(l.leads, 0) AS lead_to_sale_rate_28d,
  greatest((CASE WHEN g.metric = 'conversions' THEN t.goal_sales ELSE t.goal_leads END) - f.actual_to_date, 0) AS missing_to_goal,
  greatest((CASE WHEN g.metric = 'conversions' THEN t.goal_sales ELSE t.goal_leads END) - f.projection, 0) AS gap_after_projection,
  greatest((CASE WHEN g.metric = 'conversions' THEN t.goal_sales ELSE t.goal_leads END) - f.projection, 0)
    * (CASE g.metric WHEN 'leads' THEN l.spend / nullif(l.leads, 0)
                     WHEN 'qualified' THEN l.spend / nullif(l.qualified, 0)
                     ELSE l.spend / nullif(l.conversions, 0) END) AS extra_spend_needed
FROM goal g
LEFT JOIN target t USING (brand_id)
LEFT JOIN last28 l USING (brand_id)
LEFT JOIN mart.fct_forecast f ON f.brand_id = g.brand_id AND f.channel_id = '_todos' AND f.metric = g.metric;
