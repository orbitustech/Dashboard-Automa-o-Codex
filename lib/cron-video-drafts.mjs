import { generateSocialPost } from "./openai-generation.mjs";
import { pesquisaPremiosRewardText } from "./pesquisa-premios-brand.mjs";
import { isLegacyPesquisaPremiosSite, siteContentContext, siteImageStyle } from "./site-brand.mjs";
import { supabaseRest } from "./supabase-rest.mjs";
import { isVideoDraftAutomation, automationSlot } from "./automation-match.mjs";

const VIDEO_CONTENT_MARKER = "[koinops:video]";

function todaySaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function compact(value, fallback = "") {
  return String(value || fallback).trim();
}

function encodeFilter(value) {
  return encodeURIComponent(value);
}

async function findLegacySite() {
  try {
    const rows = await supabaseRest("sites?select=*&name=ilike.*Pesquisa*&order=created_at.desc&limit=1");
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function getSiteById(id) {
  const rows = await supabaseRest(`sites?select=*&id=eq.${encodeFilter(id)}&limit=1`);
  return rows[0] || null;
}

async function getAutomationById(id) {
  const rows = await supabaseRest(`automations?select=*&id=eq.${encodeFilter(id)}&limit=1`);
  return rows[0] || null;
}

async function recentVideoContentForGeneration(siteId) {
  const rows = await supabaseRest(`content_items?select=title,body,improvement_prompt,revision_notes,channel,status&site_id=eq.${encodeFilter(siteId)}&order=created_at.desc&limit=12`);
  return rows
    .filter((item) => String(item.revision_notes || "").includes(VIDEO_CONTENT_MARKER))
    .slice(0, 8)
    .map((item) => ({
      title: item.title || "",
      body: String(item.body || "").slice(0, 260),
      image_prompt: String(item.improvement_prompt || "").slice(0, 220),
      channel: item.channel || "",
      status: item.status || ""
    }));
}

function recentContentBrief(items) {
  return items
    .map((item, index) => `${index + 1}. ${item.title || "sem titulo"} - ${String(item.body || item.image_prompt || "").slice(0, 180)}`)
    .join("; ");
}

async function contentExists(title) {
  const rows = await supabaseRest(`content_items?select=id,title&title=eq.${encodeFilter(title)}&limit=1`);
  return rows[0] || null;
}

function slotConfig(slot) {
  if (slot === "18h") {
    return {
      label: "18h",
      angle: "video curto para fim de tarde: ritmo leve, tela de app, pessoa usando o site e CTA claro",
      screenText: ""
    };
  }
  return {
    label: "14h",
    angle: "video curto de pausa no dia: mostrar de forma rapida o que o site oferece",
    screenText: ""
  };
}

function daySeed() {
  return `${todaySaoPaulo()}-${Date.now()}`;
}

function generationInput(site, slot, recent) {
  const config = slotConfig(slot);
  const recentBrief = recentContentBrief(recent);
  return {
    siteId: site.id,
    siteName: site.name || "",
    siteUrl: site.url || "",
    objective: site.objective || "",
    contentPrompt: site.content_prompt || "",
    channel: "Todas",
    title: `${site.name || "Site"} - video cron ${config.label}`,
    prompt: [
      `Criar rascunho organico de video vertical para o horario-alvo das ${config.label}.`,
      `Angulo do video: ${config.angle}.`,
      "Legenda curta, natural e dinamica para Reels/TikTok/Instagram/Threads, coerente com as diretrizes do site.",
      "O campo image_prompt deve virar um prompt/roteiro visual de video 9:16, nao uma imagem estatica.",
      recentBrief ? `Evitar repetir estes videos recentes: ${recentBrief}` : ""
    ].filter(Boolean).join(" "),
    improvementPrompt: "",
    image_prompt: "Criar roteiro/prompt de video 9:16 premium para social, coerente com o tema do site.",
    imageText: config.screenText,
    style: "",
    size: "1024x1536",
    quality: "medium",
    durationSeconds: 8,
    resolution: "720p",
    recentContent: recent,
    variationSeed: `${site.id}-video-${config.label}-${daySeed()}`
  };
}

function videoPrompt(generated, input, config, site) {
  const legacy = isLegacyPesquisaPremiosSite(site) && !compact(input.contentPrompt);
  const lines = [
    "Video vertical 9:16 para social, 8 segundos, premium e organico.",
    config.screenText ? `Texto grande na tela: "${config.screenText}".` : "",
    "Cena 1: pessoa em momento cotidiano interagindo com o site/app.",
    "Cena 2: interface limpa mostrando o valor central do site, coerente com as diretrizes abaixo.",
    "Cena 3: reforco visual do beneficio principal, coerente com as diretrizes abaixo.",
    `Diretrizes do site: ${siteContentContext(site)}`,
    `Estilo visual: ${siteImageStyle(site)}`,
    "Evitar: maos deformadas, texto pequeno demais, promessa de resultado garantido."
  ];
  if (legacy) {
    lines.push(`Cards de gift card em texto simples, usando apenas: ${pesquisaPremiosRewardText()}.`);
  }
  lines.push(`Direcao criativa da OpenAI: ${compact(generated.image_prompt || input.image_prompt)}`);
  return lines.filter(Boolean).join(" ");
}

async function insertContent(payload) {
  const [created] = await supabaseRest("content_items", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return created;
}

async function markAutomationRun(automation, result) {
  if (!automation?.id) return;
  try {
    await supabaseRest(`automations?id=eq.${encodeFilter(automation.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        last_run: new Date().toISOString(),
        status: "ativa",
        next_action: result.skipped ? "Rascunho de video ja existia para hoje" : "Rascunho criado em Videos para revisao"
      })
    });
  } catch {
    // O rascunho nao deve falhar so porque a linha de automacao nao foi atualizada.
  }
}

async function createVideoDraftForSite(siteId, targetSlot, automation) {
  const site = await getSiteById(siteId);
  if (!site) return { ok: false, siteId, skipped: true, reason: "site_not_found" };

  const day = todaySaoPaulo();
  const config = slotConfig(targetSlot);
  const title = `${site.name || "Site"} - video rascunho ${config.label} - ${day}`;
  const existing = await contentExists(title);
  if (existing) {
    const result = { ok: true, siteId, skipped: true, reason: "video_draft_already_exists", content: existing };
    await markAutomationRun(automation, result);
    return result;
  }

  const recent = await recentVideoContentForGeneration(site.id);
  const input = generationInput(site, targetSlot, recent);
  const generated = await generateSocialPost(input);
  const prompt = videoPrompt(generated, input, config, site);

  const created = await insertContent({
    site_id: site.id,
    title,
    channel: "Todas",
    body: compact(generated.body),
    asset_url: "",
    status: "Rascunho",
    risk: generated.risk || "baixo",
    due_date: day,
    scheduled_for: null,
    next_action: "Revisar legenda, criar video com Gemini ou anexar MP4, depois enviar para revisao",
    improvement_prompt: prompt,
    revision_notes: [
      generated.revision_notes,
      "Rascunho automatico de video: texto e prompt prontos; MP4 ainda precisa ser gerado no editor ou enviado manualmente.",
      `Criado automaticamente pela automacao de video (${config.label}) em ${new Date().toISOString()}.`,
      VIDEO_CONTENT_MARKER
    ].filter(Boolean).join("\n")
  });

  const result = { ok: true, siteId, skipped: false, content: created, mediaCreated: false };
  await markAutomationRun(automation, result);
  return result;
}

export async function createCronVideoDraft(slot, options = {}) {
  const targetSlot = slot === "18h" ? "18h" : "14h";

  if (options.siteId) {
    const automation = options.automationId ? await getAutomationById(options.automationId) : null;
    return createVideoDraftForSite(options.siteId, targetSlot, automation);
  }

  const siteIds = new Set();
  const automationBySite = new Map();

  try {
    const automations = await supabaseRest("automations?select=*&status=eq.ativa&order=created_at.asc");
    automations
      .filter((automation) => isVideoDraftAutomation(automation) && automationSlot(automation) === targetSlot)
      .forEach((automation) => {
        if (!automation.site_id) return;
        siteIds.add(automation.site_id);
        automationBySite.set(automation.site_id, automation);
      });
  } catch {
    // Segue apenas com o site legado se a consulta de automacoes falhar.
  }

  const legacySite = await findLegacySite();
  if (legacySite?.id) siteIds.add(legacySite.id);

  if (!siteIds.size) {
    return { ok: true, skipped: true, reason: "nenhum site com automacao ativa para este horario", results: [] };
  }

  const results = [];
  for (const siteId of siteIds) {
    try {
      results.push(await createVideoDraftForSite(siteId, targetSlot, automationBySite.get(siteId)));
    } catch (error) {
      results.push({ ok: false, siteId, error: error.message });
    }
  }

  return {
    ok: true,
    results,
    created: results.filter((item) => item.ok && !item.skipped).length
  };
}
