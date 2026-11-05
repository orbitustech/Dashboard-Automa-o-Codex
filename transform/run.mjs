import { readdirSync, readFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";
import { ROOT, LAKE_DIR, WAREHOUSE_FILE, brandsConfig, sourcesConfig } from "../extract/lib/config.mjs";
import { ymd } from "../extract/lib/dates.mjs";
import { RAW_STREAMS } from "./raw-schemas.mjs";

// Reconstroi o warehouse inteiro a partir do lake: raw -> seed -> stg -> mart -> ops,
// roda as assertions e exporta o mart em Parquet. O volume (dezenas de
// milhares de linhas por dia) cabe com folga numa reconstrucao completa, o
// que elimina toda a logica incremental do lado do warehouse.
//
// Grava num arquivo temporario e troca no fim: o servidor nunca le um
// warehouse pela metade.

const MODELS_DIR = path.join(ROOT, "transform", "models");
const ASSERTIONS_DIR = path.join(ROOT, "transform", "assertions");
const LAYERS = ["stg", "mart", "ops"];

export const lit = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const posix = (p) => p.replace(/\\/g, "/");

function hasFiles(dir) {
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? hasFiles(full) : name.endsWith(".jsonl") && statSync(full).size > 0;
  });
}

function splitStatements(sql) {
  return sql.split(/;\s*$/m).map((s) => s.trim()).filter((s) => s && !/^(--[^\n]*\n?)+$/.test(s));
}

async function loadRaw(conn) {
  for (const [stream, spec] of Object.entries(RAW_STREAMS)) {
    const cols = Object.entries(spec.columns);
    const dir = path.join(LAKE_DIR, spec.dir);
    if (hasFiles(dir)) {
      const struct = `{${cols.map(([n, t]) => `'${n}': '${t}'`).join(", ")}}`;
      await conn.run(`CREATE OR REPLACE TABLE raw.${stream} AS
        SELECT * FROM read_json('${posix(dir)}/**/*.jsonl', format = 'newline_delimited', columns = ${struct}, hive_partitioning = true)`);
    } else {
      await conn.run(`CREATE OR REPLACE TABLE raw.${stream} (${cols.map(([n, t]) => `${n} ${t}`).join(", ")}, ingest_dt VARCHAR)`);
    }
  }
}

function values(rows, columns) {
  if (!rows.length) return `SELECT ${columns.map((c) => `NULL AS ${c}`).join(", ")} WHERE false`;
  return `SELECT * FROM (VALUES ${rows.map((r) => `(${r.map(lit).join(", ")})`).join(", ")}) AS t(${columns.join(", ")})`;
}

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function loadSeeds(conn) {
  const { brands, channels } = brandsConfig;
  const seeds = {
    brands: [["brand_id", "brand_name", "short_name", "cpl_target", "goal_metric", "lead_rule", "conversion_label", "fee_per_qualified_lead", "commission_rate"],
      brands.map((b) => [b.brand_id, b.brand_name, b.short_name, b.cpl_target, b.goal_metric, b.lead_rule, b.conversion_label, b.partner?.fee_per_qualified_lead ?? null, b.partner?.commission_rate ?? null])],
    brand_tokens: [["brand_id", "token"], brands.flatMap((b) => b.campaign_tokens.map((t) => [b.brand_id, t.toLowerCase()]))],
    brand_aliases: [["brand_id", "alias"], brands.flatMap((b) => [...new Set([b.brand_id.replace(/_/g, " "), b.brand_name, b.short_name, ...b.campaign_tokens].map(norm))].map((a) => [b.brand_id, a]))],
    funnel_stages: [["brand_id", "stage_order", "stage_key", "label", "source"], brands.flatMap((b) => b.funnel.map((f, i) => [b.brand_id, i + 1, f.key, f.label, f.source]))],
    channels: [["channel_id", "channel_name", "is_paid", "campaign_token"], channels.map((c) => [c.channel_id, c.channel_name, c.paid ? 1 : 0, c.campaign_token?.toLowerCase() ?? null])],
    ga4_properties: [["property_id", "brand_id"], sourcesConfig.sources.find((s) => s.source_id === "ga4").properties.map((p) => [p.property_id, p.brand_id])],
    sources: [["source_id", "source_name", "kind", "channel_id", "frequency", "sla_hours", "scope", "n_accounts", "sort_order"],
      sourcesConfig.sources.map((s, i) => [s.source_id, s.name, s.kind, s.channel_id ?? null, s.frequency, s.sla_hours, s.scope, (s.accounts || s.properties || []).length || null, i])],
    accounts: [["source_id", "account_id", "account_name", "owner"], sourcesConfig.sources.flatMap((s) => (s.accounts || []).map((a) => [s.source_id, a.account_id, a.name, a.owner]))]
  };
  for (const [name, [columns, rows]] of Object.entries(seeds)) {
    await conn.run(`CREATE OR REPLACE TABLE seed.${name} AS ${values(rows, columns)}`);
  }
}

