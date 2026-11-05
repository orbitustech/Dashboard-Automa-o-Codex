import { requireEnv } from "../lib/config.mjs";
import { fetchJson } from "../lib/http.mjs";
import { lastWatermark } from "../lib/lake.mjs";

// Cliente unico do contrato de exportacao (contract/marketing-export.openapi.yaml).
// Serve para todos os paineis internos: cada painel novo e so uma entrada
// em config/sources.json com URL e token.

export const LEAD_FIELDS = [
  "marca", "lead_id", "contact_hash", "created_at", "updated_at", "etapa_atual", "etapas", "qualificado",
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "gclid", "fbclid", "ttclid"
];
export const CONVERSION_FIELDS = [
  "marca", "conversao_id", "lead_id", "tipo", "data", "valor", "status", "updated_at",
  "utm_source", "utm_medium", "utm_campaign", "gclid", "fbclid", "ttclid"
];

// Campos que nao podem sair do backend (LGPD). Se aparecerem, a carga falha.
const FORBIDDEN = ["nome", "name", "telefone", "phone", "email", "cpf", "placa", "endereco"];

export function toRawRecord(sourceId, record, fields) {
  const leaked = FORBIDDEN.filter((f) => f in record);
  if (leaked.length) {
    const err = new Error(`Contrato violado: ${sourceId} enviou dado pessoal (${leaked.join(", ")}).`);
    err.code = "contract_violation";
    throw err;
  }
  const row = { _source_id: sourceId };
  for (const f of fields) {
    const v = record[f];
    row[f] = f === "etapas" ? JSON.stringify(v || []) : v ?? null;
  }
  return row;
}

async function pull(baseUrl, token, entity, since) {
  const out = [];
  let cursor = null;
  do {
    const params = new URLSearchParams({ updated_since: since });
    if (cursor) params.set("cursor", cursor);
    const page = await fetchJson(`${baseUrl}/api/marketing-export/${entity}?${params}`, {
      headers: { authorization: `Bearer ${token}` },
      classify: (status) => (status === 401 || status === 403 ? { code: "token_expired", message: "Token de servico do painel recusado." } : null)
    });
    out.push(...(page.data || []));
    cursor = page.next_cursor || null;
  } while (cursor);
  return out;
}

export default {
  id: "internal",
  streams: ["internal_leads", "internal_conversoes"],
  async extract({ source, from }) {
    const env = requireEnv(source.env_base_url, source.env_token);
    const baseUrl = env[source.env_base_url].replace(/\/$/, "");
    const token = env[source.env_token];
    const result = { internal_leads: [], internal_conversoes: [], watermarks: {} };
    for (const [stream, entity, fields] of [
      ["internal_leads", "leads", LEAD_FIELDS],
      ["internal_conversoes", "conversoes", CONVERSION_FIELDS]
    ]) {
      const since = lastWatermark(source.source_id, stream) || `${from}T00:00:00-03:00`;
      const records = await pull(baseUrl, token, entity, since);
      result[stream] = records.map((r) => toRawRecord(source.source_id, r, fields));
      const max = records.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), since);
      result.watermarks[stream] = max;
    }
    return result;
  }
};
