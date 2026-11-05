import { createSign } from "node:crypto";
import { fetchJson } from "./http.mjs";

// Token de acesso Google para Google Ads e GA4 Data API, sem SDK.
// Dois jeitos, na ordem:
//   1. conta de servico (GOOGLE_SA_JSON), recomendado para GA4;
//   2. OAuth do e-mail tecnico (GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN),
//      obrigatorio para Google Ads, que nao aceita conta de servico sem
//      delegacao de dominio.

const cache = new Map();

function classifyOAuth(status, body) {
  if (body?.error === "invalid_grant") return { code: "token_expired", message: "Refresh token Google revogado ou vencido." };
  return null;
}

async function serviceAccountToken(saJson, scope) {
  const sa = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  return fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    classify: classifyOAuth
  });
}

async function refreshToken(scope) {
  return fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
      scope
    }),
    classify: classifyOAuth
  });
}

export async function googleAccessToken(scope, { preferServiceAccount = true } = {}) {
  const hit = cache.get(scope);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;
  const useSa = preferServiceAccount && process.env.GOOGLE_SA_JSON;
  const res = useSa ? await serviceAccountToken(process.env.GOOGLE_SA_JSON, scope) : await refreshToken(scope);
  cache.set(scope, { token: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 });
  return res.access_token;
}
