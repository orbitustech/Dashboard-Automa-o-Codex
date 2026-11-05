import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { LAKE_DIR, sourcesConfig } from "../lib/config.mjs";
import { writeRaw, writeRuns } from "../lib/lake.mjs";
import { addDays, eachDay, weekday } from "../lib/dates.mjs";
import { toRawRecord, LEAD_FIELDS, CONVERSION_FIELDS } from "../sources/internal.mjs";

// Dados ilustrativos, deterministicos, no mesmo formato raw das APIs reais.
// Calibrados para lembrar o prototipo de telas (semana de ~R$ 22 mil e ~900
// leads) e com os defeitos que o hub precisa mostrar: campanha fora do
// padrao de nome, lead sem UTM, TikTok com token vencido hoje, um dia de
// falha na Meta coberto pelo reprocessamento e contatos duplicados.

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAMPAIGNS = [
  { p: "meta", acct: "act_1000000002", id: "23850000001", name: "ORB | PesquisaPremios | Cadastros | Meta", brand: "pesquisa_premios", week: 3400, ctr: 0.019, cpc: 0.88, cpl: 14.1 },
  { p: "meta", acct: "act_1000000001", id: "23850000002", name: "ORB | Savvy | Vendas | Meta", brand: "savvy_fesn", week: 2900, ctr: 0.014, cpc: 1.05, cpl: 35.8 },
  { p: "google_ads", acct: "2000000001", id: "21000000001", name: "ORB | FESN | Vendas | Google", brand: "savvy_fesn", week: 2600, ctr: 0.041, cpc: 1.62, cpl: 33.8 },
  { p: "google_ads", acct: "2000000002", id: "21000000002", name: "ORB | PesquisaPremios | Cadastros | Google", brand: "pesquisa_premios", week: 2300, ctr: 0.053, cpc: 1.18, cpl: 15.5 },
  { p: "google_ads", acct: "2000000003", id: "21000000003", name: "ORB | RodaFacil | Leads | Google", brand: "roda_facil", week: 1900, ctr: 0.068, cpc: 2.14, cpl: 26.4 },
  { p: "tiktok", acct: "7000000000000000001", id: "1780000000000000001", name: "ORB | SuperPesquisas | Cadastros | TikTok", brand: "super_pesquisa", week: 1900, ctr: 0.008, cpc: 0.69, cpl: 36.5 },
  { p: "tiktok", acct: "7000000000000000002", id: "1780000000000000002", name: "ORB | RodaFacil | Leads | TikTok", brand: "roda_facil", week: 1200, ctr: 0.009, cpc: 0.74, cpl: 26.1 },
  { p: "meta", acct: "act_1000000003", id: "23850000003", name: "ORB | ProtegeFacil | Leads | Meta", brand: "protege_facil", week: 1100, ctr: 0.016, cpc: 1.21, cpl: 29 },
  { p: "google_ads", acct: "2000000004", id: "21000000004", name: "ORB | ProtegeFacil | Leads | Google", brand: "protege_facil", week: 800, ctr: 0.045, cpc: 2.4, cpl: 33.3 },
  { p: "meta", acct: "act_1000000001", id: "23850000004", name: "ORB | Savvy | Remarketing | Meta", brand: "savvy_fesn", week: 1900, ctr: 0.012, cpc: 0.95, cpl: 34 },
  { p: "meta", acct: "act_1000000002", id: "23850000005", name: "ORB | BigPesquisa | Cadastros | Meta", brand: "big_pesquisa", week: 1300, ctr: 0.017, cpc: 0.9, cpl: 24 },
  { p: "google_ads", acct: "2000000002", id: "21000000005", name: "ORB | BigPesquisa | Cadastros | Google", brand: "big_pesquisa", week: 800, ctr: 0.05, cpc: 1.1, cpl: 25 },
  // Fora do padrao ORB: a UTM nao bate com nenhum nome de campanha.
  { p: "meta", acct: "act_1000000002", id: "23850000006", name: "PP teste criativo outubro", brand: "pesquisa_premios", week: 600, ctr: 0.015, cpc: 0.9, cpl: 17, utm: "pp_teste_out", startsAgo: 26 },
  // Encerradas: aparecem no historico, nao nas ativas.
  { p: "google_ads", acct: "2000000001", id: "21000000006", name: "ORB | Savvy | Vendas | Google", brand: "savvy_fesn", week: 1500, ctr: 0.038, cpc: 1.7, cpl: 38, endsAgo: 45 },
  { p: "meta", acct: "act_1000000002", id: "23850000007", name: "ORB | SuperPesquisas | Cadastros | Meta", brand: "super_pesquisa", week: 900, ctr: 0.013, cpc: 0.8, cpl: 31, endsAgo: 60 },
  { p: "meta", acct: "act_1000000001", id: "23850000008", name: "ORB | RodaFacil | Leads | Meta", brand: "roda_facil", week: 700, ctr: 0.015, cpc: 1.3, cpl: 30, endsAgo: 35 }
];

