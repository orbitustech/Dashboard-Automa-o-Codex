import { requireEnv } from "../lib/config.mjs";
import { fetchJson } from "../lib/http.mjs";
import { googleAccessToken } from "../lib/google-auth.mjs";

// GA4 Data API (runReport). Na AWS nao existe o export nativo para BigQuery,
// entao puxamos dois relatorios agregados por propriedade: sessoes por
// origem/campanha e eventos-chave do funil (cotacao, checkout).
// https://developers.google.com/analytics/devguides/reporting/data/v1

const TRAFFIC_DIMS = ["sessionSource", "sessionMedium", "sessionCampaignName"];

async function runReport(token, propertyId, body) {
  const rows = [];
  for (let offset = 0; ; offset += 100000) {
    const res = await fetchJson(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ ...body, limit: 100000, offset }),
      classify: (status) => (status === 401 ? { code: "token_expired", message: "Credencial GA4 recusada." } : null)
    });
    const dims = (res.dimensionHeaders || []).map((h) => h.name);
    const mets = (res.metricHeaders || []).map((h) => h.name);
    for (const r of res.rows || []) {
      const row = {};
      dims.forEach((name, i) => { row[name] = r.dimensionValues[i].value; });
      mets.forEach((name, i) => { row[name] = r.metricValues[i].value; });
      rows.push(row);
    }
    if (rows.length >= (res.rowCount || 0)) return rows;
  }
}

export default {
  id: "ga4",
  streams: ["ga4_sessions", "ga4_events"],
  async extract({ source, from, to }) {
    requireEnv("GOOGLE_SA_JSON");
    const token = await googleAccessToken("https://www.googleapis.com/auth/analytics.readonly");
    const sessions = [];
    const events = [];
    for (const { property_id } of source.properties) {
      const dateRanges = [{ startDate: from, endDate: to }];
      for (const r of await runReport(token, property_id, {
        dateRanges,
        dimensions: ["date", ...TRAFFIC_DIMS].map((name) => ({ name })),
        metrics: [{ name: "sessions" }, { name: "totalUsers" }]
      })) {
        sessions.push({
          property_id, date: r.date, session_source: r.sessionSource, session_medium: r.sessionMedium,
          session_campaign_name: r.sessionCampaignName, sessions: r.sessions, total_users: r.totalUsers
        });
      }
      for (const r of await runReport(token, property_id, {
        dateRanges,
        dimensions: ["date", "eventName", ...TRAFFIC_DIMS].map((name) => ({ name })),
        metrics: [{ name: "eventCount" }],
        dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: source.events } } }
      })) {
        events.push({
          property_id, date: r.date, event_name: r.eventName, session_source: r.sessionSource,
          session_medium: r.sessionMedium, session_campaign_name: r.sessionCampaignName, event_count: r.eventCount
        });
      }
    }
    return { ga4_sessions: sessions, ga4_events: events };
  }
};
