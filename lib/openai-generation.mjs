import { mediaStorageEnabled, uploadPublicImage } from "./storage-upload.mjs";
import { pesquisaPremiosRewardText } from "./pesquisa-premios-brand.mjs";
import { isLegacyPesquisaPremiosSite, siteContentContext, siteImageStyle } from "./site-brand.mjs";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TEXT_MODEL = "gpt-5.2";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const COPY_ANGLES = [
  "curiosidade: abrir com uma pergunta curta que desperte interesse imediato",
  "rotina real: mostrar um momento comum do dia a dia relacionado ao que o site oferece",
  "beneficio concreto: destacar de forma direta o principal beneficio do site",
  "clareza: explicar em linguagem simples o que o site faz, sem jargao tecnico",
  "primeiro passo: convite leve para experimentar ou conhecer o site",
  "comparacao: contrastar a vida sem o site com a vida usando o site",
  "confianca: reforcar transparencia e seriedade sem prometer resultado certo",
  "prova social: sugerir que outras pessoas ja usam ou aprovam, sem inventar numeros"
];
const IMAGE_SCENES = [
  "lifestyle at home: person relaxed on sofa or desk, phone or laptop showing the site/app",
  "clean product UI: large device mockup with the site interface, no close-up person",
  "creator-style portrait: one person holding phone at chest level, big headline above",
  "step-by-step visual: three compact panels showing a simple flow of using the site",
  "clean feature wall: polished vertical layout of the site's main offerings",
  "notification moment: phone screen showing a positive update or result",
  "split composition: left side person using the product, right side clean app UI",
  "minimal premium ad: bold background color, big headline, simple UI/product elements"
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

function inputSite(input) {
  return {
    name: input.siteName,
    url: input.siteUrl,
    objective: input.objective,
    content_prompt: input.contentPrompt
  };
}

function imageHeadline(input) {
  const requested = compact(input.imageText || input.image_text || input.headline);
  if (requested) return requested.slice(0, 36);
  return compact(input.siteName, "Confira agora").slice(0, 36);
}

function siteSummary(input, variation) {
  return [
    siteContentContext(inputSite(input)),
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
    "Voce e um estrategista senior de social media, especialista em copy organico que converte sem parecer anuncio forcado.",
    "Crie uma legenda em portugues do Brasil, curiosa, dinamica e facil de entender. O texto precisa soar organico, nao como explicacao tecnica.",
    "Evite exagero, fake urgency, claims absolutos, promessas de resultado garantido e termos que parecam golpe.",
    "A legenda deve ser curta, instigante e natural para redes sociais, com 3 a 6 linhas curtas.",
    "Estrutura obrigatoria da legenda: 1) gancho diferente dos posts recentes; 2) explicacao rasa e simples do que o site oferece e por que vale a pena, com base nas diretrizes do site abaixo; 3) CTA claro para acessar o site, coerente com as diretrizes do site.",
    "Nao coloque URL direta na legenda, a menos que o operador peca explicitamente.",
    "Varie de verdade: nao repita a mesma abertura, gancho ou CTA dos posts recentes listados abaixo.",
    "Use frases curtas, quebras de linha e tom simples. Evite texto institucional, explicacao longa, linguagem robotica e listas repetitivas.",
    "A legenda deve melhorar a vontade de clicar: mostre um microbeneficio concreto, uma situacao cotidiana ou uma curiosidade, em vez de apenas explicar o produto.",
    "Siga rigorosamente qualquer regra de compliance, catalogo de recompensas permitido, nome de produto interno ou termo proibido mencionado nas diretrizes do site abaixo.",
    "O prompt de imagem deve variar a cena, composicao, enquadramento e headline a cada geracao. Nao repita sempre a mesma pose/composicao.",
    "O prompt de imagem deve ser, por padrao, uma imagem vertical 9:16 premium para social, coerente com o estilo visual das diretrizes do site abaixo, com uma frase curta grande e legivel.",
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
  const site = inputSite(input);
  const legacy = isLegacyPesquisaPremiosSite(site) && !compact(input.contentPrompt);
  const style = compact(input.style) || siteImageStyle(site);
  const basePrompt = compact(input.prompt || input.image_prompt || input.body);
  const sourceText = `${style} ${basePrompt}`.toLowerCase();
  const headline = imageHeadline(input);
  const scene = compact(input.imageScene || input.image_scene, pickFrom(IMAGE_SCENES, `${headline}-${basePrompt}`));
  const asksForPhoto = /(foto|fotorreal|photoreal|realista|realistic|photographic)/i.test(sourceText);
  const forbidsPeople = /(sem pessoa|sem pessoas|no people|no person|sem rosto|no face|sem humanos|no humans)/i.test(sourceText);
  const mode = forbidsPeople
    ? "premium clean editorial illustration, not photorealistic, no people"
    : asksForPhoto
      ? "controlled photorealistic lifestyle scene with one natural person, no close-up hands, no distorted face"
      : "premium clean editorial illustration or clean UI mockup, polished but not necessarily photorealistic";

  const lines = [
    `Art direction preset: ${mode}.`,
    `Site style and theme guidance: ${style}.`,
    `Composition variation for this asset: ${scene}.`,
    "Vertical 9:16 image for a social media post.",
    "Primary composition: follow the requested composition variation and the site style guidance above, with clean premium layout and clear social-media ad structure.",
    "Person quality rules (when a person appears): at most one person, natural expression, simple pose, no close-up hands, no extra fingers, no distorted face, no random background people.",
    "Text overlay requirement: include exactly one large short headline in Portuguese, with clean typography, no extra tiny text.",
    `Required headline text: "${headline}".`,
    "Visual quality rules: balanced spacing, clear focal point, consistent lighting, no clutter, no awkward cropping, no messy UI, no distorted hands, no uncanny faces, no low quality artifacts.",
    "Never depict guaranteed-earnings imagery (cash piles, bet slips, currency symbols) unless explicitly requested by the site guidance above."
  ];

  if (legacy) {
    lines.push(
      `Gift card label examples allowed: ${pesquisaPremiosRewardText()}. Use plain text labels only, never official logos or brand artwork.`,
      "Coins visual rule: show Coins only as internal points/saldo/progress text or progress bars, never as physical coins, coin icons, round tokens, chips, medals, cash or currency.",
      "Hard avoid list: any coin imagery, physical coins, golden coins, coin icons, round currency tokens, money, banknotes, dollar signs, currency symbols, wallets, gold bars, Pix, recharge phone cards, betting elements, real brand logos, copyrighted characters, tiny unreadable interface text, fake app names."
    );
  }

  lines.push(`Creative direction: ${basePrompt}`);
  return lines.join("\n");
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
  let dataUrl = "";
  if (image.b64_json) {
    buffer = Buffer.from(image.b64_json, "base64");
    dataUrl = `data:image/png;base64,${image.b64_json}`;
  } else {
    const response = await fetch(image.url);
    if (!response.ok) throw new Error(`Download da imagem OpenAI falhou (${response.status}).`);
    buffer = Buffer.from(await response.arrayBuffer());
  }

  if (!mediaStorageEnabled()) {
    return {
      url: "",
      dataUrl: dataUrl || `data:image/png;base64,${buffer.toString("base64")}`,
      contentType: "image/png",
      size: buffer.length,
      ephemeral: true,
      prompt,
      revisedPrompt: image.revised_prompt || "",
      model: process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
      note: "Storage de midia em nuvem esta desativado; imagem retornada apenas como previa temporaria."
    };
  }

  const uploaded = await uploadPublicImage({
    filename: compact(input.filename, "openai-coins"),
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
