import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Ponta a ponta com o mock numa pasta temporaria: lake -> warehouse -> API.
// Data fixa para os numeros nao dependerem do relogio.

const dir = mkdtempSync(path.join(tmpdir(), "hub-test-"));
process.env.LAKE_DIR = path.join(dir, "lake");
process.env.WAREHOUSE_FILE = path.join(dir, "hub.duckdb");
const AS_OF = "2026-10-27";

let results, q, withWarehouse, api;

before(async () => {
  const { generateMock } = await import("../extract/mock/generate.mjs");
  const { buildWarehouse } = await import("../transform/run.mjs");
  ({ withWarehouse } = await import("../server/db.mjs"));
  api = await import("../server/api.mjs");
  generateMock({ today: AS_OF, days: 60 });
  results = await buildWarehouse({ asOf: AS_OF, exportParquet: false, log: () => {} });
  q = (sql, params) => withWarehouse((query) => query(sql, params));
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
});

test("nenhuma assertion de severidade error falha", () => {
  const failing = results.filter((r) => r.severity === "error" && r.failing > 0);
  assert.deepEqual(failing, []);
});

test("as falhas plantadas no mock aparecem como aviso", () => {
  const warned = Object.fromEntries(results.map((r) => [r.name, r.failing]));
  assert.equal(warned["08_naming_pattern"], 1, "campanha fora do padrao");
  assert.equal(warned["10_sources_fresh"], 1, "TikTok com token vencido");
});

test("reprocessamento: o stg fica com a versao mais recente do gasto", async () => {
  const [raw] = await q(`SELECT count(*) AS n FROM raw.google_ads WHERE date = '2026-10-22'`);
  const [stg] = await q(`SELECT count(*) AS n FROM stg.google_ads WHERE date = DATE '2026-10-22'`);
  assert.ok(raw.n > stg.n, "o raw tem o dia duas vezes");
  const [latest] = await q(`
    SELECT sum(CAST(cost_micros AS DOUBLE)) / 1e6 AS spend FROM raw.google_ads
    WHERE date = '2026-10-22' AND _run_id = 'google_ads-daily'`);
  const [mart] = await q(`SELECT sum(spend) AS spend FROM mart.fct_ads_daily WHERE channel_id = 'google_ads' AND date = DATE '2026-10-22'`);
  assert.ok(Math.abs(latest.spend - mart.spend) < 0.01);
});

test("o dia que a Meta falhou chega pelo reprocessamento", async () => {
  const [row] = await q(`SELECT count(*) AS n FROM mart.fct_ads_daily WHERE channel_id = 'meta' AND date = DATE '2026-10-22'`);
  assert.ok(row.n > 0);
});

test("atribuicao: click id ganha da UTM e lead sem nada vira organico", async () => {
  const rows = await q(`SELECT attribution_method, channel_id, count(*) AS n FROM mart.fct_leads GROUP BY ALL`);
  const by = (m) => rows.filter((r) => r.attribution_method === m);
  assert.ok(by("gclid").every((r) => r.channel_id === "google_ads"));
  assert.ok(by("fbclid").every((r) => r.channel_id === "meta"));
  assert.ok(by("sem_origem").every((r) => r.channel_id === "organic"));
});

test("criterio de aceite: >= 80% dos leads pagos com campanha", async () => {
  const [g] = await q(`SELECT coverage FROM ops.attribution_coverage WHERE brand_id = '_grupo'`);
  assert.ok(g.coverage >= 0.8, `cobertura ${g.coverage}`);
});

test("orcamento da planilha bate com o mart (criterio da tarefa 19)", async () => {
  const [sheet] = await q(`SELECT sum(budget) AS b FROM stg.budget WHERE month = DATE '2026-10-01'`);
  const [mart] = await q(`SELECT target FROM mart.fct_forecast WHERE brand_id = '_grupo' AND channel_id = '_todos' AND metric = 'spend'`);
  assert.equal(sheet.b, mart.target);
});

test("projecao segue a formula do documento", async () => {
  const [f] = await q(`SELECT * FROM mart.fct_forecast WHERE brand_id = '_grupo' AND channel_id = '_todos' AND metric = 'spend'`);
  const [r] = await q(`SELECT sum(spend) AS s FROM mart.agg_daily WHERE date BETWEEN DATE '2026-10-01' AND DATE '2026-10-26'`);
  const [w] = await q(`SELECT sum(spend) / 7 AS a FROM mart.agg_daily WHERE date BETWEEN DATE '2026-10-20' AND DATE '2026-10-26'`);
  assert.ok(Math.abs(f.actual_to_date - r.s) < 0.01);
  assert.equal(f.days_remaining, 5);
  assert.ok(Math.abs(f.projection - (r.s + w.a * 5)) < 0.01);
  assert.ok(f.projection_low <= f.projection && f.projection <= f.projection_high);
});

test("sequencia sem falha conta os dias depois da falha da Meta", async () => {
  const [s] = await q(`SELECT days_without_failure, CAST(last_failure_day AS VARCHAR) AS d FROM ops.streak`);
  assert.equal(s.d, "2026-10-22");
  assert.equal(s.days_without_failure, 4);
});

test("todas as rotas da API respondem", async () => {
  for (const [name, params] of [["meta", {}], ["overview", { period: "semana" }], ["overview", { period: "hoje" }],
    ["channels", { period: "mes", above_target: "1" }], ["brand", { id: "protege_facil" }], ["forecast", {}], ["health", {}]]) {
    const body = await withWarehouse((query) => api[name](query, params));
    assert.ok(body, name);
  }
  const overview = await withWarehouse((query) => api.overview(query, { period: "hoje" }));
  assert.equal(overview.kpis.spend.value, null, "hoje ainda nao tem gasto");
  assert.equal(overview.kpis.cpl.value, null);
  await assert.rejects(withWarehouse((query) => api.brand(query, { id: "nao_existe" })), /Marca desconhecida/);
});

test("KPIs da semana sao somas, nao media de taxas", async () => {
  const o = await withWarehouse((query) => api.overview(query, { period: "semana" }));
  const spend = o.brands.reduce((a, b) => a + b.spend, 0);
  const leads = o.brands.reduce((a, b) => a + b.leads, 0);
  assert.ok(Math.abs(spend - o.kpis.spend.value) < 0.01);
  assert.equal(leads, o.kpis.leads.value);
  assert.ok(Math.abs(o.kpis.cpl.value - spend / leads) < 1e-9);
});
