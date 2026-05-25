import { uploadPublicImage } from "./storage-upload.mjs";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TEXT_MODEL = "gpt-5.2";
const DEFAULT_IMAGE_MODEL = "gpt-image-1.5";

const SOCIAL_POST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "body",
    "image_prompt",
    "improvement_prompt",
    "revision_notes",
    "next_action",
    "risk"
  ],
  properties: {
    title: { type: "string" },
    body: { type: "string" },
    image_prompt: { type: "string" },
    improvement_prompt: { type: "string" },
    revision_notes: { type: "string" },
    next_action: { type: "string" },
    risk: { type: "string", enum: ["baixo", "medio", "alto"] }
  }
};

function openAiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY nao configurada no backend.");
  return key;
}

async function openAiRequest(path, body) {
  const response = await fetch(`${OPENAI_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.error?.message || payload.message || `OpenAI ${response.status}`;
    throw new Error(detail);
  }
  return payload;
}

function responseText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;

  const chunks = [];
  for (const output of payload.output || []) {
    for (const item of output.content || []) {
      if (typeof item.text === "string") chunks.push(item.text);
      if (typeof item.output_text === "string") chunks.push(item.output_text);
    }
  }
  return chunks.join("\n").trim();
}

function parseJsonText(text) {
  const clean = String(text || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
    throw new Error("A OpenAI nao retornou JSON valido.");
  }
}

function compact(value, fallback = "") {
  return String(value || fallback).trim();
}

function siteSummary(input) {
  return [
    `Site: ${compact(input.siteName, "Pesquisa Premios")}`,
    `URL: ${compact(input.siteUrl, "sem URL")}`,
    `Objetivo: ${compact(input.objective, "aumentar cadastros e uso dos Koins")}`,
    `Rede: ${compact(input.channel, "Threads")}`,
    `Publico: brasileiros que respondem pesquisas e buscam premios simples`,
    `Pedido do operador: ${compact(input.prompt, "criar um post claro, confiavel e direto")}`,
    `Ajustes anteriores: ${compact(input.improvementPrompt, "nenhum")}`
  ].join("\n");
}

export async function generateSocialPost(input) {
  const prompt = [
    "Voce e um estrategista senior de social media para um site de pesquisas com Koins.",
    "Crie um post em portugues do Brasil que gere confianca, seja facil de revisar e nao prometa dinheiro garantido.",
    "Evite exagero, fake urgency, claims absolutos, promessas de premio certo e termos que parecam golpe.",
    "A legenda deve caber em rede social, com CTA leve para responder pesquisas e acumular Koins.",
    "O prompt de imagem deve ser fotorrealista, vertical 9:16, sem marcas registradas e sem texto pequeno ilegivel.",
    "Responda apenas JSON valido no schema pedido.",
    "",
    siteSummary(input)
  ].join("\n");

  const payload = await openAiRequest("/responses", {
    model: process.env.OPENAI_TEXT_MODEL || DEFAULT_TEXT_MODEL,
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "koinops_social_post",
        strict: true,
        schema: SOCIAL_POST_SCHEMA
      }
    },
    max_output_tokens: 1200
  });

  return {
    ...parseJsonText(responseText(payload)),
    model: payload.model || process.env.OPENAI_TEXT_MODEL || DEFAULT_TEXT_MODEL
  };
}

export function buildImagePrompt(input) {
  const style = compact(input.style, "photorealistic premium social media product scene");
  const basePrompt = compact(input.prompt || input.image_prompt || input.body);
  return [
    style,
    "Vertical 9:16 image for a social post about a Brazilian survey rewards website.",
    "Show a realistic smartphone, digital coins, reward cards, and a clean trustworthy interface feeling.",
    "Use natural light, premium composition, sharp details, realistic materials, and no uncanny people.",
    "Do not include real brand logos, copyrighted characters, or tiny unreadable interface text.",
    `Creative direction: ${basePrompt}`
  ].join("\n");
}

export async function generateImageAsset(input) {
  const prompt = buildImagePrompt(input);
  const payload = await openAiRequest("/images/generations", {
    model: process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    prompt,
    size: compact(input.size, "1024x1536"),
    quality: compact(input.quality, "medium"),
    output_format: "png",
    moderation: "auto",
    n: 1
  });

  const image = payload.data?.[0];
  if (!image?.b64_json && !image?.url) {
    throw new Error("A OpenAI nao retornou imagem.");
  }

  let buffer;
  if (image.b64_json) {
    buffer = Buffer.from(image.b64_json, "base64");
  } else {
    const response = await fetch(image.url);
    if (!response.ok) throw new Error(`Download da imagem OpenAI falhou (${response.status}).`);
    buffer = Buffer.from(await response.arrayBuffer());
  }

  const uploaded = await uploadPublicImage({
    filename: compact(input.filename, "openai-koins"),
    contentType: "image/png",
    buffer
  });

  return {
    ...uploaded,
    prompt,
    revisedPrompt: image.revised_prompt || "",
    model: process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL
  };
}
