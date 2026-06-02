import { generateSocialPost } from "./openai-generation.mjs";
import {
  PESQUISA_PREMIOS_BRAND,
  pesquisaPremiosRewardText,
  pesquisaPremiosRulesText
} from "./pesquisa-premios-brand.mjs";
import { supabaseRest } from "./supabase-rest.mjs";

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

async function findPesquisaPremiosSite() {
  const rows = await supabaseRest("sites?select=*&name=ilike.*Pesquisa*&order=created_at.desc&limit=1");
  const site = rows[0];
  if (!site) throw new Error("Site Pesquisa Premios nao encontrado no Supabase.");
  return site;
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
      titleLabel: "fim de tarde",
      angle: "video curto para fim de tarde: ritmo leve, tela de app, pessoa olhando uma pesquisa rapida e CTA para link da bio",
      screenText: "Gift cards no seu ritmo"
    };
  }
  return {
    label: "14h",
    titleLabel: "tarde",
    angle: "video curto de pausa no dia: mostrar que alguns minutos podem virar Koins dentro das regras do site",
    screenText: "Responda e junte Koins"
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
    siteName: site.name || PESQUISA_PREMIOS_BRAND.name,
    siteUrl: site.url || PESQUISA_PREMIOS_BRAND.url,
    objective: PESQUISA_PREMIOS_BRAND.objective,
    channel: "Todas",
    title: `Pesquisa Premios - video cron ${config.label}`,
    prompt: [
      `Criar rascunho organico de video vertical para o horario-alvo das ${config.label}.`,
      `Angulo do video: ${config.angle}.`,
      "Legenda curta, natural e dinamica para Reels/TikTok/Instagram/Threads.",
      "Sempre chamar para clicar/acessar o link da bio.",
      "Explicar de forma rasa: responder pesquisas, acumular Koins e resgatar gift cards do catalogo permitido.",
      `Citar somente recompensas permitidas quando precisar de exemplo: ${pesquisaPremiosRewardText()}.`,
      `Regras obrigatorias: ${pesquisaPremiosRulesText()}`,
      "O campo image_prompt deve virar um prompt/roteiro visual de video 9:16, nao uma imagem estatica.",
      recentBrief ? `Evitar repetir estes videos recentes: ${recentBrief}` : ""
    ].filter(Boolean).join(" "),
    improvementPrompt: "Video vertical 9:16, Pesquisa Premios brand palette, pessoa brasileira quando fizer sentido, app de pesquisas, Koins como pontos internos, gift cards Netflix/iFood/Spotify em texto simples, sem moedas, dinheiro, Pix, recargas, apostas ou logos oficiais.",
    image_prompt: "Criar roteiro/prompt de video 9:16 premium para social, com cenas curtas de pesquisa no celular, saldo de Koins como pontos internos e gift cards permitidos.",
    imageText: config.screenText,
    style: PESQUISA_PREMIOS_BRAND.imageStyle,
    size: "1024x1536",
    quality: "medium",
    durationSeconds: 8,
    resolution: "720p",
    recentContent: recent,
    variationSeed: `${site.id}-video-${config.label}-${daySeed()}`
  };
}

function videoPrompt(generated, input, config) {
  return [
    "Video vertical 9:16 para social, 8 segundos, premium e organico.",
    `Texto grande na tela: "${config.screenText}".`,
    "Cena 1: pessoa brasileira adulta em momento cotidiano abrindo uma pesquisa no celular.",
    "Cena 2: interface limpa mostra progresso/checklist e Koins como pontos internos, nao dinheiro.",
    `Cena 3: cards de gift card em texto simples, usando apenas: ${pesquisaPremiosRewardText()}.`,
    `Paleta: ${PESQUISA_PREMIOS_BRAND.palette}.`,
    `Regras: ${pesquisaPremiosRulesText()}`,
    "Evitar: moedas fisicas, dinheiro, Pix, recarga, aposta, logos oficiais, maos deformadas, texto pequeno demais e promessa de premio certo.",
    `Direcao criativa da OpenAI: ${compact(generated.image_prompt || input.image_prompt)}`
  ].join(" ");
}

async function insertContent(payload) {
  const [created] = await supabaseRest("content_items", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return created;
}

async function markAutomationRun(siteId, slot, result) {
  const config = slotConfig(slot);
  try {
    await supabaseRest(`automations?site_id=eq.${encodeFilter(siteId)}&name=ilike.*video*${encodeFilter(config.label)}*`, {
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

export async function createCronVideoDraft(slot) {
  const targetSlot = slot === "18h" ? "18h" : "14h";
  const site = await findPesquisaPremiosSite();
  const day = todaySaoPaulo();
  const config = slotConfig(targetSlot);
  const title = `Pesquisa Premios - video rascunho ${config.label} - ${day}`;
  const existing = await contentExists(title);
  if (existing) {
    const result = {
      ok: true,
      skipped: true,
      reason: "video_draft_already_exists",
      content: existing
    };
    await markAutomationRun(site.id, targetSlot, result);
    return result;
  }

  const recent = await recentVideoContentForGeneration(site.id);
  const input = generationInput(site, targetSlot, recent);
  const generated = await generateSocialPost(input);
  const prompt = videoPrompt(generated, input, config);

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
      `Criado automaticamente pela rotina de video (${config.label}) em ${new Date().toISOString()}.`,
      VIDEO_CONTENT_MARKER
    ].filter(Boolean).join("\n")
  });

  const result = {
    ok: true,
    skipped: false,
    content: created,
    mediaCreated: false
  };
  await markAutomationRun(site.id, targetSlot, result);
  return result;
}
