import { supabaseRest } from "../lib/supabase-rest.mjs";
import { HttpError, json, readJsonBody, requestMethod, requireOperatorAuth } from "./lambda-http.mjs";

// Lista branca: o cliente escolhe uma chave daqui, nunca um nome de tabela.
// Sem isso, um operador autenticado poderia ler ou apagar qualquer tabela do
// banco, incluindo vault_credentials.
const COLLECTIONS = {
  sites: { table: "sites", order: "created_at.desc" },
  socials: { table: "social_accounts", order: "created_at.desc" },
  automations: { table: "automations", order: "created_at.desc" },
  content: { table: "content_items", order: "created_at.desc" },
  distribution: { table: "distribution_tasks", order: "created_at.desc" },
  approvals: { table: "approvals", order: "created_at.desc" },
  faqEntries: { table: "faq_entries", order: "created_at.desc" },
  reports: { table: "report_metrics", order: "report_date.desc,created_at.desc" },
  rules: { table: "governance_rules", order: "created_at.desc" }
};

function requireDataConfig() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY precisa estar no backend para acessar os dados.");
  }
}

function collectionConfig(name) {
  const config = COLLECTIONS[String(name || "")];
  if (!config) throw new HttpError(400, `Colecao invalida: ${name}`);
  return config;
}

function normalizeText(value) {
  return String(value || "").trim();
}

async function listAll() {
  const entries = Object.entries(COLLECTIONS);
  const results = await Promise.all(entries.map(async ([key, config]) => {
    const rows = await supabaseRest(`${config.table}?select=*&order=${config.order}`);
    return [key, rows || []];
  }));
  return Object.fromEntries(results);
}

async function insertRow(body) {
  const config = collectionConfig(body.collection);
  const payload = body.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, "Payload invalido.");
  }
  const rows = await supabaseRest(config.table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  const [created] = rows || [];
  if (!created) throw new Error("Nao foi possivel criar o registro.");
  return created;
}

async function updateRow(body) {
  const config = collectionConfig(body.collection);
  const id = normalizeText(body.id);
  if (!id) throw new HttpError(400, "Informe o id do registro.");
  const patch = body.patch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new HttpError(400, "Patch invalido.");
  }
  await supabaseRest(`${config.table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch)
  });
  return { id };
}

async function deleteRow(body) {
  const config = collectionConfig(body.collection);
  const id = normalizeText(body.id);
  if (!id) throw new HttpError(400, "Informe o id do registro.");
  await supabaseRest(`${config.table}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
  return { id };
}

export async function handleData(event) {
  await requireOperatorAuth(event);
  requireDataConfig();

  if (requestMethod(event) !== "POST") {
    throw new HttpError(405, "Use POST.");
  }

  const body = readJsonBody(event);
  const action = normalizeText(body.action || "list");

  if (action === "list") return json(200, { ok: true, data: await listAll() });
  if (action === "insert") return json(200, { ok: true, item: await insertRow(body) });
  if (action === "update") return json(200, { ok: true, ...(await updateRow(body)) });
  if (action === "delete") return json(200, { ok: true, ...(await deleteRow(body)) });

  throw new HttpError(400, `Acao invalida: ${action}`);
}
