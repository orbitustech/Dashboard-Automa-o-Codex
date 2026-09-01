import { supabaseRest } from "../lib/supabase-rest.mjs";
import {
  decryptVaultSecret,
  encryptVaultSecret,
  kmsCredentialsConfigured,
  kmsVaultConfigured,
  vaultPayloadState
} from "../lib/aws-kms-vault.mjs";
import { HttpError, json, readJsonBody, requestMethod, requireOperatorAuth } from "./lambda-http.mjs";

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

function sanitizeVaultItem(item = {}) {
  return {
    id: item.id,
    site_id: item.site_id || "",
    source: item.source || "",
    author: item.author || "",
    message: "",
    secret_state: vaultPayloadState(item.message),
    category: item.category || "senha",
    risk: item.risk || "perfil_principal",
    status: item.status || "ativo",
    suggested_reply: item.suggested_reply || "",
    final_reply: item.final_reply || "",
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
  const rows = await supabaseRest([
    "support_messages",
    "?select=id,site_id,source,author,message,category,risk,status,suggested_reply,final_reply,created_at,updated_at",
    "&order=created_at.desc"
  ].join(""));
  return rows.map(sanitizeVaultItem);
}

async function fetchVaultItem(id) {
  const rows = await supabaseRest(`support_messages?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  const [item] = rows || [];
  if (!item) throw new Error("Credencial nao encontrada.");
  return item;
}

async function saveVaultItem(body, auth) {
  const { actor, actorType } = actorFromAuth(auth);
  const id = normalizeText(body.id);
  const secret = normalizeText(body.secret || body.message);
  const row = {
    site_id: normalizeText(body.site_id),
    source: normalizeText(body.source),
    author: normalizeText(body.author),
    category: normalizeText(body.category) || "senha",
    risk: normalizeText(body.risk) || "perfil_principal",
    status: normalizeText(body.status) || "ativo",
    suggested_reply: normalizeText(body.suggested_reply),
    final_reply: normalizeText(body.final_reply)
  };

  if (!row.site_id) throw new Error("Escolha o site da credencial.");
  if (!row.source) throw new Error("Informe a plataforma da credencial.");
  if (!row.author) throw new Error("Informe o login/e-mail da credencial.");
  if (!id && !secret) throw new Error("Informe a senha ou segredo para salvar.");

  if (secret) {
    row.message = await encryptVaultSecret(secret, row);
  }

  const rows = id
    ? await supabaseRest(`support_messages?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row)
    })
    : await supabaseRest("support_messages", {
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
    detail: `${row.source} - ${row.author}`
  });

  return sanitizeVaultItem(saved);
}

async function revealVaultItem(body, auth) {
  const { actor, actorType } = actorFromAuth(auth);
  const id = normalizeText(body.id);
  if (!id) throw new Error("Informe a credencial.");
  const item = await fetchVaultItem(id);
  const secret = await decryptVaultSecret(item.message);
  await auditVault({
    vaultId: id,
    action: "reveal",
    actor,
    actorType,
    detail: `${item.source || "plataforma"} - ${item.author || "login"}`
  });
  return { item: sanitizeVaultItem(item), secret };
}

async function deleteVaultItem(body, auth) {
  const { actor, actorType } = actorFromAuth(auth);
  const id = normalizeText(body.id);
  if (!id) throw new Error("Informe a credencial.");
  const item = await fetchVaultItem(id);
  await supabaseRest(`support_messages?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
  await auditVault({
    vaultId: id,
    action: "delete",
    actor,
    actorType,
    detail: `${item.source || "plataforma"} - ${item.author || "login"}`
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
