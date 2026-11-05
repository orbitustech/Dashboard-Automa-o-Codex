import { addDays } from "../extract/lib/dates.mjs";
import { periodRange, PERIOD_KEYS } from "./periods.mjs";

// Uma funcao por tela. Todas leem so mart/ops e devolvem numeros prontos;
// a formatacao (R$, %, datas) fica no front. KPIs sempre a partir das somas.

export class ApiInputError extends Error {}

const div = (a, b) => (b ? a / b : null);
const change = (cur, prev) => (prev ? cur / prev - 1 : null);
const DATE = (p) => `CAST($${p} AS DATE)`;
const between = (col, a = "s", b = "e") => `${col} BETWEEN ${DATE(a)} AND ${DATE(b)}`;

async function asOf(q) {
  const [row] = await q(`SELECT CAST(as_of AS VARCHAR) AS as_of, CAST(built_at AS VARCHAR) AS built_at FROM ops.build_info`);
  return row;
}

function pickPeriod(key, today) {
  return periodRange(PERIOD_KEYS.includes(key) ? key : "semana", today);
}

async function brandIds(q) {
  return new Set((await q(`SELECT brand_id FROM mart.dim_brand`)).map((r) => r.brand_id));
}

async function requireBrand(q, id, { optional = false } = {}) {
  if (!id && optional) return null;
  if (!(await brandIds(q)).has(id)) throw new ApiInputError(`Marca desconhecida: ${id}`);
  return id;
}

// ---------------------------------------------------------------- saude

const STATUS = {
  token_expired: ["Token vencido", "bad"],
  auth: ["Sem permissão", "bad"],
  rate_limited: ["Limite de chamadas", "warn"],
  contract_violation: ["Contrato violado", "bad"],
  config_missing: ["Não configurada", "muted"]
};

const localDate = (s) => (s ? new Date(`${s.replace(" ", "T").slice(0, 19)}-03:00`) : null);

export function sourceStatus(row, now = new Date()) {
  if (row.last_status === "error") {
    const [label, tone] = STATUS[row.last_error_code] || ["Falhou", "bad"];
    return { status: "erro", label, tone };
  }
  if (row.last_status === "skipped") return { status: "nao_configurada", label: "Não configurada", tone: "muted" };
  if (!row.last_ok_at) return { status: "sem_carga", label: "Sem carga", tone: "muted" };
  const hours = (now - localDate(row.last_ok_at)) / 3600000;
  if (hours > row.sla_hours) {
    return row.kind === "sheet"
      ? { status: "atrasada", label: "Não atualizada na semana", tone: "warn" }
      : { status: "atrasada", label: "Atrasada", tone: "warn" };
  }
  return { status: "ok", label: "Em dia", tone: "good" };
}

async function sources(q, now) {
  const rows = await q(`SELECT *, CAST(last_run_at AS VARCHAR) AS last_run_at, CAST(last_ok_at AS VARCHAR) AS last_ok_at
                        FROM ops.source_last ORDER BY sort_order`);
  return rows.map((r) => ({ ...r, ...sourceStatus(r, now) }));
}

export async function meta(q, _params, now = new Date()) {
  const info = await asOf(q);
  const list = await sources(q, now);
  const lastLoad = list.map((s) => s.last_ok_at).filter(Boolean).sort().at(-1) || null;
  return {
    asOf: info.as_of,
    builtAt: info.built_at,
    lastLoad,
    sourcesOk: list.filter((s) => s.status === "ok").length,
    sourcesTotal: list.length,
    brands: await q(`SELECT brand_id, brand_name, short_name FROM mart.dim_brand`),
    periods: PERIOD_KEYS
  };
}

