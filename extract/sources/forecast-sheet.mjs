import { requireEnv } from "../lib/config.mjs";
import { ApiError } from "../lib/http.mjs";

// Forecast_MKT_Empresas publicada como CSV (Arquivo > Compartilhar > Publicar
// na Web > CSV, ou export?format=csv com link restrito ao e-mail tecnico).
// Colunas esperadas: mes, marca, canal, orcamento, meta_leads, meta_vendas.

export const BUDGET_COLUMNS = ["mes", "marca", "canal", "orcamento", "meta_leads", "meta_vendas"];

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export function budgetRows(text) {
  const [header, ...lines] = parseCsv(text);
  const names = header.map((h) => h.trim().toLowerCase());
  const missing = BUDGET_COLUMNS.filter((c) => !names.includes(c));
  if (missing.length) throw new ApiError(`Planilha sem as colunas: ${missing.join(", ")}`, { code: "schema_changed" });
  return lines.map((cells) => Object.fromEntries(BUDGET_COLUMNS.map((c) => [c, (cells[names.indexOf(c)] ?? "").trim()])));
}

export default {
  id: "forecast_sheet",
  streams: ["forecast_budget"],
  async extract({ source }) {
    const env = requireEnv(source.env_csv_url);
    const res = await fetch(env[source.env_csv_url]);
    if (!res.ok) throw new ApiError(`Planilha respondeu HTTP ${res.status}`, { status: res.status, code: res.status === 403 ? "auth" : "http_error" });
    return { forecast_budget: budgetRows(await res.text()) };
  }
};
