import { requireEnv } from "../lib/config.mjs";
import { fetchJson } from "../lib/http.mjs";
import { chunkRange } from "../lib/dates.mjs";

// TikTok API for Business v1.3, relatorio integrado por campanha e dia.
// O relatorio diario aceita no maximo 30 dias por chamada.
// https://business-api.tiktok.com/portal/docs?id=1740302848100353

const TOKEN_CODES = new Set([40102, 40104, 40105]);

function classify(status, body) {
  if (!body || body.code === 0) return null;
  if (TOKEN_CODES.has(body.code)) return { code: "token_expired", message: `Token TikTok recusado: ${body.message}` };
  if (body.code === 40100 || body.code === 51021) return { code: "rate_limited", message: body.message };
  return { code: "http_error", message: `TikTok ${body.code}: ${body.message}` };
}

export default {
  id: "tiktok_ads",
  streams: ["tiktok_ads"],
  async extract({ source, from, to }) {
    const { TIKTOK_ACCESS_TOKEN } = requireEnv("TIKTOK_ACCESS_TOKEN");
    const rows = [];
    for (const account of source.accounts) {
      for (const [start, end] of chunkRange(from, to, 30)) {
        for (let page = 1, totalPages = 1; page <= totalPages; page++) {
          const params = new URLSearchParams({
            advertiser_id: account.account_id,
            report_type: "BASIC",
            data_level: "AUCTION_CAMPAIGN",
            dimensions: JSON.stringify(["campaign_id", "stat_time_day"]),
            metrics: JSON.stringify(["campaign_name", "spend", "impressions", "clicks"]),
            start_date: start,
            end_date: end,
            page: String(page),
            page_size: "1000"
          });
          const body = await fetchJson(`https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?${params}`, {
            headers: { "Access-Token": TIKTOK_ACCESS_TOKEN },
            classify
          });
          totalPages = body.data?.page_info?.total_page || 1;
          for (const item of body.data?.list || []) {
            rows.push({
              advertiser_id: account.account_id,
              campaign_id: String(item.dimensions.campaign_id),
              campaign_name: item.metrics.campaign_name,
              stat_time_day: item.dimensions.stat_time_day,
              spend: item.metrics.spend,
              impressions: item.metrics.impressions,
              clicks: item.metrics.clicks
            });
          }
        }
      }
    }
    return { tiktok_ads: rows };
  }
};
