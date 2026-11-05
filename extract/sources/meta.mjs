import { requireEnv } from "../lib/config.mjs";
import { fetchJson } from "../lib/http.mjs";

// Marketing API /insights por anuncio e dia, com o token do usuario do
// sistema no BM Orbitus (acesso de parceiro nas BMs das marcas).
// https://developers.facebook.com/docs/marketing-api/insights

const FIELDS = [
  "account_id", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name",
  "spend", "impressions", "clicks", "inline_link_clicks", "reach"
];

function classify(status, body) {
  const err = body?.error;
  if (!err) return null;
  if (err.code === 190) return { code: "token_expired", message: `Token Meta vencido ou revogado: ${err.message}` };
  if (err.code === 17 || err.code === 613 || err.code === 80004) return { code: "rate_limited", message: err.message };
  if (err.code === 200 || err.code === 10) return { code: "auth", message: `Sem permissao na conta: ${err.message}` };
  return { code: "http_error", message: err.message };
}

export default {
  id: "meta_ads",
  streams: ["meta_ads"],
  async extract({ source, from, to }) {
    const { META_ACCESS_TOKEN } = requireEnv("META_ACCESS_TOKEN");
    const version = process.env.META_API_VERSION || "v23.0";
    const rows = [];
    for (const account of source.accounts) {
      const params = new URLSearchParams({
        level: "ad",
        time_increment: "1",
        time_range: JSON.stringify({ since: from, until: to }),
        fields: FIELDS.join(","),
        limit: "500",
        access_token: META_ACCESS_TOKEN
      });
      let url = `https://graph.facebook.com/${version}/${account.account_id}/insights?${params}`;
      while (url) {
        const page = await fetchJson(url, { classify });
        for (const r of page.data || []) {
          rows.push({
            account_id: `act_${r.account_id}`,
            campaign_id: r.campaign_id,
            campaign_name: r.campaign_name,
            adset_id: r.adset_id,
            adset_name: r.adset_name,
            ad_id: r.ad_id,
            ad_name: r.ad_name,
            date_start: r.date_start,
            spend: r.spend,
            impressions: r.impressions,
            clicks: r.clicks,
            inline_link_clicks: r.inline_link_clicks ?? null,
            reach: r.reach ?? null
          });
        }
        url = page.paging?.next || null;
      }
    }
    return { meta_ads: rows };
  }
};
