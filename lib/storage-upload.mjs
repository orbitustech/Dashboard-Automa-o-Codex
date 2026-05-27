import { randomUUID } from "node:crypto";

const DEFAULT_SUPABASE_URL = "https://nbbprjduqtndkwbknyud.supabase.co";
const IMAGE_MAX_BYTES = Number(process.env.KOINOPS_IMAGE_UPLOAD_MAX_BYTES || 12 * 1024 * 1024);
const VIDEO_MAX_BYTES = Number(process.env.KOINOPS_VIDEO_UPLOAD_MAX_BYTES || process.env.KOINOPS_UPLOAD_MAX_BYTES || 50 * 1024 * 1024);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const VIDEO_TYPES = new Set(["video/mp4"]);
const ALL_TYPES = new Set([...IMAGE_TYPES, ...VIDEO_TYPES]);

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

function imageBucketName() {
  return process.env.SUPABASE_STORAGE_BUCKET || "content-assets";
}

function videoBucketName() {
  return process.env.SUPABASE_VIDEO_STORAGE_BUCKET || "content-videos";
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

async function ensureBucket(bucket, settings) {
  const bucketSettings = {
    public: true,
    file_size_limit: settings.maxBytes,
    allowed_mime_types: [...settings.allowedTypes]
  };
  const getResponse = await fetch(`${supabaseUrl()}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
    headers: storageHeaders()
  });
  if (getResponse.ok) {
    const updateResponse = await fetch(`${supabaseUrl()}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
      method: "PUT",
      headers: storageHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(bucketSettings)
    });
    if (!updateResponse.ok) {
      const detail = await updateResponse.text();
      throw new Error(`Nao foi possivel atualizar bucket de ${settings.label}: ${detail}`);
    }
    return;
  }

  const createResponse = await fetch(`${supabaseUrl()}/storage/v1/bucket`, {
    method: "POST",
    headers: storageHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      ...bucketSettings
    })
  });

  if (!createResponse.ok && createResponse.status !== 409) {
    const detail = await createResponse.text();
    throw new Error(`Nao foi possivel criar bucket de ${settings.label}: ${detail}`);
  }
}

function imageSettings() {
  return {
    label: "imagem",
    maxBytes: IMAGE_MAX_BYTES,
    allowedTypes: IMAGE_TYPES,
    bucket: imageBucketName()
  };
}

function videoSettings() {
  return {
    label: "video",
    maxBytes: VIDEO_MAX_BYTES,
    allowedTypes: VIDEO_TYPES,
    bucket: videoBucketName()
  };
}

function settingsForContentType(contentType) {
  if (IMAGE_TYPES.has(contentType)) return imageSettings();
  if (VIDEO_TYPES.has(contentType)) return videoSettings();
  return null;
}

async function ensurePublicBucket(settings) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY nao configurado no backend.");
  }
  await ensureBucket(settings.bucket, settings);
  return {
    bucket: settings.bucket,
    maxBytes: settings.maxBytes,
    allowedTypes: [...settings.allowedTypes]
  };
}

export async function ensurePublicImageBucket() {
  return ensurePublicBucket(imageSettings());
}

export async function ensurePublicVideoBucket() {
  return ensurePublicBucket(videoSettings());
}

export async function ensurePublicMediaBucket() {
  const image = await ensurePublicImageBucket();
  const video = await ensurePublicVideoBucket();
  return { image, video };
}

export function validateUpload(file, settings = null) {
  if (!file) throw new Error("Nenhum arquivo foi enviado.");
  const resolved = settings || settingsForContentType(file.contentType);
  if (!resolved || !ALL_TYPES.has(file.contentType)) throw new Error("Envie apenas JPG, PNG ou MP4.");
  if (!resolved.allowedTypes.has(file.contentType)) {
    throw new Error(`Este envio aceita apenas ${resolved.label}.`);
  }
  if (file.buffer.length > resolved.maxBytes) {
    const limitMb = Math.floor(resolved.maxBytes / 1024 / 1024);
    throw new Error(`${resolved.label === "video" ? "Video" : "Imagem"} grande demais. Use ate ${limitMb} MB.`);
  }
}

export async function uploadPublicMedia(file) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY nao configurado no backend.");
  }

  const settings = settingsForContentType(file.contentType);
  validateUpload(file, settings);
  const { bucket } = await ensurePublicBucket(settings);

  const now = new Date();
  const datePath = now.toISOString().slice(0, 10);
  const ext = file.contentType === "image/png" ? "png" : file.contentType === "video/mp4" ? "mp4" : "jpg";
  const folder = settings.label === "video" ? "videos" : "images";
  const objectPath = `${folder}/${datePath}/${randomUUID()}-${slugName(file.filename)}.${ext}`;

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
  const settings = imageSettings();
  validateUpload(file, settings);
  return uploadPublicMedia(file);
}

export async function uploadPublicVideo(file) {
  const settings = videoSettings();
  validateUpload(file, settings);
  return uploadPublicMedia(file);
}