export async function health(q, _params, now = new Date()) {
  const list = await sources(q, now);
  const [streak] = await q(`SELECT days_without_failure, CAST(last_failure_day AS VARCHAR) AS last_failure_day, target_days FROM ops.streak`);
  return {
    sources: list.map((s) => ({
      source_id: s.source_id, name: s.source_name, status: s.status, label: s.label, tone: s.tone,
      lastRunAt: s.last_run_at, lastOkAt: s.last_ok_at, frequency: s.frequency, scope: s.scope,
      accounts: s.n_accounts, message: s.last_status === "error" ? s.last_message : null
    })),
    sourcesOk: list.filter((s) => s.status === "ok").length,
    alerts: await q(`SELECT severity, source_id, CAST(detected_at AS VARCHAR) AS detected_at, message FROM ops.alerts
                     ORDER BY severity = 'erro' DESC, detected_at DESC`),
    streak: { days: streak.days_without_failure, target: streak.target_days, lastFailure: streak.last_failure_day },
    coverage: await q(`SELECT a.brand_id, coalesce(b.short_name, 'Grupo') AS name, a.paid_leads, a.paid_leads_with_campaign,
                         a.coverage, a.share_without_origin
                       FROM ops.attribution_coverage a LEFT JOIN mart.dim_brand b USING (brand_id)
                       ORDER BY a.brand_id = '_grupo', a.coverage`),
    assertions: await q(`SELECT name, severity, description, failing_rows FROM ops.assertion_results ORDER BY name`)
  };
}

// ---------------------------------------------------------------- visao do grupo

function kpiBlock(cur, complete, prev, hasSpend) {
  const make = (value, before) => ({ value, prev: before, change: value === null || before === null ? null : change(value, before) });
  const ratio = (a, b) => (hasSpend ? div(a, b) : null);
  return {
    spend: make(hasSpend ? cur.spend : null, prev.spend),
    leads: make(cur.leads, prev.leads),
    cpl: make(ratio(complete.spend, complete.leads), div(prev.spend, prev.leads)),
    conversions: make(cur.conversions, prev.conversions),
    cac: make(ratio(complete.spend, complete.conversions), div(prev.spend, prev.conversions)),
    roas: make(ratio(complete.revenue, complete.spend), div(prev.revenue, prev.spend)),
    revenue: make(cur.revenue, prev.revenue)
  };
}

const SUMS = ["spend", "impressions", "clicks", "sessions", "leads", "qualified", "conversions", "revenue"];
const sumCols = (prefix, a, b) => SUMS.map((m) => `coalesce(sum(${m}) FILTER (WHERE ${between("date", a, b)}), 0) AS ${prefix}${m}`).join(",\n  ");
const split = (row, prefix) => Object.fromEntries(SUMS.map((m) => [m, row[`${prefix}${m}`]]));