async function runModels(conn, log) {
  for (const layer of LAYERS) {
    const dir = path.join(MODELS_DIR, layer);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      const started = Date.now();
      for (const statement of splitStatements(readFileSync(path.join(dir, file), "utf8"))) {
        try {
          await conn.run(statement);
        } catch (err) {
          throw new Error(`${layer}/${file}: ${err.message}`);
        }
      }
      log(`  ${layer}/${file.padEnd(28)} ${Date.now() - started} ms`);
    }
  }
}

async function runAssertions(conn) {
  const results = [];
  for (const file of readdirSync(ASSERTIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(path.join(ASSERTIONS_DIR, file), "utf8");
    const severity = sql.match(/--\s*severity:\s*(\w+)/)?.[1] || "error";
    const description = sql.match(/--\s*descricao:\s*(.+)/)?.[1]?.trim() || file;
    const reader = await conn.runAndReadAll(`SELECT count(*) AS n FROM (${sql.replace(/;\s*$/, "")}) AS t`);
    const failing = Number(reader.getRowObjects()[0].n);
    results.push({ name: file.replace(/\.sql$/, ""), severity, description, failing });
  }
  await conn.run(`CREATE OR REPLACE TABLE ops.assertion_results AS ${values(
    results.map((r) => [r.name, r.severity, r.description, r.failing]), ["name", "severity", "description", "failing_rows"])}`);
  return results;
}

export async function buildWarehouse({ asOf = ymd(), target = WAREHOUSE_FILE, exportParquet = true, log = console.log } = {}) {
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  rmSync(tmp, { force: true });
  rmSync(`${tmp}.wal`, { force: true });
  const instance = await DuckDBInstance.create(tmp);
  const conn = await instance.connect();
  let results;
  try {
    for (const schema of ["raw", "seed", ...LAYERS]) await conn.run(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await conn.run(`SET TimeZone = 'America/Sao_Paulo'`);
    await conn.run(`SET VARIABLE as_of = DATE '${asOf}'`);
    await conn.run(`CREATE OR REPLACE TABLE ops.build_info AS SELECT DATE '${asOf}' AS as_of, now() AS built_at`);
    await loadRaw(conn);
    await loadSeeds(conn);
    await runModels(conn, log);
    results = await runAssertions(conn);
    if (exportParquet) {
      const out = path.join(path.dirname(target), "mart");
      mkdirSync(out, { recursive: true });
      const tables = (await conn.runAndReadAll(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'mart'`)).getRowObjects();
      for (const { table_name } of tables) await conn.run(`COPY mart.${table_name} TO '${posix(path.join(out, `${table_name}.parquet`))}' (FORMAT parquet)`);
    }
    await conn.run("CHECKPOINT");
  } finally {
    conn.closeSync();
    instance.closeSync();
  }
  rmSync(target, { force: true });
  renameSync(tmp, target);
  return results;
}

async function main() {
  const { values: args } = parseArgs({ options: { "as-of": { type: "string" } } });
  const asOf = args["as-of"] || ymd();
  console.log(`Transformando com data de referencia ${asOf}`);
  const results = await buildWarehouse({ asOf });
  let errors = 0;
  console.log("\nAssertions");
  for (const r of results) {
    const mark = r.failing === 0 ? "ok  " : r.severity === "error" ? "ERRO" : "aviso";
    if (r.failing && r.severity === "error") errors++;
    console.log(`  ${mark.padEnd(5)} ${r.name.padEnd(32)} ${r.failing ? `${r.failing} linha(s): ${r.description}` : ""}`);
  }
  console.log(`\nWarehouse: ${posix(path.relative(ROOT, WAREHOUSE_FILE))}`);
  if (errors) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
