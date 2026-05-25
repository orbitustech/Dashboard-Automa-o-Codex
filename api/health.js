import { sendJson, setCors } from "../lib/http.mjs";

export default function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  sendJson(res, 200, {
    ok: true,
    service: "koinops-backend",
    checkedAt: new Date().toISOString(),
    configured: {
      supabase: Boolean(process.env.SUPABASE_URL),
      buffer: Boolean(process.env.BUFFER_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      upload: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      adminToken: Boolean(process.env.KOINOPS_ADMIN_TOKEN),
      awsLogin: Boolean(process.env.AWS_COGNITO_ISSUER && process.env.AWS_COGNITO_CLIENT_ID),
      bucket: process.env.SUPABASE_STORAGE_BUCKET || "content-assets"
    }
  });
}