export async function overview(q, params) {
  const { as_of: today } = await asOf(q);
  const period = pickPeriod(params.period, today);
  const p = { s: period.start, e: period.end, ps: period.prevStart, pe: period.prevEnd };

  // Midia paga chega as 06h do dia seguinte: hoje ainda nao tem gasto. Taxas
  // (CPL, CAC, ROAS) usam so os dias completos do periodo para nao misturar
  // leads de hoje com gasto zero.
  const completeEnd = period.end < today ? period.end : addDays(today, -1);
  p.ce = completeEnd;
  const rows = await q(`
    SELECT CASE WHEN grouping(a.brand_id) = 1 THEN '_grupo' ELSE a.brand_id END AS brand_id,
      ${sumCols("", "s", "e")},
      ${sumCols("c_", "s", "ce")},
      ${sumCols("p_", "ps", "pe")}
    FROM mart.agg_daily a
    GROUP BY GROUPING SETS ((a.brand_id), ())`, p);
  const pacing = Object.fromEntries((await q(`
    SELECT brand_id, projection, target FROM mart.fct_forecast WHERE channel_id = '_todos' AND metric = 'spend'`))
    .map((r) => [r.brand_id, div(r.projection, r.target)]));
  const dims = Object.fromEntries((await q(`SELECT * FROM mart.dim_brand`)).map((b) => [b.brand_id, b]));

  const hasSpend = completeEnd >= period.start;
  const byBrand = rows.filter((r) => r.brand_id !== "_grupo").map((r) => {
    const cur = split(r, "");
    const done = split(r, "c_");
    const prev = split(r, "p_");
    return {
      brand_id: r.brand_id,
      name: dims[r.brand_id]?.brand_name || "Sem marca (fora do padrão de nome)",
      spend: hasSpend ? cur.spend : null, leads: cur.leads, cpl: hasSpend ? div(done.spend, done.leads) : null,
      cplTarget: dims[r.brand_id]?.cpl_target ?? null,
      conversions: cur.conversions, cac: hasSpend ? div(done.spend, done.conversions) : null, pacing: pacing[r.brand_id] ?? null,
      prev
    };
  }).filter((b) => b.spend || b.leads || b.conversions).sort((a, b) => b.spend - a.spend);
  const group = rows.find((r) => r.brand_id === "_grupo");
  const cur = split(group, "");
  const done = split(group, "c_");
  const prev = split(group, "p_");

  const seriesEnd = period.end;
  const series = await q(`
    SELECT CAST(date AS VARCHAR) AS date, sum(spend) AS spend, sum(leads) AS leads
    FROM mart.agg_daily
    WHERE ${between("date")}
    GROUP BY date ORDER BY date`, { s: addDays(seriesEnd, -27), e: seriesEnd });

  return {
    period,
    kpis: kpiBlock(cur, done, prev, hasSpend),
    spendThrough: hasSpend ? completeEnd : null,
    series,
    changes: await changes(q, period, byBrand, pacing, dims),
    brands: byBrand.map(({ prev: _p, ...b }) => b),
    total: { spend: hasSpend ? cur.spend : null, leads: cur.leads, cpl: hasSpend ? div(done.spend, done.leads) : null,
      conversions: cur.conversions, cac: hasSpend ? div(done.spend, done.conversions) : null, pacing: pacing._grupo ?? null }
  };
}

// "O que mudou desde a ultima sexta": regras simples sobre a semana vs. a anterior.
async function changes(q, period, byBrand, pacing, dims) {
  const out = [];
  const named = byBrand.filter((b) => dims[b.brand_id]);
  const cheapest = named.filter((b) => b.leads >= 20 && b.cpl !== null).sort((a, b) => a.cpl - b.cpl)[0];
  if (cheapest) out.push({ tone: "good", icon: "↑", text: `${dims[cheapest.brand_id].short_name}: ${cheapest.leads} leads, CPL de ${brl(cheapest.cpl)}, o menor do grupo` });

  const salesUp = named.map((b) => ({ ...b, diff: b.conversions - b.prev.conversions })).sort((a, b) => b.diff - a.diff)[0];
  if (salesUp && salesUp.diff > 0) {
    out.push({ tone: "good", icon: "↑", text: `${dims[salesUp.brand_id].short_name}: ${salesUp.conversions} ${dims[salesUp.brand_id].conversion_label.toLowerCase()}, +${salesUp.diff} sobre o período anterior` });
  }

  const cplRows = await q(`
    SELECT a.brand_id, c.channel_name,
      sum(spend) FILTER (WHERE ${between("date")}) / nullif(sum(leads) FILTER (WHERE ${between("date")}), 0) AS cpl,
      sum(spend) FILTER (WHERE ${between("date", "ps", "pe")}) / nullif(sum(leads) FILTER (WHERE ${between("date", "ps", "pe")}), 0) AS prev_cpl,
      sum(leads) FILTER (WHERE ${between("date")}) AS leads
    FROM mart.agg_daily a JOIN mart.dim_channel c USING (channel_id)
    WHERE c.is_paid AND a.brand_id <> 'sem_marca'
    GROUP BY ALL`, { s: period.start, e: period.end, ps: period.prevStart, pe: period.prevEnd });
  const worst = cplRows.filter((r) => r.cpl && r.prev_cpl && r.leads >= 10)
    .map((r) => ({ ...r, rise: r.cpl / r.prev_cpl - 1 })).sort((a, b) => b.rise - a.rise)[0];
  if (worst && worst.rise > 0.1) {
    out.push({ tone: "bad", icon: "↓", text: `${dims[worst.brand_id].short_name}: CPL subiu ${pct(worst.rise)} para ${brl(worst.cpl)} no ${worst.channel_name}` });
  }

  const pace = Object.entries(pacing).filter(([id, v]) => dims[id] && v && (v > 1.1 || v < 0.9)).sort((a, b) => Math.abs(b[1] - 1) - Math.abs(a[1] - 1))[0];
  if (pace) out.push({ tone: "bad", icon: "!", text: `${dims[pace[0]].short_name} projeta ${pct(pace[1])} do orçamento do mês` });

  const [alert] = await q(`SELECT message FROM ops.alerts WHERE severity = 'erro' LIMIT 1`);
  if (alert) out.push({ tone: "bad", icon: "!", text: alert.message });
  return out;
}

