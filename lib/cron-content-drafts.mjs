import { generateImageAsset, generateSocialPost } from "./openai-generation.mjs";
import { supabaseRest } from "./supabase-rest.mjs";

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

async function recentContentTitles(siteId) {
  const rows = await supabaseRest(`content_items?select=title&site_id=eq.${encodeFilter(siteId)}&order=created_at.desc&limit=6`);
  return rows.map((item) => item.title).filter(Boolean).join("; ");
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
      angle: "gancho mais leve, com energia de fim de tarde, convite simples para experimentar pelo link da bio",
      imageText: "Koins viram premios"
    };
  }
  return {
    label: "14h",
    titleLabel: "tarde",
    angle: "gancho curioso de meio do dia, mostrando que poucos minutos livres podem virar Koins",
    imageText: "Responda e acumule Koins"
  };
}

function generationInput(site, slot, recent) {
  const config = slotConfig(slot);
  return {
    siteId: site.id,
    siteName: site.name || "Pesquisa Premios",
    siteUrl: site.url || "https://pesquisapremios.com/",
    objective: site.objective || "Gerar cadastros e uso do Pesquisa Premios",
    channel: "Todas",
    title: `Pesquisa Premios - cron ${config.label}`,
    prompt: [
      `Criar rascunho organico automatico para o horario-alvo das ${config.label}.`,
      `Angulo do post: ${config.angle}.`,
      "Legenda curta, natural e dinamica. Sempre mandar clicar/acessar o link da bio.",
      "Explicar de forma rasa: responder pesquisas, acumular Koins e resgatar gift cards ou outros premios disponiveis.",
      "Citar exemplos como Uber, iFood, Netflix ou Spotify apenas como disponibilidade de catalogo, sem prometer premio certo.",
      "Nao prometer renda, saque, ganho garantido ou urgencia artificial.",
      recent ? `Evitar repetir estes posts recentes: ${recent}` : ""
    ].filter(Boolean).join(" "),
    improvementPrompt: "Pesquisa Premios brand palette, pessoa brasileira, smartphone, gift cards Uber/iFood/Netflix/Spotify como texto simples, sem moedas, dinheiro ou logos oficiais.",
    image_prompt: "Criar imagem vertical 9:16 premium para social, com uma pessoa brasileira, smartphone, tela de pontos Koins e cards de gift card com texto legivel.",
    imageText: config.imageText,
    style: "Pesquisa Premios brand palette, dark navy background, yellow highlights, green CTA accents, one Brazilian adult, named gift cards, no money imagery, no official logos",
    size: "1024x1536",
    quality: "medium"
  };
}

async function insertContent(payload) {
  const [created] = await supabaseRest("content_items", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return created;
}

export async function createCronContentDraft(slot) {
  const targetSlot = slot === "18h" ? "18h" : "14h";
  const site = await findPesquisaPremiosSite();
  const day = todaySaoPaulo();
  const config = slotConfig(targetSlot);
  const title = `Pesquisa Premios - rascunho ${config.label} - ${day}`;
  const existing = await contentExists(title);
  if (existing) {
    return {
      ok: true,
      skipped: true,
      reason: "draft_already_exists",
      content: existing
    };
  }

  const recent = await recentContentTitles(site.id);
  const input = generationInput(site, targetSlot, recent);
  const generated = await generateSocialPost(input);
  let media = null;
  let mediaError = "";
  const shouldCreateImage = process.env.KOINOPS_CRON_CREATE_IMAGE === "1";

  if (shouldCreateImage) {
    try {
      media = await generateImageAsset({
        ...input,
        prompt: generated.image_prompt || input.image_prompt || generated.body || input.prompt,
        filename: title
      });
    } catch (error) {
      mediaError = error.message;
    }
  }

  const created = await insertContent({
    site_id: site.id,
    title,
    channel: "Todas",
    body: compact(generated.body),
    asset_url: media?.url || "",
    status: "Rascunho",
    risk: generated.risk || "baixo",
    due_date: day,
    scheduled_for: null,
    next_action: media?.url ? "Revisar e aprovar: postar agora ou agendar" : "Revisar legenda e criar imagem antes de enviar para aprovacao",
    improvement_prompt: generated.image_prompt || input.image_prompt,
    revision_notes: [
      generated.revision_notes,
      `Criado automaticamente pelo Vercel Cron (${config.label}) em ${new Date().toISOString()}.`,
      shouldCreateImage ? "" : "Imagem automatica desligada no cron para evitar timeout no plano gratis. Use Criar imagem no rascunho.",
      mediaError ? `Imagem nao criada automaticamente: ${mediaError}` : ""
    ].filter(Boolean).join("\n")
  });

  return {
    ok: true,
    skipped: false,
    content: created,
    mediaCreated: Boolean(media?.url)
  };
}
