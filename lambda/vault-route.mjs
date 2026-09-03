import { supabaseRest } from "../lib/supabase-rest.mjs";
import {
  decryptVaultSecret,
  encryptVaultSecret,
  kmsCredentialsConfigured,
  kmsVaultConfigured,
  vaultPayloadState
} from "../lib/aws-kms-vault.mjs";
import { HttpError, json, readJsonBody, requestMethod, requireOperatorAuth } from "./lambda-http.mjs";

const TABLE = "vault_credentials";
const FIELDS = [
  "id",
  "label",
  "platform",
  "login",
  "secret",
  "kind",
  "usage_type",
  "recovery_email",
  "recovery_phone",
  "notes",
  "site_id",
  "status",
  "created_at",
  "updated_at"
].join(",");

function requireVaultConfig() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY precisa estar no backend para operar o Cofre.");
  }
  if (!kmsVaultConfigured()) {
    throw new Error("AWS_KMS_KEY_ID precisa estar no backend para criptografar o Cofre.");
  }
  if (!kmsCredentialsConfigured()) {
    throw new Error("Credenciais ou role AWS precisam estar disponiveis no backend para chamar o KMS.");
  }
}

function actorFromAuth(auth) {
  const claims = auth?.claims || {};
  return {
    actor: claims.email || claims.username || claims["cognito:username"] || claims.sub || auth?.type || "operator",
    actorType: auth?.type || "operator"
  };
}

function normalizeText(value) {
  return String(value || "").trim();
}

// O segredo nunca sai daqui: a listagem devolve apenas o estado da credencial.
function sanitizeVaultItem(item = {}) {
  return {
    id: item.id,
    label: item.label || "",
    platform: item.platform || "",
    login: item.login || "",
    secret_state: vaultPayloadState(item.secret),
    kind: item.kind || "senha",
    usage_type: item.usage_type || "perfil_principal",
    recovery_email: item.recovery_email || "",
    recovery_phone: item.recovery_phone || "",
    notes: item.notes || "",
    site_id: item.site_id || "",
    status: item.status || "ativo",
    created_at: item.created_at || null,
    updated_at: item.updated_at || null
  };
}

async function auditVault({ vaultId, action, actor, actorType, detail }) {
  try {
    await supabaseRest("vault_audit_log", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        vault_id: vaultId || null,
        action,
        actor,
        actor_type: actorType,
        detail: detail || ""
      })
    });
  } catch (error) {
    console.warn("vault audit skipped", error.message);
  }
}

async function listVaultItems() {
  const rows = await supabaseRest(`${TABLE}?select=${FIELDS}&order=created_at.desc`);
  return rows.map(sanitizeVaultItem);
}

async function fetchVaultItem(id) {
  const rows = await supabaseRest(`${TABLE}?select=${FIELDS}&id=eq.${encodeURIComponent(id)}&limit=1`);
  const [item] = rows || [];
  if (!item) throw new Error("Credencial nao encontrada.");
  return item;
}

async function saveVaultItem(body, auth) {
  const { actor, actorType } = actorFromAuth(auth);
  const id = normalizeText(body.id);
  const secret = normalizeText(body.secret);
  const siteId = normalizeText(body.site_id);

  const row = {
    label: normalizeText(body.label),
    platform: normalizeText(body.platform),
    login: normalizeText(body.login),
    kind: normalizeText(body.kind) || "senha",
    usage_type: normalizeText(body.usage_type) || "perfil_principal",
    recovery_email: normalizeText(body.recovery_email),
    recovery_phone: normalizeText(body.recovery_phone),
    notes: normalizeText(body.notes),
    site_id: siteId || null,
    status: normalizeText(body.status) || "ativo",
    updated_at: new Date().toISOString()
  };

  if (!row.label) throw new Error("Informe um nome para a credencial.");
  if (!row.platform) throw new Error("Informe a plataforma da credencial.");
  if (!row.login) throw new Error("Informe o login/e-mail da credencial.");
  if (!id && !secret) throw new Error("Informe a senha ou segredo para salvar.");

  // Numa edicao sem senha nova, o segredo atual e preservado.
  if (secret) {
    row.secret = await encryptVaultSecret(secret, {
      site_id: row.site_id || "none",
      source: row.platform
    });
  }

  const rows = id
    ? await supabaseRest(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row)
    })
    : await supabaseRest(TABLE, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row)
    });
  const [saved] = rows || [];
  if (!saved) throw new Error("Nao foi possivel salvar a credencial.");

  await auditVault({
    vaultId: saved.id,
    action: id ? "update" : "create",
    actor,
    actorType,
    detail: `${row.label} (${row.platform} - ${row.login})`
  });

  return sanitizeVaultItem(saved);
}

async function revealVaultItem(body, auth) {
  const { actor, actorType } = actorFromAuth(auth);
  const id = normalizeText(body.id);
  if (!id) throw new Error("Informe a credencial.");
  const item = await fetchVaultItem(id);
  const secret = await decryptVaultSecret(item.secret);
  await auditVault({
    vaultId: id,
    action: "reveal",
    actor,
    actorType,
    detail: `${item.label || "credencial"} (${item.platform || "plataforma"} - ${item.login || "login"})`
  });
  return { item: sanitizeVaultItem(item), secret };
}

async function deleteVaultItem(body, auth) {
  const { actor, actorType } = actorFromAuth(auth);
  const id = normalizeText(body.id);
  if (!id) throw new Error("Informe a credencial.");
  const item = await fetchVaultItem(id);
  await supabaseRest(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
  await auditVault({
    vaultId: id,
    action: "delete",
    actor,
    actorType,
    detail: `${item.label || "credencial"} (${item.platform || "plataforma"} - ${item.login || "login"})`
  });
  return { id };
}

export async function handleVault(event) {
  const auth = await requireOperatorAuth(event);
  requireVaultConfig();

  const method = requestMethod(event);

  if (method === "GET") {
    const items = await listVaultItems();
    return json(200, { ok: true, items });
  }

  if (method !== "POST") {
    throw new HttpError(405, "Metodo nao permitido.");
  }

  const body = readJsonBody(event);
  const action = normalizeText(body.action || "save");

  if (action === "save") {
    const item = await saveVaultItem(body, auth);
    return json(200, { ok: true, item });
  }

  if (action === "reveal") {
    const payload = await revealVaultItem(body, auth);
    return json(200, { ok: true, ...payload });
  }

  if (action === "delete") {
    const payload = await deleteVaultItem(body, auth);
    return json(200, { ok: true, ...payload });
  }

  return json(400, { ok: false, error: "Acao do Cofre invalida." });
}
