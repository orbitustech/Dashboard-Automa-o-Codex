import { requireEnv } from "../lib/config.mjs";
import { fetchJson } from "../lib/http.mjs";
import { googleAccessToken } from "../lib/google-auth.mjs";

// Google Ads API via REST searchStream (GAQL), por campanha e dia.
// Precisa do developer token aprovado (PMKT-302) e do OAuth do e-mail
// tecnico com acesso a MCC e as contas fora dela.
// https://developers.google.com/google-ads/api/rest/common/search

const QUERY = (from, to) => `
  SELECT customer.id, campaign.id, campaign.name, campaign.status, segments.date,
         metrics.cost_micros, metrics.impressions, metrics.clicks
  FROM campaign
  WHERE segments.date BETWEEN '${from}' AND '${to}'`;

function classify(status, body) {
  const detail = JSON.stringify(body || "");
  if (status === 401 || detail.includes("UNAUTHENTICATED")) return { code: "token_expired", message: "OAuth Google Ads recusado." };
  if (detail.includes("DEVELOPER_TOKEN_NOT_APPROVED")) return { code: "auth", message: "Developer token ainda sem acesso basico." };
  if (detail.includes("USER_PERMISSION_DENIED")) return { code: "auth", message: "E-mail tecnico sem acesso a conta." };
  return null;
}

export default {
  id: "google_ads",
  streams: ["google_ads"],
  async extract({ source, from, to }) {
    const { GOOGLE_ADS_DEVELOPER_TOKEN } = requireEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_OAUTH_REFRESH_TOKEN");
    const version = process.env.GOOGLE_ADS_API_VERSION || "v21";
    const token = await googleAccessToken("https://www.googleapis.com/auth/adwords", { preferServiceAccount: false });
    const rows = [];
    for (const account of source.accounts) {
      const headers = {
        authorization: `Bearer ${token}`,
        "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
        "content-type": "application/json"
      };
      // Contas fora da MCC sao acessadas direto, sem login-customer-id.
      if (account.owner === "MCC" && source.login_customer_id) headers["login-customer-id"] = source.login_customer_id;
      const chunks = await fetchJson(
        `https://googleads.googleapis.com/${version}/customers/${account.account_id}/googleAds:searchStream`,
        { method: "POST", headers, body: JSON.stringify({ query: QUERY(from, to) }), classify }
      );
      for (const chunk of chunks || []) {
        for (const r of chunk.results || []) {
          rows.push({
            customer_id: String(r.customer.id),
            campaign_id: String(r.campaign.id),
            campaign_name: r.campaign.name,
            campaign_status: r.campaign.status,
            date: r.segments.date,
            cost_micros: String(r.metrics.costMicros ?? "0"),
            impressions: String(r.metrics.impressions ?? "0"),
            clicks: String(r.metrics.clicks ?? "0")
          });
        }
      }
    }
    return { google_ads: rows };
  }
};
