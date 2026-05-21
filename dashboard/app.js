const STORAGE_KEY = "koinops-dashboard-v3";
const supabaseConfig = window.KOINOPS_SUPABASE || {};

const seedData = {
  sites: [],
  socials: [],
  automations: [],
  content: [],
  distribution: [],
  prizes: [],
  koinMetrics: [],
  approvals: [],
  supportMessages: [],
  faqEntries: [],
  reports: [],
  rules: [],
  auditLog: [],
  koins: {
    issued: 0,
    redeemed: 0,
    pendingRedemptions: 0,
    fraudAlerts: 0
  }
};

const tableConfig = {
  sites: { table: "sites", order: "created_at.desc", normalize: normalizeSites },
  socials: { table: "social_accounts", order: "created_at.desc", normalize: normalizeSocials },
  automations: { table: "automations", order: "created_at.desc", normalize: normalizeAutomations },
  content: { table: "content_items", order: "created_at.desc", normalize: normalizeContent },
  distribution: { table: "distribution_tasks", order: "created_at.desc", normalize: normalizeDistribution },
  prizes: { table: "prizes", order: "created_at.desc", normalize: normalizePrizes },
  koinMetrics: { table: "koin_metrics", order: "measured_at.desc", normalize: normalizeKoinMetrics },
  approvals: { table: "approvals", order: "created_at.desc", normalize: normalizeApprovals },
  supportMessages: { table: "support_messages", order: "created_at.desc", normalize: normalizeSupportMessages },
  faqEntries: { table: "faq_entries", order: "created_at.desc", normalize: normalizeFaqEntries },
  reports: { table: "report_metrics", order: "report_date.desc,created_at.desc", normalize: normalizeReports },
  rules: { table: "governance_rules", order: "created_at.desc", normalize: normalizeRules }
};

let state = loadState();
let currentView = "overview";
let syncMode = "local";
let filters = {
  siteId: "all",
  search: ""
};

const titles = {
  overview: "Visao geral",
  sites: "Sites",
  social: "Redes sociais",
  automations: "Automacoes",
  content: "Conteudo",
  koins: "Koins e premios",
  approvals: "Aprovacoes",
  support: "Suporte",
  reports: "Relatorios",
  settings: "Governanca"
};

const columns = ["Rascunho", "Aprovacao", "Agendado", "Publicado"];

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return clone(seedData);
  try {
    return normalizeState(JSON.parse(saved));
  } catch {
    return clone(seedData);
  }
}

