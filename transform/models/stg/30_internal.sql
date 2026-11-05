-- Paineis internos pelo contrato de exportacao. A carga e incremental por
-- updated_at, entao o mesmo lead chega varias vezes; fica a versao mais nova.

CREATE OR REPLACE TABLE stg.leads AS
SELECT
  _source_id AS source_id,
  marca AS brand_id,
  lead_id, contact_hash,
  local_ts(created_at) AS created_at,
  local_ts(updated_at) AS updated_at,
  etapa_atual AS current_stage,
  coalesce(qualificado, false) AS is_qualified,
  nullif(trim(utm_source), '') AS utm_source,
  nullif(trim(utm_medium), '') AS utm_medium,
  nullif(trim(utm_campaign), '') AS utm_campaign,
  nullif(trim(utm_content), '') AS utm_content,
  nullif(gclid, '') AS gclid, nullif(fbclid, '') AS fbclid, nullif(ttclid, '') AS ttclid,
  etapas
FROM raw.internal_leads
QUALIFY row_number() OVER (PARTITION BY marca, lead_id ORDER BY updated_at DESC, _ingested_at DESC) = 1;

CREATE OR REPLACE TABLE stg.lead_stages AS
SELECT
  l.brand_id, l.lead_id,
  e.etapa AS stage,
  local_ts(e.data) AS reached_at
FROM stg.leads l,
  unnest(from_json(l.etapas, '[{"etapa": "VARCHAR", "data": "VARCHAR"}]')) AS t(e);

CREATE OR REPLACE TABLE stg.conversoes AS
SELECT
  _source_id AS source_id,
  marca AS brand_id,
  conversao_id, nullif(lead_id, '') AS lead_id, tipo,
  local_ts(data) AS converted_at,
  CAST(valor AS DOUBLE) AS value,
  status,
  local_ts(updated_at) AS updated_at,
  nullif(trim(utm_source), '') AS utm_source,
  nullif(trim(utm_medium), '') AS utm_medium,
  nullif(trim(utm_campaign), '') AS utm_campaign,
  nullif(gclid, '') AS gclid, nullif(fbclid, '') AS fbclid, nullif(ttclid, '') AS ttclid
FROM raw.internal_conversoes
QUALIFY row_number() OVER (PARTITION BY marca, conversao_id ORDER BY updated_at DESC, _ingested_at DESC) = 1;
