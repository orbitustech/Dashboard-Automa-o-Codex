import { createHash, createHmac } from "node:crypto";

const SERVICE = "kms";
const APP_CONTEXT = "dashboard-redes-automatico";

function kmsRegion() {
  return process.env.AWS_KMS_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-2";
}

function kmsKeyId() {
  return process.env.AWS_KMS_KEY_ID || "";
}

function hashHex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value, encoding) {
  return createHmac("sha256", key).update(value).digest(encoding);
}

function amzDates(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8)
  };
}

function signingKey(secretAccessKey, dateStamp, region) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

async function awsCredentials() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (accessKeyId && secretAccessKey) {
    return {
      accessKeyId,
      secretAccessKey,
      sessionToken: process.env.AWS_SESSION_TOKEN || ""
    };
  }

  throw new Error("Credenciais AWS nao configuradas para usar o KMS.");
}

function vaultContext(metadata = {}) {
  return {
    app: APP_CONTEXT,
    purpose: "vault",
    site_id: String(metadata.site_id || metadata.siteId || "none"),
    source: String(metadata.source || "unknown")
  };
}

async function kmsRequest(target, payload) {
  const region = kmsRegion();
  const host = `${SERVICE}.${region}.amazonaws.com`;
  const credentials = await awsCredentials();
  const body = JSON.stringify(payload);
  const { amzDate, dateStamp } = amzDates();
  const headers = {
    "content-type": "application/x-amz-json-1.1",
    host,
    "x-amz-date": amzDate,
    "x-amz-target": target
  };

  if (credentials.sessionToken) {
    headers["x-amz-security-token"] = credentials.sessionToken;
  }

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    hashHex(body)
  ].join("\n");

  const scope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    hashHex(canonicalRequest)
  ].join("\n");
  const signature = hmac(signingKey(credentials.secretAccessKey, dateStamp, region), stringToSign, "hex");

  const response = await fetch(`https://${host}/`, {
    method: "POST",
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
    },
    body
  });
  const text = await response.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { message: text };
  }

  if (!response.ok) {
    throw new Error(`AWS KMS ${response.status}: ${parsed.message || parsed.__type || text || "falha ao chamar KMS"}`);
  }

  return parsed;
}

export function kmsVaultConfigured() {
  return Boolean(kmsKeyId());
}

export function kmsCredentialsConfigured() {
  return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

export function parseVaultPayload(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return null;
  }
}

export function vaultPayloadState(value) {
  if (!value) return "empty";
  const parsed = parseVaultPayload(value);
  if (!parsed) return "legacy-plain";
  if (parsed.provider === "aws-kms") return "aws-kms";
  if (parsed.vault) return "legacy-encrypted";
  return "legacy-plain";
}

export async function encryptVaultSecret(secret, metadata = {}) {
  const keyId = kmsKeyId();
  if (!keyId) throw new Error("AWS_KMS_KEY_ID nao configurado no backend.");
  const encryptionContext = vaultContext(metadata);
  const plaintext = Buffer.from(JSON.stringify({
    secret: String(secret || ""),
    savedAt: new Date().toISOString()
  }), "utf8").toString("base64");

  const result = await kmsRequest("TrentService.Encrypt", {
    KeyId: keyId,
    Plaintext: plaintext,
    EncryptionContext: encryptionContext
  });

  return JSON.stringify({
    vault: true,
    provider: "aws-kms",
    version: 2,
    region: kmsRegion(),
    encryptionContext,
    ciphertext: result.CiphertextBlob,
    keyId: result.KeyId || ""
  });
}

export async function decryptVaultSecret(value) {
  const parsed = parseVaultPayload(value);
  if (!parsed) return value || "";
  if (parsed.provider !== "aws-kms") {
    throw new Error("Credencial antiga fora do padrao AWS KMS. Salve novamente no cofre atual.");
  }
  if (!parsed.ciphertext) throw new Error("Credencial sem ciphertext KMS.");

  const result = await kmsRequest("TrentService.Decrypt", {
    CiphertextBlob: parsed.ciphertext,
    EncryptionContext: parsed.encryptionContext || {}
  });
  const plaintext = Buffer.from(result.Plaintext || "", "base64").toString("utf8");
  const decoded = JSON.parse(plaintext);
  return decoded.secret || "";
}