const UTM = {
  meta: { source: "facebook", medium: "paid_social", click: "fbclid", clickRate: 0.65 },
  google_ads: { source: "google", medium: "cpc", click: "gclid", clickRate: 0.75 },
  tiktok: { source: "tiktok", medium: "paid_social", click: "ttclid", clickRate: 0.55 }
};

const BRAND = {
  savvy_fesn: { panel: "panel_savvy", organicLeads: 4, organicSessions: 320, pQual: 0.9, pConv: 0.19, convDays: 0.2, value: [120, 260], tipo: "pedido", budget: 32000 },
  pesquisa_premios: { panel: "panel_pesquisas", organicLeads: 8, organicSessions: 520, pQual: 0.7, pConv: 0.04, convDays: 2, value: [35, 45], tipo: "cadastro_ativo", budget: 22000 },
  roda_facil: { panel: "panel_ituran", organicLeads: 2, organicSessions: 140, pQual: 0.62, pConv: 0.12, convDays: 6, value: [1400, 2200], tipo: "venda", budget: 12000 },
  big_pesquisa: { panel: "panel_pesquisas", organicLeads: 2, organicSessions: 160, pQual: 0.7, pConv: 0.08, convDays: 2, value: [35, 45], tipo: "cadastro_ativo", budget: 9000 },
  protege_facil: { panel: "panel_protege", organicLeads: 1, organicSessions: 90, pQual: 0.73, pMulti: 0.58, pConv: 0.12, convDays: 8, value: [1800, 3200], tipo: "apolice", budget: 9000 },
  super_pesquisa: { panel: "panel_pesquisas", organicLeads: 1, organicSessions: 110, pQual: 0.7, pConv: 0.1, convDays: 2, value: [35, 45], tipo: "cadastro_ativo", budget: 8000 }
};

// Como as marcas aparecem escritas na planilha (nem sempre igual ao cadastro).
const SHEET_NAME = {
  savvy_fesn: "Savvy · carteirinha FESN", pesquisa_premios: "Pesquisa Prêmios", roda_facil: "Roda Fácil",
  big_pesquisa: "Big Pesquisa", protege_facil: "Protege Fácil", super_pesquisa: "Super Pesquisa"
};

const WEEKDAY = [0.85, 1.05, 1.08, 1.05, 1.02, 0.98, 0.87];
const PROPERTY = Object.fromEntries(sourcesConfig.sources.find((s) => s.source_id === "ga4").properties.map((p) => [p.brand_id, p.property_id]));
const EVENT_RATE = { protege_facil: ["cotacao_iniciada", 0.3], savvy_fesn: ["begin_checkout", 0.25] };

