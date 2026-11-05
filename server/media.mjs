import { brandsConfig } from "../extract/lib/config.mjs";
import { getStore } from "./store.mjs";
import { ApiInputError } from "./api.mjs";

// Metade Midia: conteudo (kanban com aprovacao) e perfis das redes. As marcas
// sao as mesmas do hub (config/brands.json): e o cadastro unico das duas metades.

// Redes escolhidas pelo Nicolas; as outras do publisher antigo ficam desligadas (D9).
export const NETWORKS = { instagram: "Instagram", threads: "Threads" };

export const STATUSES = ["rascunho", "aprovacao", "agendado", "publicado"];

// Quem pode ir para onde pela tela. "publicado" so o publicador grava.
const TRANSITIONS = {
  rascunho: ["aprovacao"],
  aprovacao: ["rascunho", "agendado"],
  agendado: ["rascunho"],
  publicado: []
};

const EDITABLE = ["brand_id", "title", "caption", "networks", "link_url", "scheduled_for", "media"];

function brandById(id) {
  const brand = brandsConfig.brands.find((b) => b.brand_id === id);
  if (!brand) throw new ApiInputError(`Marca desconhecida: ${id}`);
  return brand;
}

// Mesmo padrao das campanhas pagas (PMKT-307). utm_medium=social nao e midia
// paga, entao o hub classifica o lead como organico e acha a marca pelo nome.
export function utmLink(url, { brand, network, contentId }) {
  if (!url) return null;
  let link;
  try {
    link = new URL(url);
  } catch {
    return null;
  }
  link.searchParams.set("utm_source", network);
  link.searchParams.set("utm_medium", "social");
  link.searchParams.set("utm_campaign", `ORB | ${brand.campaign_tokens[0]} | Conteudo | ${NETWORKS[network]}`);
  link.searchParams.set("utm_content", contentId);
  return link.toString();
}

function present(item) {
  const brand = brandById(item.brand_id);
  return {
    ...item,
    brand_name: brand.short_name,
    links: Object.fromEntries((item.networks || []).map((n) => [n, utmLink(item.link_url, { brand, network: n, contentId: item.id })]))
  };
}

function cleanFields(body) {
  const out = {};
  for (const key of EDITABLE) if (key in body) out[key] = body[key];
  if ("brand_id" in out) brandById(out.brand_id);
  if ("networks" in out) {
    if (!Array.isArray(out.networks) || out.networks.some((n) => !NETWORKS[n])) throw new ApiInputError("Rede inválida");
    out.networks = [...new Set(out.networks)];
  }
  if (out.link_url && !utmLink(out.link_url, { brand: brandsConfig.brands[0], network: "instagram", contentId: "x" })) {
    throw new ApiInputError("Link inválido; use o endereço completo, com https://");
  }
  if (out.scheduled_for && Number.isNaN(Date.parse(out.scheduled_for))) throw new ApiInputError("Data de agendamento inválida");
  return out;
}

