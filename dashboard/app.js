const STORAGE_KEY = "koinops-dashboard-v1";

const seedData = {
  sites: [],
  socials: [],
  automations: [],
  content: [],
  prizes: [],
  approvals: [],
  koins: {
    issued: 0,
    redeemed: 0,
    pendingRedemptions: 0,
    fraudAlerts: 0
  },
  reports: [
    { day: "Seg", traffic: 0, posts: 0, signups: 0 },
    { day: "Ter", traffic: 0, posts: 0, signups: 0 },
    { day: "Qua", traffic: 0, posts: 0, signups: 0 },
    { day: "Qui", traffic: 0, posts: 0, signups: 0 },
    { day: "Sex", traffic: 0, posts: 0, signups: 0 },
    { day: "Sab", traffic: 0, posts: 0, signups: 0 },
    { day: "Dom", traffic: 0, posts: 0, signups: 0 }
  ],
  rules: [
    { title: "Pode rodar sozinho", detail: "Auditoria, rascunhos, UTMs, relatorios, alertas e publicacao de conteudo ja aprovado." },
    { title: "Exige aprovacao humana", detail: "Alterar saldo de Koins, negar premio, bloquear usuario, mudar termos ou responder reclamacao sensivel." },
    { title: "Credenciais", detail: "Guardar somente referencia ao cofre. Nunca salvar senha ou token aberto no dashboard." },
    { title: "Publicacao", detail: "Promessas sobre premios, ganhos e prazos entram na fila de aprovacao." }
  ],
  auditLog: []
};

let state = loadState();
let currentView = "overview";
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
  reports: "Relatorios",
  settings: "Governanca"
};

const columns = ["Rascunho", "Aprovacao", "Agendado", "Publicado"];

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return clone(seedData);
  try {
    const parsed = JSON.parse(saved);
    const hasLegacyExamples = parsed.sites?.some((site) => [
      "koin-research",
      "koin-partners",
      "premios-zone",
      "survey-lab",
      "koin-help"
    ].includes(site.id));
    if (hasLegacyExamples) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seedData));
      return clone(seedData);
    }
    return parsed;
  } catch {
    return clone(seedData);
  }
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

function siteName(siteId) {
  if (siteId === "all") return "Todos";
  return state.sites.find((site) => site.id === siteId)?.name || siteId;
}

function statusChip(status) {
  const normalized = String(status).toLowerCase();
  const type = normalized.includes("online") || normalized.includes("ativa") || normalized.includes("aprovado") || normalized.includes("ok")
    ? "ok"
    : normalized.includes("pendente") || normalized.includes("atencao") || normalized.includes("pausada") || normalized.includes("baixo")
      ? "warn"
      : normalized.includes("alto") || normalized.includes("critico") || normalized.includes("risco")
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
  return filters.siteId === "all" || item.siteId === filters.siteId || item.id === filters.siteId;
}