function normalizeState(value) {
  return {
    ...clone(seedData),
    ...value,
    sites: normalizeSites(value.sites || []),
    socials: normalizeSocials(value.socials || value.social_accounts || []),
    automations: normalizeAutomations(value.automations || []),
    content: normalizeContent(value.content || value.content_items || []),
    distribution: normalizeDistribution(value.distribution || value.distribution_tasks || []),
    prizes: normalizePrizes(value.prizes || []),
    koinMetrics: normalizeKoinMetrics(value.koinMetrics || value.koin_metrics || []),
    approvals: normalizeApprovals(value.approvals || []),
    supportMessages: normalizeSupportMessages(value.supportMessages || value.support_messages || []),
    faqEntries: normalizeFaqEntries(value.faqEntries || value.faq_entries || []),
    reports: normalizeReports(value.reports || value.report_metrics || []),
    rules: normalizeRules(value.rules || value.governance_rules || [])
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanBufferChannelId(value) {
  return String(value || "").trim().split(/\s+/)[0] || "";
}

function isSupabaseReady() {
  return Boolean(
    supabaseConfig.url &&
    supabaseConfig.anonKey &&
    !supabaseConfig.anonKey.includes("COLE_SUA")
  );
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: supabaseConfig.anonKey,
    Authorization: `Bearer ${supabaseConfig.anonKey}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function supabaseRequest(path, options = {}) {
  if (!isSupabaseReady()) throw new Error("Supabase nao configurado");
  const response = await fetch(`${supabaseConfig.url}/rest/v1/${path}`, {
    ...options,
    headers: supabaseHeaders(options.headers)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Erro Supabase ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function normalizeSites(sites) {
  return sites.map((site) => ({
    id: site.id,
    name: site.name || "",
    url: site.url || "",
    objective: site.objective || "",
    status: site.status || "ativo",
    vault_reference: site.vault_reference || site.vault || "",
    api_type: site.api_type || site.api || site.platform || "",
    last_audit: site.last_audit || site.lastAudit || null,
    next_action: site.next_action || site.nextAction || "Definir proxima acao",
    created_at: site.created_at || null,
    updated_at: site.updated_at || null
  }));
}

function normalizeSocials(items) {
  return items.map((item) => ({
    id: item.id,
    site_id: item.site_id || item.siteId || "",
    channel: item.channel || "",
    handle: item.handle || "",
    profile_url: item.profile_url || item.url || "",
    buffer_channel_id: cleanBufferChannelId(item.buffer_channel_id || item.bufferChannelId),
    cadence: item.cadence || "",
    posts_per_month: Number(item.posts_per_month ?? item.posts ?? 0),
    clicks: Number(item.clicks ?? 0),
    growth: Number(item.growth ?? 0),
    status: item.status || "ativo",
    next_action: item.next_action || item.nextAction || "",
    created_at: item.created_at || null,
    updated_at: item.updated_at || null
  }));
}

function normalizeAutomations(items) {
  return items.map((item) => ({
    id: item.id,
    site_id: item.site_id || item.siteId || "",
    name: item.name || "",
    schedule: item.schedule || "",
    owner: item.owner || "Codex",
    output: item.output || "",
    risk: item.risk || "baixo",
    status: item.status || "ativa",
    last_run: item.last_run || item.lastRun || null,
    next_action: item.next_action || item.nextAction || "",
    created_at: item.created_at || null,
    updated_at: item.updated_at || null
  }));
}

function normalizeContent(items) {
  return items.map((item) => ({
    id: item.id,
    site_id: item.site_id || item.siteId || "",
    title: item.title || "",
    channel: item.channel || "",
    body: item.body || item.text || "",
    asset_url: item.asset_url || item.assetUrl || "",
    status: item.status || "Rascunho",
    risk: item.risk || "baixo",
    due_date: item.due_date || item.due || null,
    approved_at: item.approved_at || null,
    scheduled_for: item.scheduled_for || null,
    published_at: item.published_at || null,
    published_url: item.published_url || "",
    utm_url: item.utm_url || "",
    next_action: item.next_action || item.nextAction || "",
    created_at: item.created_at || null,
    updated_at: item.updated_at || null
  }));
}

function normalizeDistribution(items) {
  return items.map((item) => ({
    id: item.id,
    site_id: item.site_id || item.siteId || "",
    content_id: item.content_id || item.contentId || "",
    target: item.target || "",
    buffer_channel_id: cleanBufferChannelId(item.buffer_channel_id || item.bufferChannelId),
    buffer_post_id: item.buffer_post_id || item.bufferPostId || "",
    status: item.status || "fila",
    scheduled_for: item.scheduled_for || null,
    published_at: item.published_at || null,
    published_url: item.published_url || "",
    utm_source: item.utm_source || "",
    utm_medium: item.utm_medium || "",
    utm_campaign: item.utm_campaign || "",
    utm_url: item.utm_url || "",
    note: item.note || "",
    error_message: item.error_message || item.errorMessage || "",
    created_at: item.created_at || null,
    updated_at: item.updated_at || null
  }));
}

function normalizePrizes(items) {
  return items.map((item) => ({
    id: item.id,
    site_id: item.site_id || item.siteId || "",
    name: item.name || "",
    cost: Number(item.cost ?? 0),
    stock: Number(item.stock ?? 0),
    redemptions: Number(item.redemptions ?? 0),
    status: item.status || "ok",
    created_at: item.created_at || null,
    updated_at: item.updated_at || null
  }));
}

function normalizeKoinMetrics(items) {
  return items.map((item) => ({
    id: item.id,
    site_id: item.site_id || item.siteId || "",
    issued: Number(item.issued ?? 0),
    redeemed: Number(item.redeemed ?? 0),
    pending_redemptions: Number(item.pending_redemptions ?? item.pendingRedemptions ?? 0),
    fraud_alerts: Number(item.fraud_alerts ?? item.fraudAlerts ?? 0),
    measured_at: item.measured_at || item.created_at || new Date().toISOString(),
    created_at: item.created_at || null,
    updated_at: item.updated_at || null
  }));
}

function normalizeApprovals(items) {
  return items.map((item) => ({
    id: item.id,
    site_id: item.site_id || item.siteId || "",
    title: item.title || "",
    type: item.type || "",
    detail: item.detail || "",
    risk: item.risk || "medio",
    status: item.status || "pendente",
    decided_at: item.decided_at || null,
    created_at: item.created_at || null,
    updated_at: item.updated_at || null
  }));
}

function normalizeSupportMessages(items) {
  return items.map((item) => ({
    id: item.id,
    site_id: item.site_id || item.siteId || "",
    source: item.source || "",
    author: item.author || "",
    message: item.message || "",
    category: item.category || "duvida",
    risk: item.risk || "baixo",
    status: item.status || "novo",
    suggested_reply: item.suggested_reply || "",
    final_reply: item.final_reply || "",
    created_at: item.created_at || null,
    updated_at: item.updated_at || null
  }));
}

function normalizeFaqEntries(items) {
  return items.map((item) => ({
    id: item.id,
    site_id: item.site_id || item.siteId || "",
    topic: item.topic || "",
    question: item.question || "",
    answer: item.answer || "",
    status: item.status || "rascunho",
    created_at: item.created_at || null,
    updated_at: item.updated_at || null
  }));
}

function normalizeReports(items) {
  return items.map((item) => ({
    id: item.id,
    site_id: item.site_id || item.siteId || "",
    report_date: item.report_date || item.date || null,
    traffic: Number(item.traffic ?? 0),
    posts: Number(item.posts ?? 0),
    signups: Number(item.signups ?? 0),
    created_at: item.created_at || null,
    updated_at: item.updated_at || null
  }));
}

function normalizeRules(items) {
  return items.map((item) => ({
    id: item.id,
    category: item.category || "operacao",
    title: item.title || "",
    detail: item.detail || "",
    status: item.status || "ativa",
    created_at: item.created_at || null,
    updated_at: item.updated_at || null
  }));
}

async function syncAllFromSupabase(showSuccess = true) {
  if (!isSupabaseReady()) {
    syncMode = "local";
    updateSyncStatus("Configure a chave do Supabase", "warn");
    return;
  }
  try {
    updateSyncStatus("Sincronizando...", "info");
    const entries = Object.entries(tableConfig);
    const results = await Promise.all(entries.map(async ([key, config]) => {
      const rows = await supabaseRequest(`${config.table}?select=*&order=${config.order}`);
      return [key, config.normalize(rows)];
    }));
    results.forEach(([key, rows]) => {
      state[key] = rows;
    });
    saveState();
    syncMode = "supabase";
    render();
    updateSyncStatus("Supabase conectado", "ok");
    if (showSuccess) toast("Dados sincronizados com Supabase.");
  } catch (error) {
    syncMode = "local";
    updateSyncStatus("Falha no Supabase", "risk");
    toast(`Supabase: ${error.message}`);
  }
}

async function createRecord(collection, payload) {
  const config = tableConfig[collection];
  if (!config) throw new Error("Colecao invalida");
  if (!isSupabaseReady()) {
    const localRecord = { ...payload, id: `local-${collection}-${Date.now()}` };
    state[collection].unshift(localRecord);
    syncMode = "local";
    return localRecord;
  }
  const [created] = await supabaseRequest(config.table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  syncMode = "supabase";
  return config.normalize([created])[0];
}

async function updateRecord(collection, id, patch) {
  const config = tableConfig[collection];
  if (!config) throw new Error("Colecao invalida");
  if (isSupabaseReady() && !String(id).startsWith("local-")) {
    await supabaseRequest(`${config.table}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(patch)
    });
    syncMode = "supabase";
  } else {
    syncMode = "local";
  }
  state[collection] = state[collection].map((item) => item.id === id ? { ...item, ...patch } : item);
}