const hash = (s) => createHash("sha256").update(s).digest("hex");
const money = (n) => n.toFixed(2);
const brt = (day, minutes) => {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(Math.floor(minutes % 60)).padStart(2, "0");
  return `${day}T${h}:${m}:00-03:00`;
};
const isoUtc = (day, hhmm) => new Date(`${day}T${hhmm}:00-03:00`).toISOString();

export function generateMock({ today, days = 120, nowMinutes = 13 * 60, seed = 20261027 }) {
  const nowHHMM = `${String(Math.floor(nowMinutes / 60)).padStart(2, "0")}:00`;
  const rand = mulberry32(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const poisson = (l) => {
    if (l <= 0) return 0;
    if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss()));
    let k = 0, p = 1; const L = Math.exp(-l);
    do { k++; p *= rand(); } while (p > L);
    return k - 1;
  };
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  rmSync(LAKE_DIR, { recursive: true, force: true });
  const first = addDays(today, -days);
  const yesterday = addDays(today, -1);
  const metaFailDay = addDays(today, -5);

  const ads = { meta_ads: [], google_ads: [], tiktok_ads: [] };
  const sessions = [];
  const events = [];
  const leads = [];
  const conversions = [];
  const seenContacts = {};
  let leadSeq = 0;

  for (const day of eachDay(first, today)) {
    const t = (days - (Date.parse(today) - Date.parse(day)) / 86400000) / days;
    const dayFactor = WEEKDAY[weekday(day)] * (0.88 + 0.16 * t);
    const isToday = day === today;
    const ga4Day = day.replace(/-/g, "");

    for (const c of CAMPAIGNS) {
      const ago = (Date.parse(today) - Date.parse(day)) / 86400000;
      if (c.endsAgo && ago < c.endsAgo) continue;
      if (c.startsAgo && ago > c.startsAgo) continue;
      const spend = (c.week / 7) * dayFactor * Math.exp(0.12 * gauss());
      const clicks = Math.max(1, Math.round(spend / (c.cpc * Math.exp(0.08 * gauss()))));
      const impressions = Math.round(clicks / (c.ctr * Math.exp(0.08 * gauss())));
      const utm = UTM[c.p];
      const utmCampaign = c.utm || c.name;

      if (!isToday && !(c.p === "tiktok" && day === yesterday)) {
        if (c.p === "meta") {
          for (const [suffix, share] of [["1", 0.6], ["2", 0.4]]) {
            ads.meta_ads.push({
              day, account_id: c.acct, campaign_id: c.id, campaign_name: c.name, adset_id: `${c.id}0`, adset_name: `${c.name} · Conjunto`,
              ad_id: `${c.id}0${suffix}`, ad_name: `Criativo ${suffix}`, date_start: day, spend: money(spend * share),
              impressions: String(Math.round(impressions * share)), clicks: String(Math.round(clicks * share)),
              inline_link_clicks: String(Math.round(clicks * share * 0.92)), reach: String(Math.round(impressions * share * 0.7))
            });
          }
        } else if (c.p === "google_ads") {
          ads.google_ads.push({
            day, customer_id: c.acct, campaign_id: c.id, campaign_name: c.name, campaign_status: c.endsAgo ? "PAUSED" : "ENABLED",
            date: day, cost_micros: String(Math.round(spend * 1e6)), impressions: String(impressions), clicks: String(clicks)
          });
        } else {
          ads.tiktok_ads.push({
            day, advertiser_id: c.acct, campaign_id: c.id, campaign_name: c.name, stat_time_day: `${day} 00:00:00`,
            spend: money(spend), impressions: String(impressions), clicks: String(clicks)
          });
        }

        const paidSessions = Math.round(clicks * (0.82 + 0.06 * rand()));
        const campaignRow = { property_id: PROPERTY[c.brand], date: ga4Day, session_source: utm.source, session_medium: utm.medium, session_campaign_name: utmCampaign };
        sessions.push({ ...campaignRow, sessions: String(paidSessions), total_users: String(Math.round(paidSessions * 0.86)) });
        if (EVENT_RATE[c.brand]) {
          const [eventName, rate] = EVENT_RATE[c.brand];
          events.push({ property_id: PROPERTY[c.brand], date: ga4Day, event_name: eventName, session_source: utm.source, session_medium: utm.medium, session_campaign_name: utmCampaign, event_count: String(poisson(paidSessions * rate)) });
        }
      }

      const hourShare = isToday ? nowMinutes / 1440 : 1;
      const n = poisson((spend / c.cpl) * hourShare);
      for (let i = 0; i < n; i++) leads.push(makeLead(c.brand, day, isToday, c, utm, utmCampaign));
    }

    for (const [brandId, b] of Object.entries(BRAND)) {
      if (!isToday) {
        for (const [source, medium, share] of [["google", "organic", 0.5], ["(direct)", "(none)", 0.3], ["instagram", "social", 0.2]]) {
          const s = Math.round(b.organicSessions * share * dayFactor * Math.exp(0.1 * gauss()));
          sessions.push({ property_id: PROPERTY[brandId], date: ga4Day, session_source: source, session_medium: medium, session_campaign_name: "(organic)", sessions: String(s), total_users: String(Math.round(s * 0.9)) });
        }
      }
      const n = poisson(b.organicLeads * dayFactor * (isToday ? nowMinutes / 1440 : 1));
      for (let i = 0; i < n; i++) leads.push(makeLead(brandId, day, isToday, null, null, null));
    }
  }

  function makeLead(brandId, day, isToday, campaign, utm, utmCampaign) {
    const b = BRAND[brandId];
    // Leads entre 07h e 24h; hoje so ate a hora atual.
    const maxMinute = isToday ? nowMinutes : 1440;
    const created = Math.floor(7 * 60 + rand() * (maxMinute - 7 * 60));
    const leadId = `${brandId.slice(0, 3)}-${String(++leadSeq).padStart(7, "0")}`;
    const createdAt = brt(day, Math.min(created, 1439));

    // ~3% sao o mesmo contato voltando dentro de 30 dias.
    const pool = (seenContacts[brandId] ||= []);
    const contact = pool.length && rand() < 0.03 ? pick(pool.slice(-200)) : hash(`${leadId}:contato`);
    pool.push(contact);

    const record = { marca: brandId, lead_id: leadId, contact_hash: contact, created_at: createdAt, qualificado: false,
      utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, gclid: null, fbclid: null, ttclid: null };
    if (campaign && rand() > 0.08) {
      record.utm_source = utm.source; record.utm_medium = utm.medium; record.utm_campaign = utmCampaign;
      record.utm_content = `Criativo ${rand() < 0.6 ? 1 : 2}`;
    }
    if (campaign && rand() < utm.clickRate) record[utm.click] = hash(`${leadId}:click`).slice(0, 24);
    if (!campaign) {
      const r = rand();
      if (r < 0.5) { record.utm_source = "google"; record.utm_medium = "organic"; }
      else if (r < 0.7) { record.utm_source = "instagram"; record.utm_medium = "social"; }
    }

    const etapas = [{ etapa: "lead", data: createdAt }];
    let last = Date.parse(createdAt);
    const step = (name, maxHours) => {
      last += Math.round(rand() * maxHours * 3600000);
      etapas.push({ etapa: name, data: new Date(last).toISOString() });
    };
    if (rand() < b.pQual) { step("qualificado", 2); record.qualificado = true; }
    if (b.pMulti && record.qualificado && rand() < b.pMulti) step("multicalculo", 48);
    const nowTs = Date.parse(brt(today, nowMinutes));
    const reached = etapas.filter((e) => Date.parse(e.data) <= nowTs);
    record.etapas = reached;
    record.etapa_atual = reached.at(-1).etapa;
    record.updated_at = reached.at(-1).data;

    const eligible = brandId === "protege_facil" ? reached.some((e) => e.etapa === "multicalculo")
      : brandId === "roda_facil" ? record.qualificado : true;
    if (eligible && rand() < b.pConv) {
      const convTs = last + Math.round(-Math.log(1 - rand()) * b.convDays * 86400000);
      if (convTs <= nowTs) {
        const r = rand();
        conversions.push({
          marca: brandId, conversao_id: `cv-${leadId}`, lead_id: leadId, tipo: b.tipo,
          data: new Date(convTs).toISOString(), valor: money(b.value[0] + rand() * (b.value[1] - b.value[0])),
          status: r < 0.92 ? "aprovada" : r < 0.97 ? "cancelada" : "pendente", updated_at: new Date(convTs).toISOString(),
          utm_source: record.utm_source, utm_medium: record.utm_medium, utm_campaign: record.utm_campaign,
          gclid: record.gclid, fbclid: record.fbclid, ttclid: record.ttclid, _panel: b.panel
        });
      }
    }
    return { ...record, _panel: b.panel };
  }

  // Carga historica de ontem e reprocessamento de hoje: os ultimos 7 dias
  // aparecem duas vezes no raw, a versao de hoje com o gasto revisado.
  const backfillAt = isoUtc(yesterday, "06:05");
  const todayAt = isoUtc(today, "06:04");
  const reprocessFrom = addDays(today, -7);
  const rowCounts = {};
  for (const [stream, rows] of Object.entries(ads)) {
    const strip = (r) => { const { day, ...rest } = r; return rest; };
    const older = rows.filter((r) => r.day < yesterday && !(stream === "meta_ads" && r.day === metaFailDay)).map((r) => {
      if (r.day < reprocessFrom) return strip(r);
      const revised = strip(r);
      for (const k of ["spend"]) if (revised[k]) revised[k] = money(Number(revised[k]) * 0.97);
      if (revised.cost_micros) revised.cost_micros = String(Math.round(Number(revised.cost_micros) * 0.97));
      return revised;
    });
    writeRaw(stream, older, { runId: `${stream}-backfill`, ingestedAt: backfillAt });
    // A Meta falhou no dia -5: o dado desse dia so chega pelo reprocessamento.
    const recent = rows.filter((r) => r.day >= reprocessFrom).map(strip);
    writeRaw(stream, recent, { runId: `${stream}-daily`, ingestedAt: todayAt });
    rowCounts[stream] = older.length + recent.length;
  }
  writeRaw("ga4_sessions", sessions, { runId: "ga4-backfill", ingestedAt: isoUtc(today, "05:41") });
  writeRaw("ga4_events", events, { runId: "ga4-backfill", ingestedAt: isoUtc(today, "05:41") });
  rowCounts.ga4_sessions = sessions.length;
  rowCounts.ga4_events = events.length;

  const panels = [...new Set(Object.values(BRAND).map((b) => b.panel))];
  for (const panel of panels) {
    const at = panel === "panel_pesquisas" ? isoUtc(today, "06:15") : isoUtc(today, nowHHMM);
    const strip = ({ _panel, ...r }) => r;
    writeRaw("internal_leads", leads.filter((l) => l._panel === panel).map((l) => toRawRecord(panel, strip(l), LEAD_FIELDS)), { runId: `${panel}-backfill`, ingestedAt: at });
    writeRaw("internal_conversoes", conversions.filter((c) => c._panel === panel).map((c) => toRawRecord(panel, strip(c), CONVERSION_FIELDS)), { runId: `${panel}-backfill`, ingestedAt: at });
  }
  rowCounts.internal_leads = leads.length;
  rowCounts.internal_conversoes = conversions.length;

  const budget = budgetSheet(first, today);
  const lastThursday = eachDay(addDays(today, -6), today).find((d) => weekday(d) === 4);
  writeRaw("forecast_budget", budget, { runId: "forecast_sheet-weekly", ingestedAt: isoUtc(lastThursday, "18:10") });
  rowCounts.forecast_budget = budget.length;

  writeRunHistory({ first, today, metaFailDay, rowCounts, nowHHMM });
  return { days, rows: rowCounts };
}