const brl = (n) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n) => `${Math.round(n * 100)}%`;

// ---------------------------------------------------------------- canal e campanha

export async function channels(q, params) {
  const { as_of: today } = await asOf(q);
  const period = pickPeriod(params.period, today);
  const brand = await requireBrand(q, params.brand, { optional: true });
  const channel = params.channel || null;
  const p = { s: period.start, e: period.end, brand, channel };

  const cards = await q(`
    SELECT c.channel_id, c.channel_name,
      coalesce(sum(a.spend) FILTER (WHERE ${between("a.date")}), 0) AS spend,
      coalesce(sum(a.leads) FILTER (WHERE ${between("a.date")}), 0) AS leads
    FROM mart.dim_channel c
    LEFT JOIN mart.agg_daily a ON a.channel_id = c.channel_id AND ($brand IS NULL OR a.brand_id = $brand)
    WHERE c.is_paid
    GROUP BY ALL ORDER BY spend DESC`, { s: p.s, e: p.e, brand });
  const total = cards.reduce((a, c) => a + c.spend, 0);

  const campaigns = await q(`
    SELECT d.campaign_key, d.campaign_name, d.channel_id, ch.channel_name, d.brand_id, d.objective, d.naming_ok, d.is_active,
      b.short_name AS brand_name, b.cpl_target,
      coalesce(sum(a.spend), 0) AS spend, coalesce(sum(a.impressions), 0) AS impressions, coalesce(sum(a.clicks), 0) AS clicks,
      coalesce(sum(a.leads), 0) AS leads, coalesce(sum(a.conversions), 0) AS conversions
    FROM mart.dim_campaign d
    JOIN mart.dim_channel ch USING (channel_id)
    LEFT JOIN mart.dim_brand b USING (brand_id)
    LEFT JOIN mart.agg_campaign_daily a ON a.campaign_key = d.campaign_key AND ${between("a.date")}
    WHERE ($brand IS NULL OR d.brand_id = $brand) AND ($channel IS NULL OR d.channel_id = $channel)
    GROUP BY ALL
    HAVING sum(a.spend) > 0 OR sum(a.leads) > 0
    ORDER BY spend DESC`, p);

  const spark = await q(`
    SELECT campaign_key, CAST(date AS VARCHAR) AS date, leads FROM mart.agg_campaign_daily WHERE ${between("date")}`,
  { s: addDays(period.end, -6), e: period.end });
  const days = Array.from({ length: 7 }, (_, i) => addDays(period.end, i - 6));
  const sparkBy = {};
  for (const r of spark) (sparkBy[r.campaign_key] ||= {})[r.date] = r.leads;

  let list = campaigns.map((c) => ({
    campaign_key: c.campaign_key, name: c.campaign_name, channel_id: c.channel_id, channel_name: c.channel_name,
    brand_id: c.brand_id, brand_name: c.brand_name, objective: c.objective, naming_ok: c.naming_ok,
    spend: c.spend, ctr: div(c.clicks, c.impressions), cpc: div(c.spend, c.clicks), leads: c.leads,
    cpl: div(c.spend, c.leads), cplTarget: c.cpl_target, conversions: c.conversions,
    spark: days.map((d) => sparkBy[c.campaign_key]?.[d] || 0)
  }));
  if (params.above_target === "1") list = list.filter((c) => c.cpl !== null && c.cplTarget && c.cpl > c.cplTarget);
  const [{ n: totalCampaigns }] = await q(`SELECT count(*) AS n FROM mart.dim_campaign`);

  return {
    period,
    channels: cards.map((c) => ({ ...c, share: div(c.spend, total), cpl: div(c.spend, c.leads) })),
    campaigns: list,
    counts: { shown: list.length, withSpend: campaigns.filter((c) => c.spend > 0).length, total: totalCampaigns }
  };
}

