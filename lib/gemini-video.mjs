import { uploadPublicMedia } from "./storage-upload.mjs";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_VIDEO_MODEL = "veo-3.0-generate-preview";

function geminiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY nao configurada no backend.");
  return key;
}

function compact(value, fallback = "") {
  return String(value || fallback).trim();
}

function videoModel() {
  return process.env.GEMINI_VIDEO_MODEL || DEFAULT_VIDEO_MODEL;
}

function geminiHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "x-goog-api-key": geminiKey(),
    ...extra
  };
}

function videoPrompt(input = {}) {
  const headline = compact(input.imageText || input.image_text || input.headline, "Koins viram premios").slice(0, 44);
  const request = compact(input.prompt || input.image_prompt || input.improvementPrompt || input.body);
  return [
    "Vertical 9:16 short social media video for Pesquisa Premios, a Brazilian survey rewards website.",
    "Create a premium, trustworthy, organic ad-style clip with smooth motion, not a hard-sell commercial.",
    "Show one Brazilian adult using a smartphone, a clean rewards dashboard, progress/checklist UI, and plain text gift card cards such as Uber R$50, iFood R$50, Netflix R$35, Spotify R$35 and Outros premios.",
    "Use the Pesquisa Premios palette: dark navy background, golden yellow highlights, green/teal CTA accents, blue secondary accents, white text.",
    `Include one short large readable Portuguese text overlay: "${headline}".`,
    "Visual story: a person answers a quick survey on the phone, Koins appear as an internal points balance/progress bar, then available gift cards and prizes appear on screen.",
    "Avoid physical coins, cash, banknotes, dollar signs, wallets, gold bars, official brand logos, fake guaranteed rewards, distorted hands, extra fingers, awkward faces and clutter.",
    "Keep text minimal, legible and centered away from edges. Use calm camera movement and polished lighting.",
    request ? `Operator request: ${request}` : ""
  ].filter(Boolean).join(" ");
}

async function geminiRequest(path, options = {}) {
  const response = await fetch(`${GEMINI_BASE_URL}/${path}`, {
    ...options,
    headers: geminiHeaders(options.headers)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.error?.message || payload.message || `Gemini ${response.status}`;
    throw new Error(detail);
  }
  return payload;
}

export async function startVideoGeneration(input = {}) {
  const prompt = videoPrompt(input);
  const durationSeconds = Number(input.durationSeconds || input.duration_seconds || 8);
  const body = {
    instances: [{ prompt }],
    parameters: {
      aspectRatio: compact(input.aspectRatio || input.aspect_ratio, "9:16"),
      resolution: compact(input.resolution, "720p"),
      durationSeconds: [4, 6, 8].includes(durationSeconds) ? durationSeconds : 8,
      sampleCount: 1
    }
  };
  const operation = await geminiRequest(`models/${encodeURIComponent(videoModel())}:predictLongRunning`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  if (!operation.name) throw new Error("Gemini nao retornou o nome da operacao de video.");
  return {
    operationName: operation.name,
    model: videoModel(),
    prompt
  };
}

function operationPath(operationName) {
  const clean = compact(operationName);
  if (!clean) throw new Error("operationName ausente.");
  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    const url = new URL(clean);
    return url.pathname.replace(/^\/v1beta\//, "").replace(/^\/+/, "");
  }
  return clean.replace(/^\/+/, "");
}

export async function getVideoOperation(operationName) {
  return geminiRequest(operationPath(operationName), { method: "GET" });
}

function firstVideo(payload = {}) {
  const response = payload.response || payload;
  return response.generateVideoResponse?.generatedSamples?.[0]?.video ||
    response.generateVideoResponse?.generatedVideos?.[0]?.video ||
    response.generatedSamples?.[0]?.video ||
    response.generatedVideos?.[0]?.video ||
    response.videos?.[0]?.video ||
    response.videos?.[0] ||
    null;
}

async function downloadVideo(video) {
  if (!video) throw new Error("Gemini concluiu, mas nao retornou video.");
  if (video.bytesBase64Encoded || video.b64_json) {
    return Buffer.from(video.bytesBase64Encoded || video.b64_json, "base64");
  }
  const uri = video.uri || video.url;
  if (!uri) throw new Error("Gemini concluiu, mas nao retornou URI do video.");
  let response = await fetch(uri, {
    headers: { "x-goog-api-key": geminiKey() }
  });
  if (!response.ok && !new URL(uri).searchParams.has("key")) {
    const fallbackUrl = new URL(uri);
    fallbackUrl.searchParams.set("key", geminiKey());
    response = await fetch(fallbackUrl);
  }
  if (!response.ok) throw new Error(`Download do video Gemini falhou (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

export async function resolveVideoGeneration(input = {}) {
  const operation = await getVideoOperation(input.operationName || input.operation_name);
  if (!operation.done) {
    return {
      done: false,
      operationName: operation.name || input.operationName || input.operation_name
    };
  }
  if (operation.error) {
    throw new Error(operation.error.message || "Geracao de video falhou no Gemini.");
  }

  const video = firstVideo(operation);
  const buffer = await downloadVideo(video);
  const uploaded = await uploadPublicMedia({
    filename: compact(input.filename, "gemini-veo-video"),
    contentType: video?.mimeType || video?.mime_type || "video/mp4",
    buffer
  });

  return {
    done: true,
    operationName: operation.name || input.operationName || input.operation_name,
    media: uploaded,
    model: videoModel()
  };
}