function budgetSheet(first, today) {
  const rows = [];
  const months = [];
  for (let m = first.slice(0, 7); m <= today.slice(0, 7); ) {
    months.push(m);
    const [y, mm] = m.split("-").map(Number);
    m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
  }
  const channelName = { meta: "Meta", google_ads: "Google", tiktok: "TikTok" };
  const brl = (n) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const current = CAMPAIGNS.filter((c) => !c.endsAgo);
  for (const month of months) {
    const scale = month === today.slice(0, 7) ? 1 : 0.92;
    for (const [brandId, b] of Object.entries(BRAND)) {
      const byChannel = {};
      for (const c of current.filter((c) => c.brand === brandId)) byChannel[c.p] = (byChannel[c.p] || 0) + c.week;
      const total = Object.values(byChannel).reduce((a, v) => a + v, 0);
      for (const [ch, w] of Object.entries(byChannel)) {
        const orcamento = Math.round((b.budget * scale * w) / total / 100) * 100;
        const cpl = current.filter((c) => c.brand === brandId && c.p === ch).reduce((a, c) => a + c.cpl, 0) / current.filter((c) => c.brand === brandId && c.p === ch).length;
        // Roda Facil com meta de leads mais alta que o ritmo, para o funil reverso ter o que mostrar.
        const metaLeads = Math.round((orcamento / cpl) * ({ protege_facil: 0.8, roda_facil: 1.35 }[brandId] || 1.05));
        rows.push({ mes: month, marca: SHEET_NAME[brandId], canal: channelName[ch], orcamento: brl(orcamento), meta_leads: String(metaLeads), meta_vendas: String(Math.round(metaLeads * b.pConv)) });
      }
    }
  }
  return rows;
}

