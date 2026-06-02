import { uploadPublicImage } from "./storage-upload.mjs";
import {
  PESQUISA_PREMIOS_BRAND,
  pesquisaPremiosContextText,
  pesquisaPremiosRewardText,
  pesquisaPremiosRulesText
} from "./pesquisa-premios-brand.mjs";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TEXT_MODEL = "gpt-5.2";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_IMAGE_STYLE = PESQUISA_PREMIOS_BRAND.imageStyle;
const PESQUISA_PREMIOS_PALETTE = PESQUISA_PREMIOS_BRAND.palette;
const COPY_ANGLES = [
  "curiosidade: abrir com uma pergunta curta sobre transformar tempo livre em pontos",
  "rotina real: mostrar um momento comum do dia em que a pessoa responde uma pesquisa rapida",
  "catalogo: destacar que Koins podem ser usados para resgatar gift cards permitidos no catalogo",
  "clareza: explicar em linguagem simples que Koins sao pontos internos, nao dinheiro",
  "primeiro passo: convite leve para testar sem cartao e entender pelo link da bio",
  "comparacao: contrastar minutos ociosos com uma acao simples dentro do Pesquisa Premios",
  "confianca: reforcar transparencia, disponibilidade de pesquisas e regras sem prometer resultado certo",
  "beneficio pratico: focar em premios do dia a dia, sem listar sempre as mesmas marcas"
];
const IMAGE_SCENES = [
  "lifestyle at home: person relaxed on sofa or desk, phone showing Koins progress and one reward card",
  "clean product UI: large smartphone mockup, dashboard progress, gift card cards floating around, no person close-up",
  "creator-style portrait: one person holding phone at chest level, big headline above, simple reward cards beside them",
  "step-by-step visual: three compact panels showing responder pesquisa, acumular Koins, resgatar premio",
  "reward catalog wall: polished vertical catalog of available prize categories with phone in foreground",
  "notification moment: phone screen with points added and a discreet reward option appearing",
  "split composition: left side person using phone, right side clean app UI with Koins balance and reward cards",
  "minimal premium ad: dark navy background, big yellow headline, phone UI and small check/progress elements"
];
const IMAGE_HEADLINES = [
  "Koins viram premios",
  "Responda e acumule Koins",
  "Comece pelo link na bio",
  "Pesquisas que valem pontos",
  "Seu tempo pode virar Koins",
  "Resgate gift cards",
  "Pontos para premios",
  "Teste em poucos minutos"
];

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

function hashText(value) {
  return [...String(value || "")].reduce((total, char) => ((total << 5) - total + char.charCodeAt(0)) >>> 0, 0);
}

function pickFrom(list, seed) {
  const index = hashText(`${seed || ""}-${Date.now()}-${Math.random()}`) % list.length;
  return list[index];
}

function recentContentText(input) {
  if (Array.isArray(input.recentContent)) {
    return input.recentContent
      .map((item, index) => `${index + 1}. ${compact(item.title, "sem titulo")} - ${compact(item.body || item.caption || item.text || item.image_prompt, "").slice(0, 220)}`)
      .join("\n");
  }
  return compact(input.recentContent || input.recent || input.recentPosts);
}

function imageHeadline(input) {
  const requested = compact(input.imageText || input.image_text || input.headline);
  if (requested) return requested.slice(0, 36);
  return pickFrom(IMAGE_HEADLINES, compact(input.variationSeed || input.prompt || input.body || input.siteName));
}

function siteSummary(input, variation) {
  return [
    pesquisaPremiosContextText(),
    `Site selecionado no dashboard: ${compact(input.siteName, PESQUISA_PREMIOS_BRAND.name)}`,
    `URL selecionada no dashboard: ${compact(input.siteUrl, PESQUISA_PREMIOS_BRAND.url)}`,
    `Objetivo operacional desta geracao: ${compact(input.objective, PESQUISA_PREMIOS_BRAND.objective)}`,
    `Rede: ${compact(input.channel, "Threads")}`,
    `Pedido do operador: ${compact(input.prompt, "criar um post claro, confiavel e direto")}`,
    `Ajustes anteriores: ${compact(input.improvementPrompt, "nenhum")}`,
    `Angulo obrigatorio desta versao: ${variation.copyAngle}`,
    `Cena visual obrigatoria desta versao: ${variation.imageScene}`,
    `Posts recentes para nao repetir:\n${recentContentText(input) || "sem historico recente"}`
  ].join("\n");
}