// ---------------------------------------------------------------- por marca

export async function brand(q, params) {
  const { as_of: today } = await asOf(q);
  const period = pickPeriod(params.period, today);
  const id = await requireBrand(q, params.id || "protege_facil");
  const p = { s: period.start, e: period.end, b: id };

  const [dim] = await q(`SELECT * FROM mart.dim_brand WHERE brand_id = $b`, { b: id });
  const stages = await q(`SELECT stage_order, stage_key, label, source FROM seed.funnel_stages WHERE brand_id = $b ORDER BY stage_order`, { b: id });

  // Funil da midia paga: todas as etapas contam so trafego e leads de canais pagos.
  const [base] = await q(`
    WITH l AS (
      SELECT lead_id FROM mart.fct_leads
      WHERE brand_id = $b AND is_paid AND NOT is_duplicate AND ${between("created_date")}
    )
    SELECT
      (SELECT coalesce(sum(clicks), 0) FROM mart.agg_daily WHERE brand_id = $b AND ${between("date")}) AS clicks,
      (SELECT coalesce(sum(a.sessions), 0) FROM mart.agg_daily a JOIN mart.dim_channel c USING (channel_id)
         WHERE c.is_paid AND a.brand_id = $b AND ${between("a.date")}) AS sessions,
      (SELECT count(*) FROM l) AS leads,
      (SELECT count(*) FROM mart.fct_conversoes v JOIN mart.dim_channel c USING (channel_id)
         WHERE v.brand_id = $b AND v.is_valid AND c.is_paid AND ${between("v.converted_date")}) AS conversions`, p);
  const stageCounts = Object.fromEntries((await q(`
    SELECT s.stage, count(DISTINCT s.lead_id) AS n
    FROM mart.fct_lead_stages s
    JOIN mart.fct_leads l ON l.brand_id = s.brand_id AND l.lead_id = s.lead_id
    WHERE s.brand_id = $b AND l.is_paid AND NOT l.is_duplicate AND ${between("l.created_date")}
    GROUP BY ALL`, p)).map((r) => [r.stage, r.n]));
  const eventCounts = Object.fromEntries((await q(`
    SELECT e.event_name, sum(e.event_count) AS n
    FROM mart.fct_web_events e JOIN mart.dim_channel c USING (channel_id)
    WHERE e.brand_id = $b AND c.is_paid AND ${between("e.date")}
    GROUP BY ALL`, p)).map((r) => [r.event_name, r.n]));

  const valueOf = (source) => {
    if (source === "ads.clicks") return base.clicks;
    if (source === "web.sessions") return base.sessions;
    if (source === "conversion") return base.conversions;
    if (source === "lead.stage:lead") return base.leads;
    if (source.startsWith("lead.stage:")) return stageCounts[source.slice(11)] || 0;
    if (source.startsWith("web.event:")) return eventCounts[source.slice(10)] || 0;
    return null;
  };
  const funnel = stages.map((s, i) => ({ key: s.stage_key, label: s.label, value: valueOf(s.source), rate: null }));
  funnel.forEach((s, i) => { if (i > 0) s.rate = div(s.value, funnel[i - 1].value); });
  // Maior queda entre etapas, sem contar a ultima (venda), que demora a
  // amadurecer e sempre parece a maior perda na semana.
  const drop = funnel.slice(1, -1).filter((s) => s.rate !== null)
    .map((s) => ({ from: funnel[funnel.indexOf(s) - 1].label, to: s.label, loss: 1 - s.rate }))
    .sort((a, b) => b.loss - a.loss)[0] || null;

  const [goal] = await q(`SELECT * FROM mart.fct_reverse_funnel WHERE brand_id = $b`, { b: id });
  const goalLabel = { leads: "leads", qualified_leads: "leads qualificados", conversions: dim.conversion_label.toLowerCase() }[dim.goal_metric];

  let partner = null;
  if (dim.fee_per_qualified_lead || dim.commission_rate) {
    const [m] = await q(`
      SELECT
        (SELECT count(*) FROM mart.fct_leads WHERE brand_id = $b AND is_qualified AND NOT is_duplicate AND ${between("created_date")}) AS qualified,
        (SELECT coalesce(sum(value), 0) FROM mart.fct_conversoes WHERE brand_id = $b AND is_valid AND ${between("converted_date")}) AS sales_value,
        (SELECT count(*) FROM mart.fct_conversoes WHERE brand_id = $b AND is_valid AND ${between("converted_date")}) AS sales`,
    { b: id, s: `${today.slice(0, 7)}-01`, e: today });
    partner = {
      qualified: m.qualified, fee: dim.fee_per_qualified_lead || 0, commissionRate: dim.commission_rate || 0,
      salesValue: m.sales_value, sales: m.sales,
      revenue: m.qualified * (dim.fee_per_qualified_lead || 0) + m.sales_value * (dim.commission_rate || 0)
    };
  }

  const origin = await q(`
    SELECT c.channel_id, c.channel_name, c.is_paid, sum(a.leads) AS leads, sum(a.spend) AS spend
    FROM mart.agg_daily a JOIN mart.dim_channel c USING (channel_id)
    WHERE a.brand_id = $b AND ${between("a.date")}
    GROUP BY ALL HAVING sum(a.leads) > 0 OR sum(a.spend) > 0 ORDER BY leads DESC`, p);

  return {
    period,
    brand: { brand_id: id, name: dim.brand_name, shortName: dim.short_name, leadRule: dim.lead_rule, conversionLabel: dim.conversion_label, cplTarget: dim.cpl_target },
    funnel,
    biggestDrop: drop,
    goal: goal && { metric: dim.goal_metric, label: goalLabel, actual: goal.actual_to_date, target: goal.target, projection: goal.projection,
      pctOfTarget: div(goal.projection, goal.target), daysRemaining: goal.days_remaining, monthEnd: lastDay(today) },
    partner,
    origin: origin.map((o) => ({ ...o, cpl: o.is_paid ? div(o.spend, o.leads) : null }))
  };
}

