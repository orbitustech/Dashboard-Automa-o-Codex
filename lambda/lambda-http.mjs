import { isCognitoAuthConfigured, verifyCognitoToken } from "../lib/cognito-auth.mjs";

export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.KOINOPS_ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Content-Type": "application/json; charset=utf-8"
  };
}

export function json(statusCode, payload) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(payload)
  };
}

export function empty(statusCode = 204) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: ""
  };
}

export function requestMethod(event) {
  return event?.requestContext?.http?.method || "GET";
}

export function requestPath(event) {
  return event?.rawPath || "/";
}

export function requestHeader(event, name) {
  const wanted = String(name).toLowerCase();
  const headers = event?.headers || {};
  const key = Object.keys(headers).find((item) => item.toLowerCase() === wanted);
  return key ? headers[key] : "";
}

export function readJsonBody(event) {
  if (!event?.body) return {};
  const text = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : String(event.body);
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

export async function requireOperatorAuth(event) {
  const expected = process.env.KOINOPS_ADMIN_TOKEN;
  const header = requestHeader(event, "authorization") || "";
  const received = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (expected && received === expected) {
    return { type: "admin" };
  }

  if (isCognitoAuthConfigured() && received) {
    try {
      return {
        type: "aws-cognito",
        claims: await verifyCognitoToken(received)
      };
    } catch (error) {
      throw new HttpError(401, error.message);
    }
  }

  if (!expected && !isCognitoAuthConfigured()) {
    throw new HttpError(500, "Configure KOINOPS_ADMIN_TOKEN ou AWS Cognito no backend.");
  }

  throw new HttpError(401, "Entre com AWS ou configure a chave do painel.");
}