function writeRunHistory({ first, today, metaFailDay, rowCounts, nowHHMM }) {
  const schedule = {
    meta_ads: "06:04", google_ads: "06:07", tiktok_ads: "06:03", ga4: "05:41",
    panel_ituran: "23:00", panel_protege: "23:00", panel_savvy: "22:58", panel_pesquisas: "06:15", forecast_sheet: "18:10"
  };
  for (const day of eachDay(first, today)) {
    const runs = [];
    for (const source of sourcesConfig.sources) {
      const id = source.source_id;
      if (id === "forecast_sheet" && weekday(day) !== 4) continue;
      let hhmm = schedule[id];
      if (day === today && source.kind === "internal" && id !== "panel_pesquisas") hhmm = nowHHMM;
      if (day === today && hhmm > nowHHMM) continue;
      const startedAt = isoUtc(day, hhmm);
      const run = {
        run_id: `${id}-${day.replace(/-/g, "")}`, source_id: id, started_at: startedAt,
        finished_at: new Date(Date.parse(startedAt) + 95000).toISOString(),
        status: "ok", error_code: null, message: null, rows: Math.round((rowCounts[id] || 400) / 120),
        window_start: addDays(day, -7), window_end: addDays(day, -1), watermarks: null
      };
      if (id === "meta_ads" && day === metaFailDay) {
        Object.assign(run, { status: "error", error_code: "rate_limited", rows: 0, message: "Meta (#17) limite de chamadas da conta atingido; o reprocessamento de 7 dias cobre o dia." });
      }
      if (id === "tiktok_ads" && day === today) {
        Object.assign(run, { status: "error", error_code: "token_expired", rows: 0, message: "TikTok 40105: access token recusado pela API. Renovar no app e atualizar o Secrets Manager." });
      }
      runs.push(run);
    }
    writeRuns(runs, `mock-${day}`);
  }
}
