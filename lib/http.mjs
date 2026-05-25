import { isCognitoAuthConfigured, verifyCognitoToken } from "./cognito-auth.mjs";

export function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.KOINOPS_ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export function requireAdminToken(req, res) {
  const expected = process.env.KOINOPS_ADMIN_TOKEN;
  if (!expected) {
    sendJson(res, 500, {
      ok: false,
      error: "KOINOPS_ADMIN_TOKEN nao configurado no backend."
    });
    return false;
  }

  const header = req.headers.authorization || "";
  const received = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (received !== expected) {
    sendJson(res, 401, {
      ok: false,
      error: "Chave do backend invalida."
    });
    return false;
  }

  return true;
}

export async function requireOperatorAuth(req, res) {
  const expected = process.env.KOINOPS_ADMIN_TOKEN;
  const header = req.headers.authorization || "";
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
      sendJson(res, 401, {
        ok: false,
        error: error.message
      });
      return false;
    }
  }

  if (!expected && !isCognitoAuthConfigured()) {
    sendJson(res, 500, {
      ok: false,
      error: "Configure KOINOPS_ADMIN_TOKEN ou AWS Cognito no backend."
    });
    return false;
  }

  sendJson(res, 401, {
    ok: false,
    error: "Entre com AWS ou configure a chave do painel."
  });
  return false;
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}
