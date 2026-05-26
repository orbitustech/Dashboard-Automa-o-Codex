import { randomUUID } from "node:crypto";

const DEFAULT_SUPABASE_URL = "https://nbbprjduqtndkwbknyud.supabase.co";
const MAX_BYTES = Number(process.env.KOINOPS_UPLOAD_MAX_BYTES || 80 * 1024 * 1024);
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "video/mp4"]);

function storageHeaders(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra
  };
}

function supabaseUrl() {
  return process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
}

function bucketName() {
  return process.env.SUPABASE_STORAGE_BUCKET || "content-assets";
}

function encodePath(path) {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function slugName(name) {
  return String(name || "imagem")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48) || "imagem";
}

async function ensureBucket(bucket) {
  const bucketConfig = {
    id: bucket,
    name: bucket,
    public: true,
    file_size_limit: MAX_BYTES,
    allowed_mime_types: [...ALLOWED_TYPES]
  };
  const getResponse = await fetch(`${supabaseUrl()}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
    headers: storageHeaders()
  });
  if (getResponse.ok) {
    await fetch(`${supabaseUrl()}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
      method: "PUT",
      headers: storageHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(bucketConfig)
    }).catch(() => null);
    return;
  }

  const createResponse = await fetch(`${supabaseUrl()}/storage/v1/bucket`, {
    method: "POST",
    headers: storageHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(bucketConfig)
  });

  if (!createResponse.ok && createResponse.status !== 409) {
    const detail = await createResponse.text();
    throw new Error(`Nao foi possivel criar bucket de midia: ${detail}`);
  }
}

export function validateUpload(file) {
  if (!file) throw new Error("Nenhum arquivo foi enviado.");
  if (!ALLOWED_TYPES.has(file.contentType)) throw new Error("Envie apenas JPG, PNG ou MP4.");
  if (file.buffer.length > MAX_BYTES) throw new Error("Midia grande demais. Use ate 80 MB.");
}

export async function uploadPublicMedia(file) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY nao configurado no backend.");
  }

  validateUpload(file);
  const bucket = bucketName();
  await ensureBucket(bucket);

  const now = new Date();
  const datePath = now.toISOString().slice(0, 10);
  const ext = file.contentType === "image/png" ? "png" : file.contentType === "video/mp4" ? "mp4" : "jpg";
  const objectPath = `content/${datePath}/${randomUUID()}-${slugName(file.filename)}.${ext}`;

  const uploadResponse = await fetch(`${supabaseUrl()}/storage/v1/object/${encodePath(`${bucket}/${objectPath}`)}`, {
    method: "PUT",
    headers: storageHeaders({
      "Content-Type": file.contentType,
      "x-upsert": "false",
      "Cache-Control": "31536000"
    }),
    body: file.buffer
  });

  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text();
    throw new Error(`Upload falhou: ${detail}`);
  }

  return {
    bucket,
    path: objectPath,
    url: `${supabaseUrl()}/storage/v1/object/public/${encodePath(`${bucket}/${objectPath}`)}`,
    contentType: file.contentType,
    size: file.buffer.length
  };
}

export async function uploadPublicImage(file) {
  return uploadPublicMedia(file);
}
