import { PESQUISA_PREMIOS_BRAND, pesquisaPremiosContextText } from "./pesquisa-premios-brand.mjs";

function compact(value, fallback = "") {
  return String(value || fallback).trim();
}

// Pesquisa Premios foi o primeiro site do dashboard e ainda nao tem o campo
// content_prompt preenchido no Supabase; este heuristico mantem o comportamento
// antigo para ele sem exigir migracao de dados.
export function isLegacyPesquisaPremiosSite(site = {}) {
  return /pesquisa/i.test(compact(site.name));
}

export function siteContentContext(site = {}) {
  const custom = compact(site.content_prompt);
  if (custom) {
    return [
      `Nome do site: ${compact(site.name, "Site")}`,
      `URL: ${compact(site.url)}`,
      `Objetivo: ${compact(site.objective)}`,
      "Diretrizes e temas de conteudo definidos pelo operador para este site (siga integralmente, incluindo qualquer regra de compliance mencionada):",
      custom
    ].filter(Boolean).join("\n");
  }

  if (isLegacyPesquisaPremiosSite(site)) return pesquisaPremiosContextText();

  return [
    `Nome do site: ${compact(site.name, "Site")}`,
    `URL: ${compact(site.url)}`,
    `Objetivo: ${compact(site.objective, "nao definido")}`,
    "Nenhum prompt de temas foi cadastrado ainda para este site (cadastre em Sites > Prompt de temas). Escreva com base apenas no nome, URL e objetivo acima, tom profissional e organico, evitando qualquer promessa de ganho financeiro garantido, saque, Pix ou linguagem de aposta ate que o operador defina regras especificas."
  ].join("\n");
}

export function siteImageStyle(site = {}) {
  const custom = compact(site.content_prompt);
  if (custom) return `Estilo visual e temas do site, definidos pelo operador: ${custom.slice(0, 600)}`;
  if (isLegacyPesquisaPremiosSite(site)) return PESQUISA_PREMIOS_BRAND.imageStyle;
  return "Estilo social premium, limpo, cores neutras e profissionais coerentes com o objetivo do site, sem qualquer elemento que pareca moeda, dinheiro ou promessa de ganho garantido.";
}
