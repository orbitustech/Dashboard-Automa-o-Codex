import { sendJson, setCors } from "../lib/http.mjs";
import { mediaStorageEnabled } from "../lib/storage-upload.mjs";

export default function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const socialPlatforms = {
    instagram: Boolean(process.env.INSTAGRAM_ACCESS_TOKEN),
    threads: Boolean(process.env.THREADS_ACCESS_TOKEN),
    facebook: Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN),
    tiktok: Boolean(process.env.TIKTOK_ACCESS_TOKEN),
    linkedin: Boolean(process.env.LINKEDIN_ACCESS_TOKEN),
    x: Boolean(process.env.X_ACCESS_TOKEN)
  };

  sendJson(res, 200, {
    ok: true,
    service: "koinops-backend",
    checkedAt: new Date().toISOString(),
    configured: {
      supabase: Boolean(process.env.SUPABASE_URL),
      socialPlatforms,
      socialPlatformsReady: Object.values(socialPlatforms).some(Boolean),
      openai: Boolean(process.env.OPENAI_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
      upload: mediaStorageEnabled() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      mediaStorage: mediaStorageEnabled() ? "supabase" : "disabled",
      adminToken: Boolean(process.env.KOINOPS_ADMIN_TOKEN),
      awsLogin: Boolean(process.env.AWS_COGNITO_ISSUER && process.env.AWS_COGNITO_CLIENT_ID),
      bucket: process.env.SUPABASE_STORAGE_BUCKET || "content-assets"
    }
  });
}