// O que falta para o item poder ir de `from` para `to`. Lista vazia = pode.
export async function transitionProblems(item, to, { note, now = new Date() } = {}, store = getStore()) {
  if (!TRANSITIONS[item.status]?.includes(to)) return [`Não dá para mover de ${item.status} para ${to}`];
  const problems = [];
  if (to === "aprovacao" && !item.caption?.trim()) problems.push("Escreva a legenda antes de pedir aprovação");
  if (item.status === "aprovacao" && to === "rascunho" && !note?.trim()) problems.push("Diga o que mudar ao devolver para rascunho");
  if (to === "agendado") {
    if (!item.networks?.length) problems.push("Escolha ao menos uma rede");
    if (!item.scheduled_for) problems.push("Defina data e hora da publicação");
    else if (Date.parse(item.scheduled_for) < now.getTime()) problems.push("A data de publicação já passou");
    const accounts = await store.list("social_accounts", { brand_id: item.brand_id, active: true });
    for (const n of item.networks || []) {
      if (!accounts.some((a) => a.network === n)) problems.push(`A marca não tem perfil ativo no ${NETWORKS[n]}`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------- rotas

const user = (ctx) => ctx.user || "local";

async function listContent(ctx) {
  const items = await getStore().list("content_items", { brand_id: ctx.params.brand });
  items.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  return { statuses: STATUSES, networks: NETWORKS, items: items.map(present) };
}

async function createContent(ctx) {
  const body = ctx.body || {};
  brandById(body.brand_id);
  const now = new Date().toISOString();
  const item = await getStore().put("content_items", {
    brand_id: body.brand_id, title: "", caption: "", networks: [], link_url: "", scheduled_for: null, media: [],
    ...cleanFields(body),
    status: "rascunho", created_by: user(ctx), created_at: now, updated_at: now,
    history: [{ at: now, by: user(ctx), to: "rascunho" }]
  });
  return present(item);
}

async function loadContent(id) {
  const item = await getStore().get("content_items", id);
  if (!item) throw new ApiInputError("Conteúdo não encontrado", 404);
  return item;
}

async function updateContent(ctx, id) {
  const item = await loadContent(id);
  const body = ctx.body || {};
  const now = new Date().toISOString();
  const fields = cleanFields(body);
  if (Object.keys(fields).length && item.status !== "rascunho") throw new ApiInputError("Só dá para editar em rascunho; devolva o item antes");
  let next = { ...item, ...fields, updated_at: now };
  if (body.status && body.status !== item.status) {
    const problems = await transitionProblems(next, body.status, { note: body.note });
    if (problems.length) throw new ApiInputError(problems.join(". "));
    next = { ...next, status: body.status, history: [...item.history, { at: now, by: user(ctx), from: item.status, to: body.status, note: body.note || null }] };
    if (body.status === "agendado") next.approved_by = user(ctx);
  }
  return present(await getStore().put("content_items", next));
}

async function deleteContent(ctx, id) {
  const item = await loadContent(id);
  if (item.status === "publicado") throw new ApiInputError("Conteúdo publicado não pode ser apagado");
  await getStore().remove("content_items", id);
  return { ok: true };
}

async function listAccounts(ctx) {
  const accounts = await getStore().list("social_accounts", { brand_id: ctx.params.brand });
  return {
    networks: NETWORKS,
    brands: brandsConfig.brands.map((b) => ({ brand_id: b.brand_id, name: b.short_name })),
    accounts: accounts.map((a) => ({ ...a, brand_name: brandById(a.brand_id).short_name }))
  };
}

function cleanAccount(body) {
  brandById(body.brand_id);
  if (!NETWORKS[body.network]) throw new ApiInputError("Rede inválida");
  const handle = String(body.handle || "").trim().replace(/^@/, "");
  if (!handle) throw new ApiInputError("Informe o @ do perfil");
  // O token nunca passa pelo app: so o nome do segredo onde ele mora.
  return {
    brand_id: body.brand_id, network: body.network, handle,
    external_id: String(body.external_id || "").trim() || null,
    secret_name: String(body.secret_name || "").trim() || null,
    active: body.active !== false
  };
}

async function createAccount(ctx) {
  return getStore().put("social_accounts", { ...cleanAccount(ctx.body || {}), created_at: new Date().toISOString() });
}

async function updateAccount(ctx, id) {
  const current = await getStore().get("social_accounts", id);
  if (!current) throw new ApiInputError("Perfil não encontrado", 404);
  return getStore().put("social_accounts", { ...current, ...cleanAccount({ ...current, ...ctx.body }), id });
}

async function deleteAccount(ctx, id) {
  return { ok: await getStore().remove("social_accounts", id) };
}

// [metodo, padrao, funcao]; :id vira o segundo argumento.
export const MEDIA_ROUTES = [
  ["GET", "/api/media/brands", async () => ({ brands: brandsConfig.brands.map((b) => ({ brand_id: b.brand_id, short_name: b.short_name })) })],
  ["GET", "/api/media/content", listContent],
  ["POST", "/api/media/content", createContent],
  ["PATCH", "/api/media/content/:id", updateContent],
  ["DELETE", "/api/media/content/:id", deleteContent],
  ["GET", "/api/media/accounts", listAccounts],
  ["POST", "/api/media/accounts", createAccount],
  ["PATCH", "/api/media/accounts/:id", updateAccount],
  ["DELETE", "/api/media/accounts/:id", deleteAccount]
];

export function matchMediaRoute(method, pathname) {
  for (const [m, pattern, fn] of MEDIA_ROUTES) {
    const re = new RegExp(`^${pattern.replace(":id", "([\\w-]+)")}$`);
    const hit = pathname.match(re);
    if (hit && m === method) return { fn, id: hit[1] };
  }
  return null;
}
