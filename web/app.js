import { columnChart, lineChart, cumulativeChart, sparkline } from "./charts.js";
import { mediaPages } from "./media.js";

// Hub de marketing: metade Dados (5 telas sobre o warehouse) e metade Midia
// (media.js), roteadas por hash. Cada tela busca uma rota da API e monta o
// HTML; numeros chegam crus e sao formatados aqui.

const API = window.HUB_API_BASE || "";
const main = document.getElementById("main");

// ---------------------------------------------------------------- estado

const store = {
  get(key, fallback) { try { return localStorage.getItem(`hub.${key}`) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`hub.${key}`, value); } catch { /* sem storage: so nao lembra */ } }
};
const state = {
  period: store.get("period", "semana"),
  brand: store.get("brand", "protege_facil"),
  channelFilter: { brand: "", channel: "", aboveTarget: false },
  reverseBrand: "",
  meta: null
};

async function api(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v !== null && v !== undefined));
  const res = await fetch(`${API}/api/${path}${qs.size ? `?${qs}` : ""}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

async function send(method, path, payload) {
  const res = await fetch(`${API}/api/${path}`, {
    method, headers: { "content-type": "application/json" }, body: payload === undefined ? undefined : JSON.stringify(payload)
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

// ---------------------------------------------------------------- formatos

const nf = (d = 0) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const DASH = "—";
const brl = (n, d = 0) => (n === null || n === undefined ? DASH : `R$ ${nf(d).format(n)}`);
const brlCents = (n) => brl(n, 2);
function brlShort(n) {
  if (n === null || n === undefined) return DASH;
  if (Math.abs(n) >= 1e6) return `R$ ${nf(1).format(n / 1e6)} mi`;
  if (Math.abs(n) >= 1e4) return `R$ ${nf(1).format(n / 1e3)} mil`;
  return brl(n);
}
const int = (n) => (n === null || n === undefined ? DASH : nf(0).format(n));
const pct = (n, d = 0) => (n === null || n === undefined ? DASH : `${nf(d).format(n * 100)}%`);
const roas = (n) => (n === null || n === undefined ? DASH : `${nf(2).format(n)}x`);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const dm = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : DASH);
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// "2026-10-27 06:04:00" -> "Hoje, 06:04" / "Ontem, 06:03" / "Seg 26/10, 06:03"
function when(ts, today = state.meta?.asOf) {
  if (!ts) return DASH;
  const day = ts.slice(0, 10);
  const hm = ts.slice(11, 16);
  if (day === today) return `Hoje, ${hm}`;
  if (today && day === addDays(today, -1)) return `Ontem, ${hm}`;
  return `${WD[new Date(`${day}T12:00:00Z`).getUTCDay()]} ${dm(day)}, ${hm}`;
}

// Delta com cor pela direcao boa de cada KPI (gasto e neutro).
function delta(change, good, suffix) {
  if (change === null || change === undefined || !Number.isFinite(change)) return `<div class="delta">${DASH}</div>`;
  const sign = change > 0 ? "+" : change < 0 ? "−" : "";
  const tone = good === 0 || Math.abs(change) < 0.005 ? "" : (change > 0) === (good > 0) ? "good" : "bad";
  return `<div class="delta ${tone}">${sign}${nf(0).format(Math.abs(change) * 100)}% ${esc(suffix)}</div>`;
}

// ---------------------------------------------------------------- pecas

function head({ eyebrow, title, sub, controls = "" }) {
  return `<header class="page-head">
    <div class="titles">
      <div class="mono eyebrow">${esc(eyebrow)}</div>
      <h1>${esc(title)}</h1>
      <div class="sub">${esc(sub)}</div>
    </div>${controls}</header>`;
}

const PERIOD_LABELS = { hoje: "Hoje", "24h": "Últimas 24h", semana: "Sexta a quinta", mes: "Mês" };
function periodSwitch() {
  return `<div class="segmented" role="group" aria-label="Período">${Object.entries(PERIOD_LABELS).map(([k, label]) =>
    `<button class="seg${state.period === k ? " on" : ""}" type="button" data-period="${k}" aria-pressed="${state.period === k}">${label}</button>`).join("")}</div>`;
}
function bindPeriod() {
  main.querySelectorAll("[data-period]").forEach((b) => b.addEventListener("click", () => {
    state.period = b.dataset.period;
    store.set("period", state.period);
    route();
  }));
}

function kpi(label, value, deltaHtml = "", { accent = false } = {}) {
  return `<div class="card kpi${accent ? " accent" : ""}"><div class="mono"${accent ? ' style="color:var(--accent)"' : ""}>${esc(label)}</div>
    <div class="value">${value}</div>${deltaHtml}</div>`;
}

function meter(value, { max = 1.2 } = {}) {
  if (value === null || value === undefined) return `<span class="faint">${DASH}</span>`;
  const cls = value > 1.1 ? " over" : value < 0.9 ? " under" : "";
  const icon = value > 1.1 ? "▲ " : value < 0.9 ? "▼ " : "";
  return `<div class="meter${cls}"><div class="track"><div class="fill" style="width:${Math.min(100, (value / max) * 100)}%"></div></div>
    <span class="lbl${value > 1.1 ? " bad" : value < 0.9 ? " warn" : ""}"${cls ? ' style="font-weight:600"' : ""}>${icon}${pct(value)}</span></div>`;
}

function cplCell(cpl, target, d = 2) {
  if (cpl === null || cpl === undefined) return `<td>${DASH}</td>`;
  const tone = target ? (cpl > target * 1.1 ? "bad" : cpl <= target ? "good" : "") : "";
  const title = target ? ` title="Meta de CPL: ${brlCents(target)}"` : "";
  return `<td class="${tone}"${title}>${brl(cpl, d)}</td>`;
}

function asTable(columns, rows) {
  return `<details class="as-table"><summary>Ver como tabela</summary><div class="table-wrap"><table>
    <thead><tr>${columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`;
}

function campaignName(c) {
  if (!c.naming_ok) return `<div class="camp off"><span class="raw">${esc(c.name)}</span> <span class="pill bad">fora do padrão</span></div>`;
  const parts = c.name.split("|").map((p) => p.trim());
  return `<div class="camp">${parts.map((p, i) => `${i ? '<span class="sep">|</span>' : ""}<span class="part">${esc(p)}</span>`).join("")}</div>`;
}

// ---------------------------------------------------------------- 1 visao do grupo

async function pageVisao() {
  const d = await api("overview", { period: state.period });
  const k = d.kpis;
  const s = d.period.compareLabel;
  const spendNote = d.spendThrough === null
    ? "Mídia paga do dia chega às 06h de amanhã; hoje só há leads e vendas."
    : d.spendThrough < d.period.end ? `Mídia paga até ${dm(d.spendThrough)}; CPL, CAC e ROAS usam só os dias completos.` : "";

  main.innerHTML = `
    ${head({ eyebrow: state.period === "semana" ? "Apresentação de sexta" : "Visão do grupo", title: "Visão do grupo", sub: d.period.label, controls: periodSwitch() })}
    <section class="grid-kpi">
      ${kpi("Investimento", brlShort(k.spend.value), delta(k.spend.change, 0, s))}
      ${kpi("Leads", int(k.leads.value), delta(k.leads.change, 1, s))}
      ${kpi("CPL", brlCents(k.cpl.value), delta(k.cpl.change, -1, s))}
      ${kpi("Vendas e conversões", int(k.conversions.value), delta(k.conversions.change, 1, s))}
      ${kpi("CAC", brl(k.cac.value), delta(k.cac.change, -1, s))}
      ${kpi("ROAS", roas(k.roas.value), `<div class="delta">${brlShort(k.revenue.value)} atribuídos</div>`, { accent: true })}
    </section>
    ${spendNote ? `<div class="note">${esc(spendNote)}</div>` : ""}
    <section class="row">
      <div class="card grow-2">
        <div class="card-head"><h2>Investimento e leads por dia</h2><span class="note">Últimos 28 dias · período em destaque</span></div>
        <div class="mono muted">Investimento (R$)</div>
        <div id="ch-spend"></div>
        <div class="mono muted">Leads</div>
        <div id="ch-leads"></div>
        ${asTable(["Dia", "Investimento", "Leads"], d.series.map((p) => [dm(p.date), brl(p.spend), int(p.leads)]))}
      </div>
      <div class="card grow-1">
        <h2>O que mudou desde o período anterior</h2>
        <div class="changes">${d.changes.length ? d.changes.map((c) => `<div><span class="icon ${c.tone}" aria-hidden="true">${c.icon}</span><span>${esc(c.text)}</span></div>`).join("") : '<div class="muted">Sem mudanças relevantes.</div>'}</div>
        <a href="#/previsao" style="margin-top:auto;font-weight:600;text-decoration:none;min-height:44px;display:flex;align-items:center">Ver previsão do mês →</a>
      </div>
    </section>
    <section class="card flush">
      <div class="card-head"><h2>Por marca</h2><span class="note">Pacing = projeção do mês ÷ orçamento</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Marca</th><th>Investimento</th><th>Leads</th><th>CPL</th><th>Vendas e conv.</th><th>CAC</th><th class="left" style="width:200px">Pacing do mês</th></tr></thead>
        <tbody>
          ${d.brands.map((b) => `<tr><td class="name">${esc(b.name)}</td><td>${brl(b.spend)}</td><td>${int(b.leads)}</td>${cplCell(b.cpl, b.cplTarget)}
            <td>${int(b.conversions)}</td><td>${brl(b.cac)}</td><td class="left">${meter(b.pacing)}</td></tr>`).join("")}
          <tr class="total"><td>Total do grupo</td><td>${brl(d.total.spend)}</td><td>${int(d.total.leads)}</td><td>${brlCents(d.total.cpl)}</td>
            <td>${int(d.total.conversions)}</td><td>${brl(d.total.cac)}</td><td class="left">${pct(d.total.pacing)}</td></tr>
        </tbody></table></div>
      <div class="note">Verde e vermelho comparam o CPL com a meta de cada marca no dicionário de KPIs.</div>
    </section>`;
  bindPeriod();
  const inPeriod = (p) => p.date >= d.period.start && p.date <= d.period.end;
  columnChart(document.getElementById("ch-spend"), d.series.map((p) => ({ label: dm(p.date), value: p.spend, date: p.date, tip: `${dm(p.date)}: ${brl(p.spend)}` })),
    { height: 140, format: (v) => brlShort(v).replace("R$ ", ""), highlight: (p) => inPeriod(p) });
  lineChart(document.getElementById("ch-leads"), d.series.map((p) => ({ label: dm(p.date), value: p.leads, tip: `${dm(p.date)}: ${int(p.leads)} leads` })),
    { height: 130, format: int });
}

// ---------------------------------------------------------------- 2 canal e campanha

async function pageCanais() {
  const f = state.channelFilter;
  const d = await api("channels", { period: state.period, brand: f.brand, channel: f.channel, above_target: f.aboveTarget ? "1" : "" });
  const brands = state.meta.brands;
  main.innerHTML = `
    ${head({ eyebrow: "Mídia paga", title: "Canal e campanha", sub: `${d.period.label.split(" · ")[0]} · Meta, Google Ads e TikTok numa só régua`, controls: periodSwitch() })}
    <section class="channel-cards">
      ${d.channels.map((c) => `<div class="card">
        <div class="mono muted">${esc(c.channel_name)}</div>
        <div class="big">${brl(c.spend)}</div>
        <div class="muted">${int(c.leads)} leads · CPL ${brlCents(c.cpl)}</div>
        <div class="share" title="${pct(c.share)} da verba"><div style="width:${(c.share || 0) * 100}%"></div></div>
        <div class="note">${pct(c.share)} da verba</div></div>`).join("")}
    </section>
    <section class="card flush">
      <div class="card-head">
        <div><h2>Campanhas</h2><div class="note">${d.counts.shown} com resultado de ${d.counts.total} cadastradas · ordenadas por investimento · nome no padrão ORB | Marca | Objetivo | Canal</div></div>
        <div class="filters">
          <select id="f-brand" aria-label="Marca"><option value="">Todas as marcas</option>${brands.map((b) => `<option value="${b.brand_id}"${f.brand === b.brand_id ? " selected" : ""}>${esc(b.short_name)}</option>`).join("")}</select>
          <select id="f-channel" aria-label="Canal"><option value="">Todos os canais</option>${d.channels.map((c) => `<option value="${c.channel_id}"${f.channel === c.channel_id ? " selected" : ""}>${esc(c.channel_name)}</option>`).join("")}</select>
          <label class="check"><input type="checkbox" id="f-above"${f.aboveTarget ? " checked" : ""}> Só CPL acima da meta</label>
        </div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Campanha</th><th>Investimento</th><th>CTR</th><th>CPC</th><th>Leads</th><th>CPL</th><th>7 dias</th></tr></thead>
        <tbody>${d.campaigns.length ? d.campaigns.map((c) => `<tr>
          <td class="left">${campaignName(c)}</td><td>${brl(c.spend)}</td><td>${pct(c.ctr, 1)}</td><td>${brlCents(c.cpc)}</td>
          <td>${int(c.leads)}</td>${cplCell(c.cpl, c.cplTarget)}<td>${sparkline(c.spark)}</td></tr>`).join("")
          : `<tr><td colspan="7" class="empty">Nenhuma campanha com esse filtro.</td></tr>`}</tbody>
      </table></div>
      <div class="note">Verde e vermelho comparam o CPL com a meta da marca. Leads atribuídos por último clique (gclid, fbclid, ttclid ou UTM). Linha de 7 dias = leads por dia.</div>
    </section>`;
  bindPeriod();
  const refresh = () => route();
  document.getElementById("f-brand").addEventListener("change", (e) => { f.brand = e.target.value; refresh(); });
  document.getElementById("f-channel").addEventListener("change", (e) => { f.channel = e.target.value; refresh(); });
  document.getElementById("f-above").addEventListener("change", (e) => { f.aboveTarget = e.target.checked; refresh(); });
}

// ---------------------------------------------------------------- 3 por marca

async function pageMarca() {
  const d = await api("brand", { id: state.brand, period: state.period });
  const top = Math.max(...d.funnel.map((s) => s.value || 0), 1);
  const g = d.goal;
  const p = d.partner;
  main.innerHTML = `
    ${head({ eyebrow: "Funil do anúncio à venda", title: d.brand.name, sub: `${d.period.label.split(" · ")[0]} · só mídia paga · lead = ${d.brand.leadRule.toLowerCase()}`, controls: periodSwitch() })}
    <div class="brand-tabs segmented" role="group" aria-label="Marca">${state.meta.brands.map((b) =>
      `<button class="seg${b.brand_id === d.brand.brand_id ? " on" : ""}" type="button" data-brand="${b.brand_id}">${esc(b.short_name)}</button>`).join("")}</div>
    <section class="row">
      <div class="card grow-2">
        <div class="card-head"><h2>Funil do período</h2><span class="note">% = passou da etapa anterior</span></div>
        <div class="funnel">${d.funnel.map((s) => `<div class="step">
          <div><div>${esc(s.label)}</div><div class="val">${int(s.value)}</div></div>
          <div class="bar-track"><div class="bar" style="width:${((s.value || 0) / top) * 100}%" title="${esc(s.label)}: ${int(s.value)}"></div></div>
          <div class="rate">${s.rate === null ? DASH : pct(s.rate)}</div></div>`).join("")}</div>
        ${d.biggestDrop ? `<div class="callout"><strong>Maior queda:</strong> ${pct(d.biggestDrop.loss)} de quem chega em “${esc(d.biggestDrop.from)}” não passa para “${esc(d.biggestDrop.to)}”.</div>` : ""}
      </div>
      <div class="grow-1" style="display:flex;flex-direction:column;gap:16px;flex:1 1 300px;min-width:0">
        ${g ? `<div class="card kpi">
          <div class="mono muted">Meta do mês · ${esc(g.label)}</div>
          <div class="value">${int(g.actual)} <span class="muted" style="font-size:16px;font-weight:500">de ${int(g.target)}</span></div>
          ${meter(g.target ? g.actual / g.target : null, { max: 1 })}
          <div class="delta">Projeção até ${dm(g.monthEnd)}: ${int(Math.round(g.projection))} (${pct(g.pctOfTarget)} da meta)</div></div>` : ""}
        ${p ? `<div class="card kpi">
          <div class="mono muted">Receita da parceria no mês</div>
          <div class="value">${brl(p.revenue)}</div>
          <div class="note">${int(p.qualified)} leads qualificados × ${brl(p.fee)}${p.commissionRate ? (p.sales
            ? ` + ${pct(p.commissionRate)} sobre ${brl(p.salesValue)} em ${int(p.sales)} vendas devolvidas.`
            : `. A comissão de ${pct(p.commissionRate)} entra quando o parceiro devolver as vendas fechadas.`) : "."}</div></div>` : ""}
        <div class="card">
          <h2>Origem dos leads</h2>
          <div class="origin">${d.origin.map((o) => `<div><span>${esc(o.channel_name)}</span><span class="muted">${int(o.leads)} leads${o.cpl !== null ? ` · CPL ${brlCents(o.cpl)}` : ""}</span></div>`).join("") || '<div class="muted">Sem leads no período.</div>'}</div>
        </div>
      </div>
    </section>`;
  bindPeriod();
  main.querySelectorAll("[data-brand]").forEach((b) => b.addEventListener("click", () => {
    state.brand = b.dataset.brand;
    store.set("brand", state.brand);
    route();
  }));
}

// ---------------------------------------------------------------- 4 previsao e pacing

async function pagePrevisao() {
  const d = await api("forecast", { brand: state.reverseBrand });
  const r = d.reverse;
  const monthName = MONTHS[Number(d.month.slice(5, 7)) - 1];
  const days = [];
  for (let day = d.month; day <= d.monthEnd; day = addDays(day, 1)) days.push(day);
  const unit = { leads: "lead", qualified_leads: "lead qualificado", conversions: "venda" }[r.metric];
  main.innerHTML = `
    ${head({ eyebrow: `${monthName} ${d.month.slice(0, 4)}`, title: "Previsão e pacing",
      sub: `Realizado até ${dm(addDays(d.asOf, -1))} · faltam ${d.daysRemaining} dias · orçamento e metas da Forecast_MKT_Empresas` })}
    <section class="grid-kpi">
      ${kpi("Orçamento do mês", brlShort(d.budget))}
      ${kpi("Realizado", brlShort(d.actual), `<div class="delta">${pct(d.budgetUsed)} do orçamento em ${pct(d.monthElapsed)} do mês</div>`)}
      ${kpi("Projeção de fechamento", brlShort(d.projection), `<div class="delta ${d.pacing > 1.1 ? "bad" : ""}">${pct(d.pacing)} do orçamento · faixa ${brlShort(d.low)} a ${brlShort(d.high)}</div>`, { accent: true })}
    </section>
    <section class="row">
      <div class="card grow-2">
        <div class="card-head"><h2>Investimento acumulado no mês</h2>
          <div class="legend"><span><i class="key-line"></i>Realizado</span><span><i class="key-line dashed"></i>Projeção</span><span><i class="key-band"></i>Faixa</span><span><i class="key-line reference"></i>Ritmo do orçamento</span></div></div>
        <div id="ch-cum"></div>
        ${asTable(["Dia", "Realizado", "Projeção", "Faixa"], days.map((day) => {
          const a = d.chart.actual.find((p) => p.date === day);
          const pr = d.chart.projected.find((p) => p.date === day);
          return [dm(day), a ? brl(a.value) : DASH, pr && !a ? brl(pr.value) : DASH, pr && !a ? `${brl(pr.low)} a ${brl(pr.high)}` : DASH];
        }))}
      </div>
      <div class="card grow-1">
        <div class="card-head"><h2>Funil reverso</h2>
          <select id="rev-brand" aria-label="Marca do funil reverso">${r.options.map((o) => `<option value="${o.brand_id}"${o.brand_id === r.brand_id ? " selected" : ""}>${esc(o.name)}</option>`).join("")}</select></div>
        <div style="font-size:18px;font-weight:700">${r.gap > 0
          ? `Faltam ${int(Math.ceil(r.missing))} ${esc(r.metricLabel)} para a meta de ${int(r.target)}`
          : r.target ? `No ritmo atual, a meta de ${int(r.target)} ${esc(r.metricLabel)} é batida` : "Sem meta na planilha para este mês"}</div>
        <div class="origin">
          <div><span class="muted">${esc(r.metricLabel[0].toUpperCase() + r.metricLabel.slice(1))} até ontem</span><strong>${int(r.actual)}</strong></div>
          <div><span class="muted">Projeção no ritmo atual</span><strong>${int(Math.round(r.projection || 0))}</strong></div>
          <div><span class="muted">Custo por ${unit} (28 dias)</span><strong>${brlCents(r.costPerUnit)}</strong></div>
        </div>
        <div class="note">${r.gap > 0
          ? `Bater a meta pede cerca de <strong>${brl(r.extraSpend)}</strong> a mais até ${dm(d.monthEnd)}, mantido o custo por ${unit}.`
          : "Nenhum investimento extra necessário para a meta, mantido o ritmo dos últimos 7 dias."}</div>
      </div>
    </section>
    <section class="card flush">
      <div class="card-head"><h2>Pacing por marca</h2></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Marca</th><th>Orçamento</th><th>Realizado</th><th>Projeção</th><th class="left" style="width:180px">Pacing</th><th class="left">Leitura</th></tr></thead>
        <tbody>${d.brands.map((b) => `<tr><td class="name">${esc(b.name)}</td><td>${brl(b.budget)}</td><td>${brl(b.actual)}</td><td>${brl(b.projection)}</td>
          <td class="left">${meter(b.pacing)}</td><td class="left muted">${esc(b.reading)}</td></tr>`).join("")}
          <tr class="total"><td>Total do grupo</td><td>${brl(d.total.budget)}</td><td>${brl(d.total.actual)}</td><td>${brl(d.total.projection)}</td><td class="left">${pct(d.total.pacing)}</td><td></td></tr>
        </tbody></table></div>
      <div class="note">Projeção = realizado até ontem + média diária dos últimos 7 dias × dias restantes. A faixa (cerca de 80%) vem do desvio dos últimos 28 dias; o modelo de série temporal entra na Fase 3.</div>
    </section>`;
  cumulativeChart(document.getElementById("ch-cum"), { days, actual: d.chart.actual, projected: d.chart.projected, budget: d.budget },
    { format: (v) => brlShort(v).replace("R$ ", "") });
  document.getElementById("rev-brand").addEventListener("change", (e) => { state.reverseBrand = e.target.value; route(); });
}

// ---------------------------------------------------------------- 5 saude dos dados

async function pageSaude() {
  const d = await api("health");
  const group = d.coverage.find((c) => c.brand_id === "_grupo");
  const errors = d.alerts.filter((a) => a.severity === "erro").length;
  main.innerHTML = `
    ${head({ eyebrow: "Operação", title: "Saúde dos dados", sub: "Antes de apresentar, confira se todas as fontes chegaram" })}
    <section class="grid-kpi">
      ${kpi("Fontes em dia", `${d.sourcesOk} de ${d.sources.length}`)}
      ${kpi("Alertas abertos", int(d.alerts.length), `<div class="delta ${errors ? "bad" : ""}">${errors} ${errors === 1 ? "erro" : "erros"} · ${d.alerts.length - errors} avisos</div>`)}
      ${kpi("Dias seguidos sem falha", int(d.streak.days), `<div class="delta ${d.streak.days >= d.streak.target ? "good" : ""}">Meta do aceite: ${d.streak.target}</div>`)}
      ${kpi("Leads pagos com campanha", pct(group?.coverage), `<div class="delta ${group?.coverage >= 0.8 ? "good" : "bad"}">Meta do aceite: 80% · últimos 7 dias</div>`)}
    </section>
    <section class="card flush">
      <div class="card-head"><h2>Fontes</h2></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Fonte</th><th class="left">Status</th><th>Última carga</th><th class="left">Frequência</th><th class="left">Escopo</th></tr></thead>
        <tbody>${d.sources.map((s) => `<tr><td class="name">${esc(s.name)}</td>
          <td class="left"><span class="pill ${s.tone}">${s.tone === "good" ? "●" : s.tone === "muted" ? "○" : "!"} ${esc(s.label)}</span></td>
          <td>${when(s.lastOkAt)}</td><td class="left">${esc(s.frequency)}</td>
          <td class="left muted">${esc(s.scope)}${s.accounts ? ` · ${s.accounts} ${s.source_id === "ga4" ? "propriedades" : "contas"}` : ""}</td></tr>`).join("")}</tbody>
      </table></div>
    </section>
    <section class="row">
      <div class="card grow-2">
        <h2>Alertas</h2>
        <div class="alerts">${d.alerts.length ? d.alerts.map((a) => `<div class="alert">
          <span class="when">${when(a.detected_at)}</span>
          <span><span class="pill ${a.severity === "erro" ? "bad" : "warn"}">${a.severity === "erro" ? "Erro" : "Aviso"}</span> ${esc(a.message)}</span></div>`).join("")
          : '<div class="muted">Nenhum alerta aberto.</div>'}</div>
      </div>
      <div class="card grow-1">
        <h2>Atribuição por marca</h2>
        <div class="note">Leads pagos com campanha identificada, últimos 7 dias</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Marca</th><th>Pagos</th><th>Com campanha</th><th>Sem origem</th></tr></thead>
          <tbody>${d.coverage.map((c) => `<tr${c.brand_id === "_grupo" ? ' class="total"' : ""}><td>${esc(c.name)}</td><td>${int(c.paid_leads)}</td>
            <td class="${c.coverage < 0.8 ? "bad" : ""}">${pct(c.coverage)}</td><td>${pct(c.share_without_origin)}</td></tr>`).join("")}</tbody>
        </table></div>
      </div>
    </section>
    <section class="card flush">
      <div class="card-head"><h2>Testes de dados do último build</h2><span class="note">${d.assertions.filter((a) => a.failing_rows === 0).length} de ${d.assertions.length} passando</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Teste</th><th class="left">Resultado</th><th class="left">O que verifica</th></tr></thead>
        <tbody>${d.assertions.map((a) => `<tr><td class="tag">${esc(a.name)}</td>
          <td class="left">${a.failing_rows === 0 ? '<span class="pill good">● ok</span>' : `<span class="pill ${a.severity === "error" ? "bad" : "warn"}">! ${int(a.failing_rows)} ${a.failing_rows === 1 ? "linha" : "linhas"}</span>`}</td>
          <td class="left muted">${esc(a.description)}</td></tr>`).join("")}</tbody>
      </table></div>
    </section>`;
}

// ---------------------------------------------------------------- shell

const media = mediaPages({ main, api, send, esc, head, route: () => route(), brands: () => state.brands });
const PAGES = { visao: pageVisao, canais: pageCanais, marca: pageMarca, previsao: pagePrevisao, saude: pageSaude,
  conteudo: media.conteudo, redes: media.redes };
const MEDIA_PAGES = new Set(["conteudo", "redes"]);

async function loadMeta() {
  state.meta = await api("meta");
  const box = document.getElementById("load-box");
  box.querySelector(".when").textContent = when(state.meta.lastLoad);
  box.querySelector(".sub").innerHTML = `<a href="#/saude">${state.meta.sourcesOk} de ${state.meta.sourcesTotal} fontes atualizadas</a>`;
}

let routing = 0;
async function route() {
  const page = (location.hash.match(/^#\/(\w+)/) || [])[1] || "visao";
  const render = PAGES[page] || pageVisao;
  document.querySelectorAll(".nav").forEach((a) => a.classList.toggle("on", a.dataset.page === page));
  document.querySelectorAll(".nav").forEach((a) => a.toggleAttribute("aria-current", a.dataset.page === page));
  const ticket = ++routing;
  const isMedia = MEDIA_PAGES.has(page);
  try {
    // Midia nao depende do warehouse: abre mesmo sem pipeline rodado.
    if (isMedia && !state.brands) state.brands = (await api("media/brands")).brands;
    if (!isMedia && !state.meta) await loadMeta();
    if (ticket !== routing) return;
    await render();
  } catch (err) {
    if (ticket !== routing) return;
    main.innerHTML = `<div class="card error-box"><h2>Não deu para carregar</h2><p>${esc(err.message)}</p>${isMedia ? ""
      : '<p class="note">Rode <code>npm run pipeline</code> e depois <code>npm run dev</code>.</p>'}</div>`;
  }
}

function setupTheme() {
  const btn = document.getElementById("theme-toggle");
  const order = ["auto", "light", "dark"];
  const label = { auto: "automático", light: "claro", dark: "escuro" };
  const apply = (t) => {
    if (t === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    btn.textContent = `Tema: ${label[t]}`;
  };
  let theme = store.get("theme", "auto");
  apply(theme);
  btn.addEventListener("click", () => {
    theme = order[(order.indexOf(theme) + 1) % order.length];
    store.set("theme", theme);
    apply(theme);
  });
}

setupTheme();
window.addEventListener("hashchange", route);
route();