export async function generateSocialPost(input) {
  const variation = {
    copyAngle: pickFrom(COPY_ANGLES, compact(input.variationSeed || input.title || input.prompt || input.siteName)),
    imageScene: pickFrom(IMAGE_SCENES, compact(input.variationSeed || input.title || input.prompt || input.siteName))
  };
  const prompt = [
    "Voce e um estrategista senior de social media para um site de pesquisas com Koins.",
    "Crie uma legenda em portugues do Brasil com copy social, curiosa, dinamica e facil de entender. O texto precisa soar organico, nao como explicacao tecnica.",
    "Evite exagero, fake urgency, claims absolutos, promessas de premio certo e termos que parecam golpe.",
    "A legenda deve ser curta, instigante e natural para Instagram, Threads, TikTok ou Facebook, com 3 a 6 linhas curtas.",
    "Estrutura obrigatoria da legenda: 1) gancho diferente dos posts recentes; 2) explicacao rasa e simples do fluxo responder pesquisas -> acumular Koins -> resgatar gift cards do catalogo permitido; 3) CTA para clicar/acessar o link da bio.",
    "Sempre inclua a ideia de link na bio, variando a frase entre opcoes como: Acesse pelo link na bio, Comece pelo link da bio, Clica no link da bio, Veja no link da bio, o caminho esta no link da bio.",
    "Nao coloque URL direta na legenda, a menos que o operador peca explicitamente.",
    "Varie de verdade: nao comece com 'Voce responde pesquisas', 'Ja pensou', 'Seus minutos livres' ou qualquer abertura igual aos posts recentes se elas ja aparecerem no historico.",
    "Use frases curtas, quebras de linha e tom simples. Evite texto institucional, explicacao longa, linguagem robotica e listas repetitivas de marcas.",
    "A descricao deve melhorar a vontade de testar: mostre um microbeneficio concreto, uma situacao cotidiana ou uma curiosidade, em vez de apenas explicar o produto.",
    "Explique Koins como pontos internos usados para resgatar gift cards do catalogo permitido, nunca como dinheiro.",
    `Use apenas estes exemplos concretos de recompensa quando citar marcas: ${pesquisaPremiosRewardText()}. Cite no maximo 1 ou 2 por post.`,
    `Regras proibidas obrigatorias: ${pesquisaPremiosRulesText()}`,
    "O prompt de imagem deve variar a cena, composicao, enquadramento e headline. Nao use sempre pessoa segurando celular do mesmo jeito.",
    "O prompt de imagem deve ser, por padrao, uma ilustracao 3D premium vertical 9:16 com elementos do Pesquisa Premios, Koins como pontos internos, gift cards/categorias e uma frase curta grande e legivel.",
    `A imagem deve seguir a paleta visual do Pesquisa Premios: ${PESQUISA_PREMIOS_PALETTE}.`,
    "Nao use moedas, dinheiro, notas, cifroes, carteira, barras de ouro, Pix, recarga, aposta ou qualquer visual que pareca ganho financeiro.",
    "So remova pessoas se o operador pedir explicitamente sem pessoas. So use foto/fotorrealismo se o operador pedir explicitamente.",
    "No campo revision_notes, explique em uma frase qual angulo criativo foi usado e como ele evita repetir os posts recentes.",
    "Responda apenas JSON valido no schema pedido.",
    "",
    siteSummary(input, variation)
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
  const scene = compact(input.imageScene || input.image_scene, pickFrom(IMAGE_SCENES, `${headline}-${basePrompt}`));
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
    `Composition variation for this asset: ${scene}.`,
    `Use the Pesquisa Premios ${PESQUISA_PREMIOS_PALETTE}.`,
    "Vertical 9:16 image for a social post about a Brazilian survey rewards website.",
    "Primary composition: follow the requested composition variation, using a simple survey/rewards dashboard, gift card cards labeled as plain text examples, progress/checklist elements, clean premium layout, and clear social-media ad structure.",
    `Gift card label examples allowed: ${pesquisaPremiosRewardText()}. Use plain text labels only, never official logos or brand artwork.`,
    "Person quality rules: show at most one person, natural expression, simple pose, no close-up hands, hands partially out of frame or relaxed, no extra fingers, no distorted face, no random background people.",
    "Text overlay requirement: include exactly one large short headline in Portuguese, with clean typography, no extra tiny text.",
    `Required headline text: "${headline}".`,
    "Visual quality rules: balanced spacing, clear focal point, consistent lighting, dark navy hero-style background, yellow emphasis text/cards, green-teal CTA accents, blue small secondary accents, no clutter, no awkward cropping, no messy UI.",
    "Koins visual rule: show Koins as internal points/saldo/progress, not as physical coins or cash.",
    "Hard avoid list: physical coins, money, banknotes, dollar signs, currency symbols, wallets, gold bars, Pix, recarga phone cards, betting elements, real brand logos, copyrighted characters, tiny unreadable interface text, fake app names, distorted hands, uncanny faces, extra fingers, cheap stock-photo look, low quality artifacts.",
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
