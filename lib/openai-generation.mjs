import { uploadPublicImage } from "./storage-upload.mjs";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TEXT_MODEL = "gpt-5.2";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_IMAGE_STYLE = "premium clean 3D editorial illustration with one Brazilian adult, named gift cards, rewards dashboard, and large headline text, no money imagery, no official logos";
const PESQUISA_PREMIOS_PALETTE = "brand palette: dark navy #0f172a and #111827 backgrounds, golden yellow #ffcc00 highlights, green #22c55e / teal #14b8a6 CTA accents, blue #60a5fa secondary accents, white text";

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

function imageHeadline(input) {
  const requested = compact(input.imageText || input.image_text || input.headline);
  if (requested) return requested.slice(0, 36);
  return "Troque Koins por gift cards";
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
    "Crie uma legenda em portugues do Brasil com copy social, curiosa, dinamica e facil de entender.",
    "Evite exagero, fake urgency, claims absolutos, promessas de premio certo e termos que parecam golpe.",
    "A legenda deve ser curta, instigante e natural para Instagram, Threads, TikTok ou Facebook.",
    "Estrutura obrigatoria da legenda: 1) gancho em pergunta ou afirmacao curta; 2) explicacao rasa e simples do fluxo responder pesquisas -> acumular Koins -> resgatar gift cards/premios disponiveis; 3) CTA para clicar/acessar o link da bio.",
    "Sempre inclua a ideia de link na bio, variando a frase entre opcoes como: Acesse pelo link na bio, Comece pelo link da bio, Clica no link da bio, Veja no link da bio.",
    "Nao coloque URL direta na legenda, a menos que o operador peca explicitamente.",
    "Varie o conteudo e nao repita sempre a mesma abertura. Exemplos de ganchos bons: Ja pensou em resgatar gift cards respondendo pesquisas?; Seus minutos livres podem virar Koins.; Responder pesquisas pode render pontos para premios.",
    "Use frases curtas, quebras de linha e tom simples. Evite texto institucional ou explicacao longa.",
    "Explique Koins como pontos internos usados para resgatar gift cards, recargas, cupons e outros premios disponiveis, nunca como dinheiro.",
    "Quando fizer sentido, cite exemplos concretos de catalogo como Uber, iFood, Netflix, Spotify e outros gift cards, sempre com ressalva de disponibilidade conforme estoque/campanha/regras.",
    "O prompt de imagem deve ser, por padrao, uma ilustracao 3D premium vertical 9:16 com uma pessoa brasileira adulta, smartphone, tela de pontos/resgate, gift cards nomeados e uma frase curta grande e legivel.",
    `A imagem deve seguir a paleta visual do Pesquisa Premios: ${PESQUISA_PREMIOS_PALETTE}.`,
    "Nao use moedas, dinheiro, notas, cifroes, carteira, barras de ouro ou qualquer visual que pareca ganho financeiro.",
    "So remova pessoas se o operador pedir explicitamente sem pessoas. So use foto/fotorrealismo se o operador pedir explicitamente.",
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
  const style = compact(input.style, DEFAULT_IMAGE_STYLE);
  const basePrompt = compact(input.prompt || input.image_prompt || input.body);
  const sourceText = `${style} ${basePrompt}`.toLowerCase();
  const headline = imageHeadline(input);
  const asksForPhoto = /(foto|fotorreal|photoreal|realista|realistic|photographic)/i.test(sourceText);
  const forbidsPeople = /(sem pessoa|sem pessoas|no people|no person|sem rosto|no face|sem humanos|no humans)/i.test(sourceText);
  const mode = forbidsPeople
    ? "premium clean 3D editorial illustration, not photorealistic, no people"
    : asksForPhoto
      ? "controlled photorealistic lifestyle scene with one natural Brazilian adult, no close-up hands, no distorted face"
      : "premium clean 3D editorial illustration with one friendly Brazilian adult, polished but not photorealistic";
  return [
    `Art direction preset: ${mode}.`,
    `Operator style: ${style}.`,
    `Use the Pesquisa Premios ${PESQUISA_PREMIOS_PALETTE}.`,
    "Vertical 9:16 image for a social post about a Brazilian survey rewards website.",
    "Primary composition: one adult person in a calm trustworthy pose using or holding a smartphone, with a simple rewards dashboard, gift card cards labeled as plain text examples, recharge/coupon cards, progress/checklist elements, clean premium layout, and clear social-media ad structure.",
    "Gift card label examples: Uber R$50, iFood R$50, Netflix R$35, Spotify R$35, Outros premios. Use plain text labels only, never official logos or brand artwork.",
    "Person quality rules: show at most one person, natural expression, simple pose, no close-up hands, hands partially out of frame or relaxed, no extra fingers, no distorted face, no random background people.",
    "Text overlay requirement: include exactly one large short headline in Portuguese, with clean typography, no extra tiny text.",
    `Required headline text: "${headline}".`,
    "Visual quality rules: balanced spacing, clear focal point, consistent lighting, dark navy hero-style background, yellow emphasis text/cards, green-teal CTA accents, blue small secondary accents, no clutter, no awkward cropping, no messy UI.",
    "Koins visual rule: show Koins as internal points/saldo/progress, not as physical coins or cash.",
    "Hard avoid list: physical coins, money, banknotes, dollar signs, currency symbols, wallets, gold bars, real brand logos, copyrighted characters, tiny unreadable interface text, fake app names, distorted hands, uncanny faces, extra fingers, cheap stock-photo look, low quality artifacts.",
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