function filtered(items) {
  return items.filter((item) => matchesSite(item) && matchesSearch(item));
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function render() {
  renderSiteFilter();
  renderKpis();
  renderNextActions();
  renderFunnel();
  renderSites();
  renderSocial();
  renderAutomations();
  renderContent();
  renderKoins();
  renderApprovals();
  renderReports();
  renderSettings();
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

function renderKpis() {
  const sites = filtered(state.sites);
  const approvals = filtered(state.approvals).filter((item) => item.status === "pendente");
  const automations = filtered(state.automations).filter((item) => item.status === "ativa");
  const prizeAlerts = filtered(state.prizes).filter((item) => item.status !== "ok");
  const kpis = [
    { label: "Sites online", value: sites.filter((site) => site.status === "online").length, hint: `${sites.length} monitorados` },
    { label: "Score medio", value: `${average(sites.map((site) => site.trustScore))}%`, hint: "confianca publica" },
    { label: "Aprovacoes", value: approvals.length, hint: "pendentes" },
    { label: "Automacoes", value: automations.length, hint: "ativas agora" },
    { label: "Alertas", value: prizeAlerts.length, hint: "premios/estoque" }
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
    title: site.nextAction,
    detail: `${site.name} - score ${site.trustScore}%`,
    risk: site.trustScore < 78 ? "medio" : "baixo"
  }));
  const approvalActions = filtered(state.approvals)
    .filter((item) => item.status === "pendente")
    .map((item) => ({
      title: item.title,
      detail: `${siteName(item.siteId)} - ${item.type}`,
      risk: item.risk
    }));
  const actions = [...approvalActions, ...siteActions].slice(0, 7);
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

function renderFunnel() {
  const values = [
    { label: "Cadastros", value: 0, max: 100, color: "green" },
    { label: "Pesquisas", value: 0, max: 100, color: "" },
    { label: "Koins", value: state.koins.issued, max: Math.max(100, state.koins.issued), color: "amber" },
    { label: "Resgates", value: state.koins.pendingRedemptions, max: 120, color: "" }
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
    ["Site", "Objetivo", "Plataforma/API", "Status", "Score", "Cofre", "Proxima acao"],
    sites.map((site) => [
      cellTitle(site.name, site.url),
      esc(site.objective),
      cellTitle(site.platform, site.api),
      statusChip(site.status),
      `<strong>${site.trustScore}%</strong><br><span class="muted">${site.uptime}% uptime</span>`,
      esc(site.vault),
      esc(site.nextAction)
    ])
  );
}

function renderSocial() {
  const socials = filtered(state.socials);
  qs("#socialGrid").innerHTML = socials.length ? socials.map((item) => `
    <article class="matrix-item">
      <div>
        <h4>${esc(item.channel)}</h4>
        <p class="muted">${esc(siteName(item.siteId))} - ${esc(item.handle)}</p>
      </div>
      <div>${statusChip(item.status)}</div>
      <div class="metric-pair">
        <div><strong>${esc(item.posts)}</strong><span>posts/mes</span></div>
        <div><strong>${esc(item.clicks)}</strong><span>cliques</span></div>
      </div>
      <p class="muted">${esc(item.cadence)} - crescimento ${esc(item.growth)}%</p>
    </article>
  `).join("") : emptyState("Nenhuma rede encontrada para o filtro atual.");
}

function renderAutomations() {
  const automations = filtered(state.automations);
  qs("#automationTable").innerHTML = tableMarkup(
    ["Automacao", "Agenda", "Dono", "Risco", "Status", "Ultima execucao", "Acoes"],
    automations.map((item) => [
      cellTitle(item.name, `${siteName(item.siteId)} - ${item.output}`),
      esc(item.schedule),
      esc(item.owner),
      riskChip(item.risk),
      statusChip(item.status),
      esc(item.lastRun),
      `<div class="row-actions">
        <button class="mini-btn" data-action="toggleAutomation" data-id="${esc(item.id)}">${item.status === "ativa" ? "Pausar" : "Ativar"}</button>
        <button class="mini-btn" data-action="runAutomation" data-id="${esc(item.id)}">Rodar</button>
      </div>`
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
            <p>${esc(siteName(item.siteId))} - ${esc(item.channel)} - vence ${esc(item.due)}</p>
            <div class="row-actions">
              ${riskChip(item.risk)}
              ${nextContentButton(item)}
            </div>
          </article>
        `).join("") || `<p class="muted">Sem itens.</p>`}
      </section>
    `;
  }).join("");
}

function nextContentButton(item) {
  const index = columns.indexOf(item.status);
  if (index < 0 || index === columns.length - 1) return "";
  const label = index === 1 ? "Aprovar" : "Avancar";
  return `<button class="mini-btn approve" data-action="advanceContent" data-id="${esc(item.id)}">${label}</button>`;
}

function renderKoins() {
  const prizes = filtered(state.prizes);
  const coinKpis = [
    { label: "Koins emitidos", value: state.koins.issued.toLocaleString("pt-BR"), hint: "total acumulado" },
    { label: "Koins resgatados", value: state.koins.redeemed.toLocaleString("pt-BR"), hint: "premios pagos" },
    { label: "Resgates pendentes", value: state.koins.pendingRedemptions, hint: "requerem acompanhamento" },
    { label: "Alertas antifraude", value: state.koins.fraudAlerts, hint: "fila de revisao" },
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
    ["Premio", "Projeto", "Custo", "Estoque", "Resgates", "Status"],
    prizes.map((item) => [
      esc(item.name),
      esc(siteName(item.siteId)),
      `${item.cost.toLocaleString("pt-BR")} Koins`,
      esc(item.stock),
      esc(item.redemptions),
      statusChip(item.status)
    ])
  );
}

function renderApprovals() {
  const approvals = filtered(state.approvals);
  qs("#approvalList").innerHTML = approvals.length ? approvals.map((item) => `
    <article class="approval-row">
      <div>
        <h5>${esc(item.title)}</h5>
        <p>${esc(siteName(item.siteId))} - ${esc(item.detail)}</p>
      </div>
      <div class="row-actions">
        ${riskChip(item.risk)}
        ${statusChip(item.status)}
        ${item.status === "pendente" ? `
          <button class="mini-btn approve" data-action="setApproval" data-id="${esc(item.id)}" data-status="aprovado">Aprovar</button>
          <button class="mini-btn reject" data-action="setApproval" data-id="${esc(item.id)}" data-status="rejeitado">Rejeitar</button>
        ` : ""}
      </div>
    </article>
  `).join("") : emptyState("Nenhuma aprovacao encontrada para o filtro atual.");
}

function renderReports() {
  const maxTotal = Math.max(1, ...state.reports.map((item) => item.traffic + item.posts + item.signups));
  qs("#tractionChart").innerHTML = state.reports.map((item) => {
    const traffic = Math.round(item.traffic / maxTotal * 100);
    const posts = Math.round(item.posts / maxTotal * 100);
    const signups = Math.round(item.signups / maxTotal * 100);
    return `
      <div class="line-bar">
        <div class="line-stack" title="${esc(item.day)}">
          <em style="height:${signups}%"></em>
          <i style="height:${posts}%"></i>
          <b style="height:${traffic}%"></b>
        </div>
        <span>${esc(item.day)}</span>
      </div>
    `;
  }).join("");
  const last = state.auditLog.at(-1);
  qs("#lastAuditLabel").textContent = last ? last.date : "Sem auditoria";
  const summary = [
    `Score medio de confianca: ${average(state.sites.map((site) => site.trustScore))}%.`,
    `${state.approvals.filter((item) => item.status === "pendente").length} aprovacoes pendentes.`,
    `${state.content.filter((item) => item.status !== "Publicado").length} conteudos em producao.`,
    `${state.prizes.filter((item) => item.status !== "ok").length} premios com atencao de estoque.`,
    last ? last.summary : "Nenhuma auditoria registrada."
  ];
  qs("#executiveSummary").innerHTML = summary.map((item) => `<article class="action-row"><p>${esc(item)}</p>${statusChip("info")}</article>`).join("");
}

function renderSettings() {
  qs("#rulesList").innerHTML = state.rules.map((rule) => `
    <article class="rule-row">
      <div>
        <h5>${esc(rule.title)}</h5>
        <p>${esc(rule.detail)}</p>
      </div>
      ${statusChip("regra")}
    </article>
  `).join("");
  qs("#vaultList").innerHTML = state.sites.map((site) => `
    <article class="vault-row">
      <div>
        <h5>${esc(site.name)}</h5>
        <p>${esc(site.vault)} - ${esc(site.api)}</p>
      </div>
      ${statusChip(site.status)}
    </article>
  `).join("");
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

function emptyState(message) {
  return `
    <div class="panel">
      <p class="muted">${esc(message)}</p>
      <p class="muted">Comece cadastrando um site na aba Sites ou importe um JSON exportado anteriormente.</p>
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
  toast.timeout = window.setTimeout(() => node.classList.remove("show"), 2400);
}

function addSite(form) {
  const data = new FormData(form);
  const name = data.get("name").trim();
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `site-${Date.now()}`;
  state.sites.push({
    id,
    name,
    url: data.get("url").trim(),
    platform: data.get("platform").trim(),
    objective: data.get("objective").trim(),
    audience: "Definir publico",
    status: "atencao",
    trustScore: 60,
    uptime: 0,
    vault: data.get("vault").trim(),
    api: "Definir API",
    lastAudit: "pendente",
    nextAction: "Completar checklist de confianca"
  });
  saveState();
  form.reset();
  filters.siteId = id;
  render();
  qs("#siteFilter").value = id;
  toast("Site adicionado ao dashboard.");
}

function runAudit() {
  const now = new Date();
  const stamp = now.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  state.sites = state.sites.map((site) => ({
    ...site,
    lastAudit: stamp,
    trustScore: Math.min(96, Math.max(58, site.trustScore + (site.status === "online" ? 1 : -1)))
  }));
  state.auditLog.push({
    date: stamp,
    summary: "Auditoria simulada concluida: sites atualizados, fila de aprovacao preservada e alertas recalculados."
  });
  saveState();
  render();
  toast("Auditoria simulada registrada.");
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
      state = incoming;
      saveState();
      filters.siteId = "all";
      render();
      toast("JSON importado com sucesso.");
    } catch {
      toast("Nao foi possivel importar esse JSON.");
    }
  };
  reader.readAsText(file);
}

document.addEventListener("click", (event) => {
  const navButton = event.target.closest(".nav-item");
  if (navButton) {
    switchView(navButton.dataset.view);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    const { action, id, status } = actionButton.dataset;
    if (action === "toggleAutomation") {
      const automation = state.automations.find((item) => item.id === id);
      automation.status = automation.status === "ativa" ? "pausada" : "ativa";
      saveState();
      render();
      toast("Automacao atualizada.");
    }
    if (action === "runAutomation") {
      const automation = state.automations.find((item) => item.id === id);
      automation.lastRun = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
      saveState();
      render();
      toast("Execucao simulada registrada.");
    }
    if (action === "advanceContent") {
      const content = state.content.find((item) => item.id === id);
      const next = columns[columns.indexOf(content.status) + 1];
      content.status = next || content.status;
      saveState();
      render();
      toast("Conteudo avancou na esteira.");
    }
    if (action === "setApproval") {
      const approval = state.approvals.find((item) => item.id === id);
      approval.status = status;
      saveState();
      render();
      toast(`Item ${status}.`);
    }
  }
});

qs("#siteForm").addEventListener("submit", (event) => {
  event.preventDefault();
  addSite(event.currentTarget);
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
  toast("Dashboard limpo.");
});
qs("#addSiteQuickBtn").addEventListener("click", () => {
  switchView("sites");
  qs("#siteForm input[name='name']").focus();
});

render();