const lastDay = (day) => {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

// ---------------------------------------------------------------- previsao e pacing

function reading(row, rev, cplMonth, cplTarget) {
  const pace = row.pacing;
  if (pace !== null && pace > 1.1) return "Reduzir verba diária ou aprovar extra";
  if (rev?.extra_spend_needed > 0) return `Meta pede ${brlRound(rev.extra_spend_needed)} a mais`;
  if (cplMonth && cplTarget && cplMonth > cplTarget * 1.1) return "CPL acima da meta";
  if (pace !== null && pace < 0.9) return "Sobra verba";
  if (pace !== null && Math.abs(pace - 1) <= 0.05) return "Dentro da margem de 5%";
  return "No ritmo";
}
const brlRound = (n) => `R$ ${Math.round(n).toLocaleString("pt-BR")}`;

export async function forecast(q, params) {
  const { as_of: today } = await asOf(q);
  const rows = await q(`SELECT *, CAST(month AS VARCHAR) AS month FROM mart.fct_forecast WHERE channel_id = '_todos' AND metric = 'spend'`);
  const group = rows.find((r) => r.brand_id === "_grupo");
  const monthStart = group.month;
  const monthEnd = lastDay(today);

  const daily = await q(`
    SELECT CAST(date AS VARCHAR) AS date, sum(spend) AS spend FROM mart.agg_daily
    WHERE date >= CAST($s AS DATE) AND date < CAST($e AS DATE) GROUP BY date ORDER BY date`, { s: monthStart, e: today });
  let cum = 0;
  const actual = daily.map((d) => ({ date: d.date, value: (cum += d.spend) }));
  const projected = [];
  const span = group.days_remaining;
  for (let k = 0; k <= span; k++) {
    const share = span ? k / span : 1;
    projected.push({
      date: addDays(today, k - 1),
      value: group.actual_to_date + group.daily_avg_7d * k,
      low: group.actual_to_date + (group.projection_low - group.actual_to_date) * share,
      high: group.actual_to_date + (group.projection_high - group.actual_to_date) * share
    });
  }

  const dims = Object.fromEntries((await q(`SELECT * FROM mart.dim_brand`)).map((b) => [b.brand_id, b]));
  const reverse = Object.fromEntries((await q(`SELECT * FROM mart.fct_reverse_funnel`)).map((r) => [r.brand_id, r]));
  const cpl = Object.fromEntries((await q(`
    SELECT brand_id, sum(spend) / nullif(sum(leads), 0) AS cpl FROM mart.agg_daily
    WHERE date >= CAST($s AS DATE) AND date < CAST($e AS DATE) GROUP BY ALL`, { s: monthStart, e: today })).map((r) => [r.brand_id, r.cpl]));

  const brands = rows.filter((r) => dims[r.brand_id]).map((r) => {
    const pacing = div(r.projection, r.target);
    const row = { brand_id: r.brand_id, name: dims[r.brand_id].brand_name, budget: r.target, actual: r.actual_to_date, projection: r.projection,
      low: r.projection_low, high: r.projection_high, pacing };
    return { ...row, reading: reading(row, reverse[r.brand_id], cpl[r.brand_id], dims[r.brand_id].cpl_target) };
  }).sort((a, b) => (b.budget || 0) - (a.budget || 0));

  const pick = params.brand && dims[params.brand] ? params.brand
    : Object.values(reverse).sort((a, b) => (b.extra_spend_needed || 0) - (a.extra_spend_needed || 0))[0]?.brand_id;
  const rev = reverse[pick];
  const metricLabel = { leads: "leads", qualified_leads: "leads qualificados", conversions: dims[pick].conversion_label.toLowerCase() }[rev.goal_metric];

  return {
    asOf: today, month: monthStart, monthEnd,
    daysRemaining: group.days_remaining, daysInMonth: group.days_in_month, daysElapsed: group.days_elapsed,
    budget: group.target, actual: group.actual_to_date, projection: group.projection, low: group.projection_low, high: group.projection_high,
    pacing: div(group.projection, group.target),
    budgetUsed: div(group.actual_to_date, group.target),
    monthElapsed: group.days_elapsed / group.days_in_month,
    chart: { actual, projected, budget: group.target },
    brands,
    total: { budget: group.target, actual: group.actual_to_date, projection: group.projection, pacing: div(group.projection, group.target) },
    reverse: {
      brand_id: pick, name: dims[pick].short_name, metric: rev.goal_metric, metricLabel,
      target: rev.target, actual: rev.actual_to_date, projection: rev.projection,
      missing: rev.missing_to_goal, gap: rev.gap_after_projection, costPerUnit: rev.cost_per_unit_28d, extraSpend: rev.extra_spend_needed,
      options: Object.values(dims).map((d) => ({ brand_id: d.brand_id, name: d.short_name }))
    }
  };
}

export const ROUTES = {
  "/api/meta": meta,
  "/api/overview": overview,
  "/api/channels": channels,
  "/api/brand": brand,
  "/api/forecast": forecast,
  "/api/health": health
};