async function deleteRecord(collection, id) {
  const config = tableConfig[collection];
  if (!config) throw new Error("Colecao invalida");
  if (isSupabaseReady() && !String(id).startsWith("local-")) {
    await supabaseRequest(`${config.table}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
    syncMode = "supabase";
  } else {
    syncMode = "local";
  }
  state[collection] = state[collection].filter((item) => item.id !== id);
}

async function createSite(site) {
  return createRecord("sites", site);
}

async function updateSite(id, patch) {
  return updateRecord("sites", id, patch);
}

async function deleteSite(id) {
  await deleteRecord("sites", id);
  ["socials", "automations", "content", "distribution", "prizes", "koinMetrics", "approvals", "supportMessages", "faqEntries", "reports"].forEach((key) => {
    state[key] = state[key].filter((item) => item.site_id !== id);
  });
}

function updateSyncStatus(label, type = "info") {
  const status = qs("#syncStatus");
  status.textContent = label;
  status.dataset.type = type;
}

function siteName(siteId) {
  if (siteId === "all") return "Todos";
  return state.sites.find((site) => site.id === siteId)?.name || "Sem site";
}

function contentTitle(contentId) {
  return state.content.find((item) => item.id === contentId)?.title || "Conteudo sem titulo";
}

function buildUtmUrl(baseUrl, source, medium, campaign) {
  if (!baseUrl) return "";
  try {
    const url = new URL(baseUrl);
    if (source) url.searchParams.set("utm_source", source);
    if (medium) url.searchParams.set("utm_medium", medium);
    if (campaign) url.searchParams.set("utm_campaign", campaign);
    return url.toString();
  } catch {
    return baseUrl;
  }
}

function formatDate(value) {
  if (!value) return "Pendente";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatShortDate(value) {
  if (!value) return "Sem data";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function statusChip(status) {
  const normalized = String(status).toLowerCase();
  const type = normalized.includes("ativo") || normalized.includes("ativa") || normalized.includes("aprovado") || normalized.includes("ok")
    ? "ok"
    : normalized.includes("pendente") || normalized.includes("atencao") || normalized.includes("pausado") || normalized.includes("pausada") || normalized.includes("medio") || normalized.includes("baixo")
      ? "warn"
      : normalized.includes("inativo") || normalized.includes("erro") || normalized.includes("alto") || normalized.includes("critico") || normalized.includes("risco") || normalized.includes("rejeitado")
        ? "risk"
        : "info";
  return `<span class="chip ${type}">${esc(status)}</span>`;
}

function riskChip(risk) {
  const type = risk === "alto" ? "risk" : risk === "medio" ? "warn" : "ok";
  return `<span class="chip ${type}">${esc(risk)}</span>`;
}

function matchesSearch(item) {
  const term = filters.search.trim().toLowerCase();
  if (!term) return true;
  return Object.values(item).join(" ").toLowerCase().includes(term);
}

function matchesSite(item) {
  return filters.siteId === "all" || item.site_id === filters.siteId || item.siteId === filters.siteId || item.id === filters.siteId;
}

function filtered(items) {
  return items.filter((item) => matchesSite(item) && matchesSearch(item));
}

function render() {
  renderSiteFilter();
  renderFormSiteSelects();
  renderKpis();
  renderNextActions();
  renderFunnel();
  renderSites();
  renderSocial();
  renderAutomations();
  renderContent();
  renderDistribution();
  renderKoins();
  renderApprovals();
  renderSupport();
  renderFaq();
  renderReports();
  renderSettings();
  updateSyncStatus(syncMode === "supabase" ? "Supabase conectado" : "Modo local", syncMode === "supabase" ? "ok" : "info");
}

function renderSiteFilter() {
  const select = qs("#siteFilter");
  const value = select.value || filters.siteId;
  select.innerHTML = [
    `<option value="all">Todos os projetos</option>`,
    ...state.sites.map((site) => `<option value="${esc(site.id)}">${esc(site.name)}</option>`)
  ].join("");
  select.value = state.sites.some((site) => site.id === value) ? value : "all";
  filters.siteId = select.value;
}

function renderFormSiteSelects() {
  qsa("[data-site-select]").forEach((select) => {
    const current = select.value;
    select.innerHTML = state.sites.length
      ? state.sites.map((site) => `<option value="${esc(site.id)}">${esc(site.name)}</option>`).join("")
      : `<option value="">Cadastre um site primeiro</option>`;
    select.disabled = !state.sites.length;
    if (state.sites.some((site) => site.id === current)) select.value = current;
  });
  const reportDate = qs("#reportForm input[name='report_date']");
  if (reportDate && !reportDate.value) reportDate.value = todayValue();
  renderContentSelects();
}

function renderContentSelects() {
  qsa("[data-content-select]").forEach((select) => {
    const current = select.value;
    const options = state.content.filter((item) => ["Agendado", "Publicado"].includes(item.status));
    select.innerHTML = options.length
      ? options.map((item) => `<option value="${esc(item.id)}">${esc(item.title)} - ${esc(siteName(item.site_id))}</option>`).join("")
      : `<option value="">Sem conteudo aprovado</option>`;
    select.disabled = !options.length;
    if (options.some((item) => item.id === current)) select.value = current;
  });
}

function renderKpis() {
  const sites = filtered(state.sites);
  const approvals = filtered(state.approvals).filter((item) => item.status === "pendente");
  const automations = filtered(state.automations).filter((item) => item.status === "ativa");
  const prizeAlerts = filtered(state.prizes).filter((item) => item.status !== "ok");
  const audited = sites.filter((site) => site.last_audit).length;
  const kpis = [
    { label: "Sites ativos", value: sites.filter((site) => site.status === "ativo").length, hint: `${sites.length} cadastrados` },
    { label: "Redes ativas", value: filtered(state.socials).filter((item) => item.status === "ativo").length, hint: "perfis monitorados" },
    { label: "Automacoes", value: automations.length, hint: "ativas agora" },
    { label: "Aprovacoes", value: approvals.length, hint: "pendentes" },
    { label: "Alertas", value: prizeAlerts.length + sites.filter((site) => site.status === "atencao").length, hint: `${audited} sites auditados` }
  ];
  qs("#kpiGrid").innerHTML = kpis.map((item) => `
    <article class="kpi">
      <span>${esc(item.label)}</span>
      <strong>${esc(item.value)}</strong>
      <small>${esc(item.hint)}</small>
    </article>
  `).join("");
}

function renderNextActions() {
  const siteActions = filtered(state.sites).map((site) => ({
    title: site.next_action || "Definir proxima acao",
    detail: `${site.name} - site`,
    risk: site.status === "atencao" ? "medio" : site.status === "inativo" ? "alto" : "baixo"
  }));
  const socialActions = filtered(state.socials).filter((item) => item.next_action).map((item) => ({
    title: item.next_action,
    detail: `${siteName(item.site_id)} - ${item.channel}`,
    risk: item.status === "atencao" ? "medio" : "baixo"
  }));
  const automationActions = filtered(state.automations).filter((item) => item.next_action || item.status === "erro").map((item) => ({
    title: item.next_action || "Revisar automacao com erro",
    detail: `${siteName(item.site_id)} - ${item.name}`,
    risk: item.status === "erro" ? "alto" : item.risk
  }));
  const contentActions = filtered(state.content).filter((item) => item.status !== "Publicado").map((item) => ({
    title: item.next_action || `Avancar conteudo: ${item.title}`,
    detail: `${siteName(item.site_id)} - vence ${formatShortDate(item.due_date)}`,
    risk: item.risk
  }));
  const distributionActions = filtered(state.distribution).filter((item) => item.status !== "publicado").map((item) => ({
    title: `Distribuir: ${contentTitle(item.content_id)}`,
    detail: `${siteName(item.site_id)} - ${item.target || "sem destino"}`,
    risk: item.status === "erro" ? "alto" : "baixo"
  }));
  const supportActions = filtered(state.supportMessages).filter((item) => ["novo", "sugerido", "aprovacao"].includes(item.status)).map((item) => ({
    title: `Responder ${item.category}: ${item.author || item.source || "sem autor"}`,
    detail: `${siteName(item.site_id)} - ${item.status}`,
    risk: item.risk
  }));
  const approvalActions = filtered(state.approvals)
    .filter((item) => item.status === "pendente")
    .map((item) => ({
      title: item.title,
      detail: `${siteName(item.site_id)} - ${item.type}`,
      risk: item.risk
    }));
  const prizeActions = filtered(state.prizes).filter((item) => item.status !== "ok").map((item) => ({
    title: `Revisar premio: ${item.name}`,
    detail: `${siteName(item.site_id)} - estoque ${item.stock}`,
    risk: item.status === "critico" ? "alto" : "medio"
  }));
  const actions = [...approvalActions, ...supportActions, ...prizeActions, ...distributionActions, ...automationActions, ...contentActions, ...socialActions, ...siteActions].slice(0, 8);
  qs("#nextActions").innerHTML = actions.length ? actions.map((item) => `
    <article class="action-row">
      <div>
        <h5>${esc(item.title)}</h5>
        <p>${esc(item.detail)}</p>
      </div>
      ${riskChip(item.risk)}
    </article>
  `).join("") : emptyState("Nenhuma acao encontrada para o filtro atual.");
}

function currentKoinTotals() {
  const metrics = filtered(state.koinMetrics);
  const latestBySite = new Map();
  metrics.forEach((metric) => {
    const key = metric.site_id || "global";
    const current = latestBySite.get(key);
    if (!current || new Date(metric.measured_at) > new Date(current.measured_at)) latestBySite.set(key, metric);
  });
  const latest = [...latestBySite.values()];
  return latest.reduce((total, metric) => ({
    issued: total.issued + metric.issued,
    redeemed: total.redeemed + metric.redeemed,
    pendingRedemptions: total.pendingRedemptions + metric.pending_redemptions,
    fraudAlerts: total.fraudAlerts + metric.fraud_alerts
  }), { issued: 0, redeemed: 0, pendingRedemptions: 0, fraudAlerts: 0 });
}

function currentReportTotals() {
  return filtered(state.reports).reduce((total, item) => ({
    traffic: total.traffic + item.traffic,
    posts: total.posts + item.posts,
    signups: total.signups + item.signups
  }), { traffic: 0, posts: 0, signups: 0 });
}

function renderFunnel() {
  const reportTotals = currentReportTotals();
  const koins = currentKoinTotals();
  const values = [
    { label: "Cadastros", value: reportTotals.signups, max: Math.max(10, reportTotals.signups), color: "green" },
    { label: "Trafego", value: reportTotals.traffic, max: Math.max(100, reportTotals.traffic), color: "" },
    { label: "Koins", value: koins.issued, max: Math.max(100, koins.issued), color: "amber" },
    { label: "Resgates", value: koins.pendingRedemptions, max: Math.max(20, koins.pendingRedemptions), color: "" }
  ];
  qs("#funnelChart").innerHTML = values.map((item) => `
    <div class="bar-row">
      <span>${esc(item.label)}</span>
      <div class="bar-track"><div class="bar-fill ${item.color}" style="width:${Math.min(100, Math.round(item.value / item.max * 100))}%"></div></div>
      <strong>${esc(item.value)}</strong>
    </div>
  `).join("");
}

function renderSites() {
  const sites = filtered(state.sites);
  qs("#sitesTable").innerHTML = tableMarkup(
    ["Nome do site", "URL", "Objetivo", "Status", "Referencia do cofre", "Tipo de API", "Ultima auditoria", "Proxima acao", "Acoes"],
    sites.map((site) => [
      esc(site.name),
      `<a href="${esc(site.url)}" target="_blank" rel="noreferrer">${esc(site.url)}</a>`,
      esc(site.objective),
      statusChip(site.status),
      esc(site.vault_reference),
      esc(site.api_type),
      esc(formatDate(site.last_audit)),
      esc(site.next_action),
      rowActions([
        miniButton("auditSite", site.id, "Auditar"),
        miniButton("deleteSite", site.id, "Excluir", "reject")
      ])
    ])
  );
}

function renderSocial() {
  const socials = filtered(state.socials);
  qs("#socialGrid").innerHTML = socials.length ? socials.map((item) => `
    <article class="matrix-item">
      <div>
        <h4>${esc(item.channel)}</h4>
        <p class="muted">${esc(siteName(item.site_id))} - ${esc(item.handle || "sem perfil")}</p>
      </div>
      <div>${statusChip(item.status)}</div>
      <div class="metric-pair">
        <div><strong>${esc(item.posts_per_month)}</strong><span>posts/mes</span></div>
        <div><strong>${esc(item.clicks)}</strong><span>cliques</span></div>
      </div>
      <p class="muted">${esc(item.cadence || "Sem cadencia")} - crescimento ${esc(item.growth)}%</p>
      <p class="muted">Buffer: ${esc(item.buffer_channel_id || "nao mapeado")}</p>
      <p class="muted">${esc(item.next_action || "Sem proxima acao")}</p>
      <div class="row-actions">
        ${item.profile_url ? `<a class="mini-btn" href="${esc(item.profile_url)}" target="_blank" rel="noreferrer">Abrir</a>` : ""}
        ${miniButton("deleteRecord", item.id, "Excluir", "reject", "socials")}
      </div>
    </article>
  `).join("") : emptyState("Nenhuma rede encontrada para o filtro atual.");
}

function renderAutomations() {
  const automations = filtered(state.automations);
  qs("#automationTable").innerHTML = tableMarkup(
    ["Automacao", "Agenda", "Dono", "Risco", "Status", "Ultima execucao", "Proxima acao", "Acoes"],
    automations.map((item) => [
      cellTitle(item.name, `${siteName(item.site_id)} - ${item.output || "sem saida definida"}`),
      esc(item.schedule),
      esc(item.owner),
      riskChip(item.risk),
      statusChip(item.status),
      esc(formatDate(item.last_run)),
      esc(item.next_action),
      rowActions([
        miniButton("toggleAutomation", item.id, item.status === "ativa" ? "Pausar" : "Ativar"),
        miniButton("runAutomation", item.id, "Rodar"),
        miniButton("deleteRecord", item.id, "Excluir", "reject", "automations")
      ])
    ])
  );
}

function renderContent() {
  const items = filtered(state.content);
  qs("#contentBoard").innerHTML = columns.map((column) => {
    const columnItems = items.filter((item) => item.status === column);
    return `
      <section class="kanban-column">
        <h4>${esc(column)} (${columnItems.length})</h4>
        ${columnItems.map((item) => `
          <article class="content-item" data-risk="${esc(item.risk)}">
            <h5>${esc(item.title)}</h5>
            <p>${esc(siteName(item.site_id))} - ${esc(item.channel || "sem canal")} - vence ${esc(formatShortDate(item.due_date))}</p>
            ${item.body ? `<p>${esc(item.body.slice(0, 180))}${item.body.length > 180 ? "..." : ""}</p>` : ""}
            ${item.asset_url ? `<p><a href="${esc(item.asset_url)}" target="_blank" rel="noreferrer">Midia</a></p>` : ""}
            <p>${esc(item.next_action || "Sem proxima acao")}</p>
            ${item.published_url ? `<p><a href="${esc(item.published_url)}" target="_blank" rel="noreferrer">Publicado</a></p>` : ""}
            <div class="row-actions">
              ${riskChip(item.risk)}
              ${nextContentButton(item)}
              ${item.status === "Aprovacao" ? miniButton("rejectContent", item.id, "Rejeitar", "reject") : ""}
              ${miniButton("deleteRecord", item.id, "Excluir", "reject", "content")}
            </div>
          </article>
        `).join("") || `<p class="muted">Sem itens.</p>`}
      </section>
    `;
  }).join("");
}

function nextContentButton(item) {
  if (item.status === "Rascunho") return miniButton("advanceContent", item.id, "Enviar para revisao");
  if (item.status === "Aprovacao") return miniButton("advanceContent", item.id, "Aprovar e criar fila", "approve");
  return "";
}

function renderDistribution() {
  const tasks = filtered(state.distribution);
  qs("#distributionTable").innerHTML = tableMarkup(
    ["Conteudo", "Site", "Destino", "Status", "Buffer", "Agendamento", "UTM", "Publicado", "Observacao", "Acoes"],
    tasks.map((item) => [
      esc(contentTitle(item.content_id)),
      esc(siteName(item.site_id)),
      esc(item.target),
      statusChip(item.status),
      cellTitle(item.buffer_channel_id || "Sem canal", item.buffer_post_id || item.error_message || "aguardando envio"),
      esc(formatDate(item.scheduled_for)),
      item.utm_url ? `<a href="${esc(item.utm_url)}" target="_blank" rel="noreferrer">Abrir UTM</a>` : esc("Pendente"),
      item.published_url ? `<a href="${esc(item.published_url)}" target="_blank" rel="noreferrer">Link</a>` : esc(formatDate(item.published_at)),
      esc(item.note),
      rowActions([
        item.status === "erro" ? miniButton("retryDistribution", item.id, "Reenviar", "approve") : "",
        miniButton("deleteRecord", item.id, "Excluir", "reject", "distribution")
      ])
    ])
  );
}

function renderKoins() {
  const prizes = filtered(state.prizes);
  const koins = currentKoinTotals();
  const coinKpis = [
    { label: "Koins emitidos", value: koins.issued.toLocaleString("pt-BR"), hint: "ultima metrica por site" },
    { label: "Koins resgatados", value: koins.redeemed.toLocaleString("pt-BR"), hint: "premios pagos" },
    { label: "Resgates pendentes", value: koins.pendingRedemptions, hint: "requerem acompanhamento" },
    { label: "Alertas antifraude", value: koins.fraudAlerts, hint: "fila de revisao" },
    { label: "Premios criticos", value: prizes.filter((item) => item.status === "critico").length, hint: "estoque muito baixo" }
  ];
  qs("#coinStats").innerHTML = coinKpis.map((item) => `
    <article class="kpi">
      <span>${esc(item.label)}</span>
      <strong>${esc(item.value)}</strong>
      <small>${esc(item.hint)}</small>
    </article>
  `).join("");
  qs("#prizeTable").innerHTML = tableMarkup(
    ["Premio", "Projeto", "Custo", "Estoque", "Resgates", "Status", "Acoes"],
    prizes.map((item) => [
      esc(item.name),
      esc(siteName(item.site_id)),
      `${item.cost.toLocaleString("pt-BR")} Koins`,
      esc(item.stock),
      esc(item.redemptions),
      statusChip(item.status),
      rowActions([miniButton("deleteRecord", item.id, "Excluir", "reject", "prizes")])
    ])
  );
}

function renderApprovals() {
  const approvals = filtered(state.approvals);
  qs("#approvalList").innerHTML = approvals.length ? approvals.map((item) => `
    <article class="approval-row">
      <div>
        <h5>${esc(item.title)}</h5>
        <p>${esc(siteName(item.site_id))} - ${esc(item.type || "sem tipo")} - ${esc(item.detail)}</p>
      </div>
      <div class="row-actions">
        ${riskChip(item.risk)}
        ${statusChip(item.status)}
        ${item.status === "pendente" ? `
          <button class="mini-btn approve" data-action="setApproval" data-id="${esc(item.id)}" data-status="aprovado">Aprovar</button>
          <button class="mini-btn reject" data-action="setApproval" data-id="${esc(item.id)}" data-status="rejeitado">Rejeitar</button>
        ` : ""}
        ${miniButton("deleteRecord", item.id, "Excluir", "reject", "approvals")}
      </div>
    </article>
  `).join("") : emptyState("Nenhuma aprovacao encontrada para o filtro atual.");
}

function renderSupport() {
  const messages = filtered(state.supportMessages);
  qs("#supportList").innerHTML = messages.length ? messages.map((item) => `
    <article class="approval-row">
      <div>
        <h5>${esc(item.category)} - ${esc(item.author || item.source || "sem autor")}</h5>
        <p>${esc(siteName(item.site_id))} - ${esc(item.source || "sem origem")}</p>
        <p>${esc(item.message)}</p>
        ${item.suggested_reply ? `<div class="reply-box">${esc(item.suggested_reply)}</div>` : ""}
      </div>
      <div class="row-actions">
        ${riskChip(item.risk)}
        ${statusChip(item.status)}
        ${!item.suggested_reply ? miniButton("suggestReply", item.id, "Sugerir") : ""}
        ${item.status !== "respondido" ? miniButton("markResponded", item.id, "Respondido", "approve") : ""}
        ${miniButton("supportToFaq", item.id, "FAQ") }
        ${miniButton("deleteRecord", item.id, "Excluir", "reject", "supportMessages")}
      </div>
    </article>
  `).join("") : emptyState("Nenhuma mensagem de suporte encontrada.");
}

function renderFaq() {
  const entries = filtered(state.faqEntries);
  qs("#faqTable").innerHTML = tableMarkup(
    ["Pergunta", "Site", "Tema", "Resposta", "Status", "Acoes"],
    entries.map((item) => [
      esc(item.question),
      esc(siteName(item.site_id)),
      esc(item.topic),
      esc(item.answer),
      statusChip(item.status),
      rowActions([
        item.status !== "publicado" ? miniButton("publishFaq", item.id, "Publicar", "approve") : "",
        miniButton("deleteRecord", item.id, "Excluir", "reject", "faqEntries")
      ])
    ])
  );
}

function reportSeries() {
  const byDay = new Map();
  filtered(state.reports).forEach((item) => {
    const key = item.report_date || todayValue();
    const current = byDay.get(key) || { report_date: key, traffic: 0, posts: 0, signups: 0 };
    current.traffic += item.traffic;
    current.posts += item.posts;
    current.signups += item.signups;
    byDay.set(key, current);
  });
  const series = [...byDay.values()].sort((a, b) => new Date(a.report_date) - new Date(b.report_date)).slice(-7);
  if (series.length) return series;
  return ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"].map((day) => ({ label: day, traffic: 0, posts: 0, signups: 0 }));
}

function renderReports() {
  const series = reportSeries();
  const maxTotal = Math.max(1, ...series.map((item) => item.traffic + item.posts + item.signups));
  qs("#tractionChart").innerHTML = series.map((item) => {
    const traffic = Math.round(item.traffic / maxTotal * 100);
    const posts = Math.round(item.posts / maxTotal * 100);
    const signups = Math.round(item.signups / maxTotal * 100);
    return `
      <div class="line-bar">
        <div class="line-stack" title="${esc(item.report_date || item.label)}">
          <em style="height:${signups}%"></em>
          <i style="height:${posts}%"></i>
          <b style="height:${traffic}%"></b>
        </div>
        <span>${esc(item.label || formatShortDate(item.report_date))}</span>
      </div>
    `;
  }).join("");
  const last = state.auditLog.at(-1);
  qs("#lastAuditLabel").textContent = last ? last.date : "Sem auditoria";
  const totals = currentReportTotals();
  const summary = [
    `${state.sites.length} sites cadastrados no inventario principal.`,
    `${filtered(state.socials).length} redes acompanhadas no filtro atual.`,
    `${filtered(state.content).filter((item) => item.status !== "Publicado").length} conteudos em producao.`,
    `${totals.signups} cadastros registrados em relatorios.`,
    last ? last.summary : "Nenhuma auditoria registrada."
  ];
  qs("#executiveSummary").innerHTML = summary.map((item) => `<article class="action-row"><p>${esc(item)}</p>${statusChip("info")}</article>`).join("");
}

function renderSettings() {
  qs("#rulesList").innerHTML = state.rules.length ? filtered(state.rules).map((rule) => `
    <article class="rule-row">
      <div>
        <h5>${esc(rule.title)}</h5>
        <p>${esc(rule.category)} - ${esc(rule.detail)}</p>
      </div>
      <div class="row-actions">
        ${statusChip(rule.status)}
        ${miniButton("deleteRecord", rule.id, "Excluir", "reject", "rules")}
      </div>
    </article>
  `).join("") : emptyState("Nenhuma regra cadastrada.");
  qs("#vaultList").innerHTML = state.sites.length ? state.sites.map((site) => `
    <article class="vault-row">
      <div>
        <h5>${esc(site.name)}</h5>
        <p>${esc(site.vault_reference)} - ${esc(site.api_type)}</p>
      </div>
      ${statusChip(site.status)}
    </article>
  `).join("") : emptyState("Nenhuma referencia de cofre cadastrada.");
}

function tableMarkup(headers, rows) {
  if (!rows.length) return emptyState("Nenhum item encontrado para o filtro atual.");
  return `
    <table>
      <thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `;
}

function cellTitle(title, subtitle) {
  return `<div class="cell-title"><strong>${esc(title)}</strong><span>${esc(subtitle)}</span></div>`;
}

function rowActions(buttons) {
  return `<div class="row-actions">${buttons.join("")}</div>`;
}

function miniButton(action, id, label, className = "", collection = "") {
  return `<button class="mini-btn ${esc(className)}" data-action="${esc(action)}" data-id="${esc(id)}" ${collection ? `data-collection="${esc(collection)}"` : ""}>${esc(label)}</button>`;
}

function emptyState(message) {
  return `
    <div class="panel">
      <p class="muted">${esc(message)}</p>
      <p class="muted">Use o formulario desta aba para criar o primeiro registro.</p>
    </div>
  `;
}

function switchView(view) {
  currentView = view;
  qsa(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  qsa(".view").forEach((section) => section.classList.toggle("active", section.id === view));
  qs("#viewTitle").textContent = titles[view] || "Dashboard";
}

function toast(message) {
  const node = qs("#toast");
  node.textContent = message;
  node.classList.add("show");
  window.clearTimeout(toast.timeout);
  toast.timeout = window.setTimeout(() => node.classList.remove("show"), 2600);
}

function formString(data, name, fallback = "") {
  return String(data.get(name) || fallback).trim();
}

function formNumber(data, name) {
  return Number(data.get(name) || 0);
}

function formDateTime(data, name) {
  const value = formString(data, name);
  return value ? new Date(value).toISOString() : null;
}

function requireSite(data) {
  const siteId = formString(data, "site_id");
  if (!siteId) throw new Error("Cadastre e selecione um site primeiro.");
  return siteId;
}

async function addCollectionRecord(form, collection, payloadFactory, successLabel) {
  const data = new FormData(form);
  try {
    const payload = payloadFactory(data);
    const created = await createRecord(collection, payload);
    state[collection] = [created, ...state[collection].filter((item) => item.id !== created.id)];
    saveState();
    form.reset();
    render();
    toast(syncMode === "supabase" ? `${successLabel} salvo no Supabase.` : `${successLabel} salvo no modo local.`);
  } catch (error) {
    toast(error.message);
  }
}

async function addSite(form) {
  const data = new FormData(form);
  const site = {
    name: formString(data, "name"),
    url: formString(data, "url"),
    objective: formString(data, "objective"),
    status: formString(data, "status", "ativo"),
    vault_reference: formString(data, "vault_reference"),
    api_type: formString(data, "api_type"),
    next_action: formString(data, "next_action")
  };

  try {
    const created = await createSite(site);
    state.sites = [created, ...state.sites.filter((item) => item.id !== created.id)];
    saveState();
    form.reset();
    filters.siteId = created.id;
    render();
    qs("#siteFilter").value = created.id;
    toast(syncMode === "supabase" ? "Site salvo no Supabase." : "Site salvo no modo local.");
  } catch (error) {
    toast(`Nao foi possivel salvar: ${error.message}`);
  }
}

function socialPayload(data) {
  return {
    site_id: requireSite(data),
    channel: formString(data, "channel"),
    handle: formString(data, "handle"),
    profile_url: formString(data, "profile_url"),
    buffer_channel_id: cleanBufferChannelId(formString(data, "buffer_channel_id")),
    cadence: formString(data, "cadence"),
    posts_per_month: formNumber(data, "posts_per_month"),
    clicks: formNumber(data, "clicks"),
    growth: formNumber(data, "growth"),
    status: formString(data, "status", "ativo"),
    next_action: formString(data, "next_action")
  };
}

function automationPayload(data) {
  return {
    site_id: requireSite(data),
    name: formString(data, "name"),
    schedule: formString(data, "schedule"),
    owner: formString(data, "owner", "Codex"),
    output: formString(data, "output"),
    risk: formString(data, "risk", "baixo"),
    status: formString(data, "status", "ativa"),
    next_action: formString(data, "next_action")
  };
}

function contentPayload(data) {
  return {
    site_id: requireSite(data),
    title: formString(data, "title"),
    channel: formString(data, "channel"),
    body: formString(data, "body"),
    asset_url: formString(data, "asset_url"),
    status: formString(data, "status", "Rascunho"),
    risk: formString(data, "risk", "baixo"),
    due_date: formString(data, "due_date") || null,
    next_action: formString(data, "next_action")
  };
}

function distributionPayload(data) {
  const publishedUrl = formString(data, "published_url");
  const utmSource = formString(data, "utm_source");
  const utmMedium = formString(data, "utm_medium");
  const utmCampaign = formString(data, "utm_campaign");
  return {
    site_id: requireSite(data),
    content_id: formString(data, "content_id") || null,
    target: formString(data, "target"),
    buffer_channel_id: cleanBufferChannelId(formString(data, "buffer_channel_id")),
    status: formString(data, "status", "fila"),
    scheduled_for: formDateTime(data, "scheduled_for"),
    published_at: formString(data, "status") === "publicado" ? new Date().toISOString() : null,
    published_url: publishedUrl,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_url: buildUtmUrl(publishedUrl, utmSource, utmMedium, utmCampaign),
    note: formString(data, "note")
  };
}

function socialUtmSource(channel) {
  return String(channel || "social")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "social";
}

function contentTargetChannels(content) {
  const raw = String(content.channel || "").trim();
  if (!raw || /^(todas|todos|all|social|multicanal)$/i.test(raw)) return [];
  return raw
    .split(/[,;/|]+/)
    .map((item) => socialUtmSource(item))
    .filter(Boolean);
}

function contentMatchesSocial(content, social) {
  const targets = contentTargetChannels(content);
  return !targets.length || targets.includes(socialUtmSource(social.channel));
}

function campaignNameFor(content) {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${socialUtmSource(siteName(content.site_id))}_${date.getFullYear()}_${month}`;
}

async function createDistributionQueueForContent(content) {
  const targets = state.socials.filter((social) =>
    social.site_id === content.site_id &&
    social.status === "ativo" &&
    cleanBufferChannelId(social.buffer_channel_id) &&
    contentMatchesSocial(content, social)
  );
  const createdItems = [];

  for (const target of targets) {
    const alreadyQueued = state.distribution.some((task) =>
      task.content_id === content.id &&
      cleanBufferChannelId(task.buffer_channel_id) === cleanBufferChannelId(target.buffer_channel_id) &&
      task.status !== "erro"
    );
    if (alreadyQueued) continue;

    const publishedUrl = content.published_url || "";
    const utmSource = socialUtmSource(target.channel);
    const created = await createRecord("distribution", {
      site_id: content.site_id,
      content_id: content.id,
      target: target.channel,
      buffer_channel_id: cleanBufferChannelId(target.buffer_channel_id),
      status: "fila",
      scheduled_for: content.scheduled_for || null,
      published_at: null,
      published_url: publishedUrl,
      utm_source: utmSource,
      utm_medium: "social",
      utm_campaign: campaignNameFor(content),
      utm_url: buildUtmUrl(publishedUrl, utmSource, "social", campaignNameFor(content)),
      note: `Gerado automaticamente apos aprovacao. Perfil: ${target.handle || target.channel}`
    });
    state.distribution = [created, ...state.distribution.filter((item) => item.id !== created.id)];
    createdItems.push(created);
  }

  return createdItems;
}

function koinMetricPayload(data) {
  return {
    site_id: requireSite(data),
    issued: formNumber(data, "issued"),
    redeemed: formNumber(data, "redeemed"),
    pending_redemptions: formNumber(data, "pending_redemptions"),
    fraud_alerts: formNumber(data, "fraud_alerts"),
    measured_at: new Date().toISOString()
  };
}

function prizePayload(data) {
  return {
    site_id: requireSite(data),
    name: formString(data, "name"),
    cost: formNumber(data, "cost"),
    stock: formNumber(data, "stock"),
    redemptions: formNumber(data, "redemptions"),
    status: formString(data, "status", "ok")
  };
}

function approvalPayload(data) {
  return {
    site_id: requireSite(data),
    title: formString(data, "title"),
    type: formString(data, "type"),
    detail: formString(data, "detail"),
    risk: formString(data, "risk", "medio"),
    status: "pendente"
  };
}

function suggestedReplyFor(category, message) {
  const cleanMessage = message ? ` Sobre sua mensagem: "${message.slice(0, 120)}"` : "";
  const templates = {
    duvida: `Oi! Obrigado por chamar. Vamos te orientar com clareza.${cleanMessage} Se a duvida for sobre Koins ou premios, confira tambem as regras dentro da sua conta.`,
    elogio: "Muito obrigado pelo retorno! Ficamos felizes em saber que a experiencia esta ajudando. Vamos continuar melhorando.",
    reclamacao: "Obrigado por avisar. Vamos analisar o caso com cuidado e retornar com uma posicao. Para seguranca, nao envie senha ou dados sensiveis por aqui.",
    premio: "Obrigado por falar sobre o premio. Vamos conferir o status do resgate e as regras aplicaveis antes de confirmar qualquer prazo.",
    bug: "Obrigado pelo aviso. Vamos registrar o problema e verificar o fluxo. Se puder, envie horario aproximado e o passo em que ocorreu.",
    fraude: "Obrigado pelo alerta. Esse caso precisa de revisao manual por seguranca. Vamos encaminhar para analise antes de qualquer acao.",
    parceria: "Obrigado pelo interesse. Vamos revisar a proposta e retornar caso exista encaixe com nossos criterios de parceria."
  };
  return templates[category] || templates.duvida;
}

function supportPayload(data) {
  const category = formString(data, "category", "duvida");
  const risk = formString(data, "risk", "baixo");
  const message = formString(data, "message");
  const suggested = formString(data, "suggested_reply") || suggestedReplyFor(category, message);
  return {
    site_id: requireSite(data),
    source: formString(data, "source"),
    author: formString(data, "author"),
    message,
    category,
    risk,
    status: risk === "alto" || ["reclamacao", "premio", "fraude"].includes(category) ? "aprovacao" : "sugerido",
    suggested_reply: suggested,
    final_reply: ""
  };
}

function faqPayload(data) {
  return {
    site_id: requireSite(data),
    topic: formString(data, "topic"),
    question: formString(data, "question"),
    answer: formString(data, "answer"),
    status: formString(data, "status", "rascunho")
  };
}

function reportPayload(data) {
  return {
    site_id: requireSite(data),
    report_date: formString(data, "report_date") || todayValue(),
    traffic: formNumber(data, "traffic"),
    posts: formNumber(data, "posts"),
    signups: formNumber(data, "signups")
  };
}

function rulePayload(data) {
  return {
    category: formString(data, "category", "operacao"),
    title: formString(data, "title"),
    detail: formString(data, "detail"),
    status: "ativa"
  };
}

async function auditSite(id) {
  const stamp = new Date().toISOString();
  try {
    await updateSite(id, { last_audit: stamp });
    state.auditLog.push({
      date: formatDate(stamp),
      summary: `Auditoria registrada para ${siteName(id)}.`
    });
    saveState();
    render();
    toast("Ultima auditoria atualizada.");
  } catch (error) {
    toast(`Nao foi possivel auditar: ${error.message}`);
  }
}

async function runAudit() {
  const stamp = new Date().toISOString();
  try {
    await Promise.all(filtered(state.sites).map((site) => updateSite(site.id, { last_audit: stamp })));
    state.auditLog.push({
      date: formatDate(stamp),
      summary: "Auditoria registrada nos sites do filtro atual."
    });
    saveState();
    render();
    toast("Auditoria registrada.");
  } catch (error) {
    toast(`Auditoria falhou: ${error.message}`);
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "koinops-dashboard.json";
  link.click();
  URL.revokeObjectURL(url);
  toast("JSON exportado.");
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(reader.result);
      if (!Array.isArray(incoming.sites)) throw new Error("Arquivo invalido");
      state = normalizeState(incoming);
      saveState();
      filters.siteId = "all";
      render();
      toast("JSON importado no modo local.");
    } catch {
      toast("Nao foi possivel importar esse JSON.");
    }
  };
  reader.readAsText(file);
}

document.addEventListener("click", async (event) => {
  const navButton = event.target.closest(".nav-item");
  if (navButton) {
    switchView(navButton.dataset.view);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;

  const { action, id, status, collection } = actionButton.dataset;
  try {
    if (action === "auditSite") {
      await auditSite(id);
    }
    if (action === "deleteSite") {
      await deleteSite(id);
      saveState();
      filters.siteId = "all";
      render();
      toast("Site excluido.");
    }
    if (action === "deleteRecord") {
      await deleteRecord(collection, id);
      saveState();
      render();
      toast("Registro excluido.");
    }
    if (action === "toggleAutomation") {
      const automation = state.automations.find((item) => item.id === id);
      const nextStatus = automation.status === "ativa" ? "pausada" : "ativa";
      await updateRecord("automations", id, { status: nextStatus });
      saveState();
      render();
      toast("Automacao atualizada.");
    }
    if (action === "runAutomation") {
      await updateRecord("automations", id, { last_run: new Date().toISOString(), status: "ativa" });
      saveState();
      render();
      toast("Execucao registrada.");
    }
    if (action === "advanceContent") {
      const content = state.content.find((item) => item.id === id);
      const next = content.status === "Rascunho"
        ? "Aprovacao"
        : content.status === "Aprovacao"
          ? "Agendado"
          : content.status;
      const patch = { status: next };
      if (next === "Agendado") patch.approved_at = new Date().toISOString();
      await updateRecord("content", id, patch);
      const queued = next === "Agendado" ? await createDistributionQueueForContent({ ...content, ...patch }) : [];
      saveState();
      render();
      const message = next === "Agendado"
        ? queued.length
          ? `Conteudo aprovado: ${queued.length} tarefas criadas para Buffer.`
          : "Conteudo aprovado, mas nenhuma nova tarefa Buffer foi criada."
        : "Conteudo avancou na esteira.";
      toast(message);
    }
    if (action === "rejectContent") {
      await updateRecord("content", id, {
        status: "Rascunho",
        next_action: "Revisar conteudo rejeitado"
      });
      saveState();
      render();
      toast("Conteudo voltou para revisao.");
    }
    if (action === "retryDistribution") {
      await updateRecord("distribution", id, {
        status: "fila",
        buffer_post_id: null,
        error_message: null
      });
      saveState();
      render();
      toast("Tarefa recolocada na fila do Buffer.");
    }
    if (action === "suggestReply") {
      const message = state.supportMessages.find((item) => item.id === id);
      await updateRecord("supportMessages", id, {
        status: message.risk === "alto" ? "aprovacao" : "sugerido",
        suggested_reply: suggestedReplyFor(message.category, message.message)
      });
      saveState();
      render();
      toast("Resposta sugerida.");
    }
    if (action === "markResponded") {
      const message = state.supportMessages.find((item) => item.id === id);
      await updateRecord("supportMessages", id, {
        status: "respondido",
        final_reply: message.suggested_reply || message.final_reply
      });
      saveState();
      render();
      toast("Mensagem marcada como respondida.");
    }
    if (action === "supportToFaq") {
      const message = state.supportMessages.find((item) => item.id === id);
      const created = await createRecord("faqEntries", {
        site_id: message.site_id,
        topic: message.category,
        question: message.message,
        answer: message.suggested_reply || suggestedReplyFor(message.category, message.message),
        status: "rascunho"
      });
      state.faqEntries = [created, ...state.faqEntries.filter((item) => item.id !== created.id)];
      saveState();
      render();
      toast("FAQ criada como rascunho.");
    }
    if (action === "publishFaq") {
      await updateRecord("faqEntries", id, { status: "publicado" });
      saveState();
      render();
      toast("FAQ marcada como publicada.");
    }
    if (action === "setApproval") {
      await updateRecord("approvals", id, { status, decided_at: new Date().toISOString() });
      saveState();
      render();
      toast(`Item ${status}.`);
    }
  } catch (error) {
    toast(error.message);
  }
});

qs("#siteForm").addEventListener("submit", (event) => {
  event.preventDefault();
  addSite(event.currentTarget);
});

qs("#socialForm").addEventListener("submit", (event) => {
  event.preventDefault();
  addCollectionRecord(event.currentTarget, "socials", socialPayload, "Rede");
});

qs("#automationForm").addEventListener("submit", (event) => {
  event.preventDefault();
  addCollectionRecord(event.currentTarget, "automations", automationPayload, "Automacao");
});

qs("#contentForm").addEventListener("submit", (event) => {
  event.preventDefault();
  addCollectionRecord(event.currentTarget, "content", contentPayload, "Conteudo");
});

qs("#distributionForm").addEventListener("submit", (event) => {
  event.preventDefault();
  addCollectionRecord(event.currentTarget, "distribution", distributionPayload, "Distribuicao");
});

qs("#koinMetricForm").addEventListener("submit", (event) => {
  event.preventDefault();
  addCollectionRecord(event.currentTarget, "koinMetrics", koinMetricPayload, "Metrica de Koins");
});

qs("#prizeForm").addEventListener("submit", (event) => {
  event.preventDefault();
  addCollectionRecord(event.currentTarget, "prizes", prizePayload, "Premio");
});

qs("#approvalForm").addEventListener("submit", (event) => {
  event.preventDefault();
  addCollectionRecord(event.currentTarget, "approvals", approvalPayload, "Aprovacao");
});

qs("#supportForm").addEventListener("submit", (event) => {
  event.preventDefault();
  addCollectionRecord(event.currentTarget, "supportMessages", supportPayload, "Mensagem");
});

qs("#faqForm").addEventListener("submit", (event) => {
  event.preventDefault();
  addCollectionRecord(event.currentTarget, "faqEntries", faqPayload, "FAQ");
});

qs("#reportForm").addEventListener("submit", (event) => {
  event.preventDefault();
  addCollectionRecord(event.currentTarget, "reports", reportPayload, "Relatorio");
});

qs("#ruleForm").addEventListener("submit", (event) => {
  event.preventDefault();
  addCollectionRecord(event.currentTarget, "rules", rulePayload, "Regra");
});

qs("#searchInput").addEventListener("input", (event) => {
  filters.search = event.target.value;
  render();
});

qs("#siteFilter").addEventListener("change", (event) => {
  filters.siteId = event.target.value;
  render();
});

qs("#runAuditBtn").addEventListener("click", runAudit);
qs("#syncBtn").addEventListener("click", () => syncAllFromSupabase(true));
qs("#exportBtn").addEventListener("click", exportJson);
qs("#importBtn").addEventListener("click", () => qs("#importFile").click());
qs("#importFile").addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) importJson(file);
  event.target.value = "";
});
qs("#resetBtn").addEventListener("click", () => {
  state = clone(seedData);
  filters = { siteId: "all", search: "" };
  qs("#searchInput").value = "";
  saveState();
  render();
  toast("Cache local limpo.");
});
qs("#addSiteQuickBtn").addEventListener("click", () => {
  switchView("sites");
  qs("#siteForm input[name='name']").focus();
});

render();
syncAllFromSupabase(false);
