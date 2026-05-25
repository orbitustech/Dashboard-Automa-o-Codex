import { createPublicKey, verify as verifySignature } from "node:crypto";

const jwksCache = new Map();

function base64UrlToBuffer(value) {
  return Buffer.from(String(value || ""), "base64url");
}

function decodeJson(value) {
  return JSON.parse(base64UrlToBuffer(value).toString("utf8"));
}

function configuredIssuer() {
  return String(process.env.AWS_COGNITO_ISSUER || "").replace(/\/+$/, "");
}

function configuredClientId() {
  return String(process.env.AWS_COGNITO_CLIENT_ID || "");
}

export function isCognitoAuthConfigured() {
  return Boolean(configuredIssuer() && configuredClientId());
}

async function loadJwks(issuer) {
  const cached = jwksCache.get(issuer);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;

  const response = await fetch(`${issuer}/.well-known/jwks.json`);
  if (!response.ok) {
    throw new Error(`JWKS Cognito indisponivel (${response.status}).`);
  }

  const payload = await response.json();
  const keys = Array.isArray(payload.keys) ? payload.keys : [];
  jwksCache.set(issuer, {
    keys,
    expiresAt: Date.now() + 60 * 60 * 1000
  });
  return keys;
}

function verifyJwtSignature(token, header, key) {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  const publicKey = createPublicKey({ key, format: "jwk" });
  return verifySignature(
    "RSA-SHA256",
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    publicKey,
    base64UrlToBuffer(encodedSignature)
  );
}

export async function verifyCognitoToken(token) {
  if (!isCognitoAuthConfigured()) {
    throw new Error("Login AWS ainda nao configurado no backend.");
  }

  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Token AWS invalido.");

  const header = decodeJson(parts[0]);
  const payload = decodeJson(parts[1]);
  if (header.alg !== "RS256") throw new Error("Algoritmo JWT nao aceito.");

  const issuer = configuredIssuer();
  const clientId = configuredClientId();
  const audience = payload.aud || payload.client_id;
  const expiresAt = Number(payload.exp || 0) * 1000;

  if (payload.iss !== issuer) throw new Error("Emissor AWS invalido.");
  if (audience !== clientId) throw new Error("Cliente AWS invalido.");
  if (!expiresAt || expiresAt <= Date.now()) throw new Error("Sessao AWS expirada.");

  const keys = await loadJwks(issuer);
  const key = keys.find((item) => item.kid === header.kid);
  if (!key) throw new Error("Chave publica AWS nao encontrada.");
  if (!verifyJwtSignature(token, header, key)) throw new Error("Assinatura AWS invalida.");

  return payload;
}
