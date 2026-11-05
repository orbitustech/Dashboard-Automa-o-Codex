import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { loadDotEnv, sourcesConfig, sourceById } from "./lib/config.mjs";
import { writeRaw, writeRuns } from "./lib/lake.mjs";
import { addDays, ymd } from "./lib/dates.mjs";
import meta from "./sources/meta.mjs";
import googleAds from "./sources/google-ads.mjs";
import tiktok from "./sources/tiktok.mjs";
import ga4 from "./sources/ga4.mjs";
import internal from "./sources/internal.mjs";
import forecastSheet from "./sources/forecast-sheet.mjs";

// Uso:
//   node extract/run.mjs                       todas as fontes, janela padrao
//   node extract/run.mjs --source meta_ads     uma fonte
//   node extract/run.mjs --from 2025-10-01 --to 2026-10-26 --source meta_ads   carga historica
//   node extract/run.mjs --mock                dados ilustrativos de todas as fontes
//
// Na AWS cada fonte vira um agendamento do EventBridge chamando o mesmo
// runSource() dentro de um Lambda.

const EXTRACTORS = {
  meta_ads: meta,
  google_ads: googleAds,
  tiktok_ads: tiktok,
  ga4,
  forecast_sheet: forecastSheet
};

function extractorFor(source) {
  return source.kind === "internal" ? internal : EXTRACTORS[source.source_id];
}

export function defaultWindow(source, today) {
  const yesterday = addDays(today, -1);
  if (source.kind === "internal") return { from: addDays(today, -30), to: today };
  if (source.kind === "sheet") return { from: null, to: null };
  return { from: addDays(today, -(source.reprocess_days || 7)), to: yesterday };
}

export async function runSource(source, { from, to, now = new Date() } = {}) {
  const startedAt = now.toISOString();
  const runId = `${source.source_id}-${startedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const run = {
    run_id: runId, source_id: source.source_id, started_at: startedAt, finished_at: null,
    status: "ok", error_code: null, message: null, rows: 0, window_start: from, window_end: to, watermarks: null
  };
  try {
    const result = await extractorFor(source).extract({ source, from, to });
    for (const [stream, rows] of Object.entries(result)) {
      if (stream === "watermarks") continue;
      writeRaw(stream, rows, { runId, ingestedAt: startedAt });
      run.rows += rows.length;
    }
    run.watermarks = result.watermarks || null;
  } catch (err) {
    run.status = err.code === "config_missing" ? "skipped" : "error";
    run.error_code = err.code || "unknown";
    run.message = err.message;
  }
  run.finished_at = new Date().toISOString();
  writeRuns([run]);
  return run;
}

async function main() {
  const { values } = parseArgs({
    options: {
      mock: { type: "boolean", default: false },
      source: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      today: { type: "string" },
      days: { type: "string", default: "120" }
    }
  });
  const today = values.today || ymd();

  if (values.mock) {
    const { generateMock } = await import("./mock/generate.mjs");
    // Hoje de verdade: os paineis horarios "rodaram" na ultima hora cheia.
    const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":").map(Number);
    const nowMinutes = today === ymd() ? Math.max(8 * 60, h * 60 + m) : 13 * 60;
    const summary = generateMock({ today, days: Number(values.days), nowMinutes });
    console.log(`Mock gravado em data/lake (${summary.days} dias ate ${today}).`);
    for (const [stream, n] of Object.entries(summary.rows)) console.log(`  ${stream.padEnd(20)} ${n} linhas`);
    return;
  }

  loadDotEnv();
  const ids = values.source ? values.source.split(",") : sourcesConfig.sources.map((s) => s.source_id);
  let failed = 0;
  for (const id of ids) {
    const source = sourceById(id);
    const window = defaultWindow(source, today);
    const run = await runSource(source, { from: values.from || window.from, to: values.to || window.to });
    const label = run.status === "ok" ? `${run.rows} linhas` : `${run.error_code}: ${run.message}`;
    console.log(`${run.status.padEnd(7)} ${id.padEnd(16)} ${label}`);
    if (run.status === "error") failed++;
  }
  // Codigo de saida != 0 dispara o alarme do agendador.
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
