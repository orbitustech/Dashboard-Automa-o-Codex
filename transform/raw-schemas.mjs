// Contrato da camada raw: colunas como as APIs devolvem (texto), achatadas,
// mais _run_id e _ingested_at. Tipos e regras so a partir do stg.
// Declarar aqui permite criar a tabela vazia quando a fonte ainda nao chegou.

const text = "VARCHAR";
const envelope = { _run_id: text, _ingested_at: text };

export const RAW_STREAMS = {
  meta_ads: {
    dir: "raw/meta_ads",
    columns: { account_id: text, campaign_id: text, campaign_name: text, adset_id: text, adset_name: text, ad_id: text, ad_name: text,
      date_start: text, spend: text, impressions: text, clicks: text, inline_link_clicks: text, reach: text, ...envelope }
  },
  google_ads: {
    dir: "raw/google_ads",
    columns: { customer_id: text, campaign_id: text, campaign_name: text, campaign_status: text, date: text,
      cost_micros: text, impressions: text, clicks: text, ...envelope }
  },
  tiktok_ads: {
    dir: "raw/tiktok_ads",
    columns: { advertiser_id: text, campaign_id: text, campaign_name: text, stat_time_day: text, spend: text,
      impressions: text, clicks: text, ...envelope }
  },
  ga4_sessions: {
    dir: "raw/ga4_sessions",
    columns: { property_id: text, date: text, session_source: text, session_medium: text, session_campaign_name: text,
      sessions: text, total_users: text, ...envelope }
  },
  ga4_events: {
    dir: "raw/ga4_events",
    columns: { property_id: text, date: text, event_name: text, session_source: text, session_medium: text,
      session_campaign_name: text, event_count: text, ...envelope }
  },
  internal_leads: {
    dir: "raw/internal_leads",
    columns: { _source_id: text, marca: text, lead_id: text, contact_hash: text, created_at: text, updated_at: text,
      etapa_atual: text, etapas: text, qualificado: "BOOLEAN", utm_source: text, utm_medium: text, utm_campaign: text,
      utm_content: text, gclid: text, fbclid: text, ttclid: text, ...envelope }
  },
  internal_conversoes: {
    dir: "raw/internal_conversoes",
    columns: { _source_id: text, marca: text, conversao_id: text, lead_id: text, tipo: text, data: text, valor: text,
      status: text, updated_at: text, utm_source: text, utm_medium: text, utm_campaign: text, gclid: text, fbclid: text,
      ttclid: text, ...envelope }
  },
  forecast_budget: {
    dir: "raw/forecast_budget",
    columns: { mes: text, marca: text, canal: text, orcamento: text, meta_leads: text, meta_vendas: text, ...envelope }
  },
  source_runs: {
    dir: "ops/source_runs",
    columns: { run_id: text, source_id: text, started_at: text, finished_at: text, status: text, error_code: text,
      message: text, rows: "BIGINT", window_start: text, window_end: text }
  }
};
