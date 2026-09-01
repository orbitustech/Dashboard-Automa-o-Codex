import { generateSocialPost, generateImageAsset } from "../lib/openai-generation.mjs";
import { startVideoGeneration, resolveVideoGeneration } from "../lib/gemini-video.mjs";
import { createCronContentDraft } from "../lib/cron-content-drafts.mjs";
import { createCronVideoDraft } from "../lib/cron-video-drafts.mjs";
import { publishPendingTasks } from "../lib/platform-publisher.mjs";
import { mediaStorageEnabled, createSignedUploadUrl } from "../lib/storage-upload.mjs";
import { kmsVaultConfigured, kmsCredentialsConfigured } from "../lib/aws-kms-vault.mjs";
import {
  HttpError,
  empty,
  json,
  readJsonBody,
  requestMethod,
  requestPath,
  requireOperatorAuth
} from "./lambda-http.mjs";
import { handleVault } from "./vault-route.mjs";

function requestedSlot(body = {}) {
  const raw = String(body.slot || body.time || body.target || "").toLowerCase();
  return raw.includes("18") ? "18h" : "14h";
}

function requestedOptions(body = {}) {
  return {
    siteId: body.site_id || body.siteId || "",
    automationId: body.automation_id || body.automationId || ""
  };
}

function publishArgsFrom(body = {}) {
  return {
    dryRun: body.dry_run === true || body.dry_run === "1",
    limit: Number(body.limit || process.env.PUBLISH_LIMIT || 10),
    publishMode: body.publish_mode === "now" || body.publishMode === "now" || body.share_now === true ? "now" : "queue",
    taskIds: Array.isArray(body.task_ids) ? body.task_ids : Array.isArray(body.taskIds) ? body.taskIds : [],
    contentId: body.content_id || body.contentId || ""
  };
}

function handleHealth() {
  const socialPlatforms = {
    instagram: Boolean(process.env.INSTAGRAM_ACCESS_TOKEN),
    threads: Boolean(process.env.THREADS_ACCESS_TOKEN),
    facebook: Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN),
    tiktok: Boolean(process.env.TIKTOK_ACCESS_TOKEN),
    linkedin: Boolean(process.env.LINKEDIN_ACCESS_TOKEN),
    x: Boolean(process.env.X_ACCESS_TOKEN)
  };

  return json(200, {
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
      vault: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) && kmsVaultConfigured() && kmsCredentialsConfigured(),
      bucket: process.env.SUPABASE_STORAGE_BUCKET || "content-assets"
    }
  });
}

export const handler = async (event) => {
  const method = requestMethod(event);
  const path = requestPath(event).replace(/\/+$/, "");

  if (method === "OPTIONS") return empty();

  try {
    if (path === "" || path === "/" || path.endsWith("/api/health")) return handleHealth();
    if (path.endsWith("/api/vault")) return await handleVault(event);

    if (method !== "POST") throw new HttpError(405, "Use POST.");
    await requireOperatorAuth(event);
    const body = readJsonBody(event);

    if (path.endsWith("/api/generate-post")) {
      return json(200, { ok: true, content: await generateSocialPost(body) });
    }

    if (path.endsWith("/api/generate-image")) {
      return json(200, { ok: true, media: await generateImageAsset(body) });
    }

    if (path.endsWith("/api/generate-video")) {
      return json(200, { ok: true, operation: await startVideoGeneration(body) });
    }

    if (path.endsWith("/api/video-status")) {
      return json(200, { ok: true, ...(await resolveVideoGeneration(body)) });
    }

    if (path.endsWith("/api/create-draft")) {
      return json(200, await createCronContentDraft(requestedSlot(body), requestedOptions(body)));
    }

    if (path.endsWith("/api/create-video-draft")) {
      return json(200, await createCronVideoDraft(requestedSlot(body), requestedOptions(body)));
    }

    if (path.endsWith("/api/publish")) {
      return json(200, await publishPendingTasks(publishArgsFrom(body)));
    }

    if (path.endsWith("/api/upload-media")) {
      return json(200, { ok: true, upload: await createSignedUploadUrl(body) });
    }

    return json(404, { ok: false, error: `Rota nao encontrada: ${path}` });
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    console.error("backend error", { path, method, statusCode, message: error.message });
    return json(statusCode, { ok: false, error: error.message });
  }
};
