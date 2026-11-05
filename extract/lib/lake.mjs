import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { LAKE_DIR } from "./config.mjs";

// Layout igual ao do S3 em producao:
//   raw/<stream>/ingest_dt=YYYY-MM-DD/<run_id>.jsonl
//   ops/source_runs/ingest_dt=YYYY-MM-DD/<run_id>.jsonl
// Nada e sobrescrito: reprocessar 7 dias grava um arquivo novo, e o stg fica
// com a versao de _ingested_at mais recente de cada chave.

function writeJsonl(rel, rows) {
  const file = path.join(LAKE_DIR, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
  return file;
}

export function writeRaw(stream, rows, { runId, ingestedAt }) {
  const ingestDt = ingestedAt.slice(0, 10);
  const stamped = rows.map((r) => ({ ...r, _run_id: runId, _ingested_at: ingestedAt }));
  return writeJsonl(`raw/${stream}/ingest_dt=${ingestDt}/${runId}.jsonl`, stamped);
}

// fileId agrupa varias execucoes do mesmo dia num arquivo (usado pelo mock).
export function writeRuns(runs, fileId = null) {
  const byDay = new Map();
  for (const run of runs) {
    const key = `${run.started_at.slice(0, 10)}/${fileId || run.run_id}`;
    byDay.set(key, [...(byDay.get(key) || []), run]);
  }
  for (const [key, rows] of byDay) {
    const [day, runId] = key.split("/");
    writeJsonl(`ops/source_runs/ingest_dt=${day}/${runId}.jsonl`, rows);
  }
}

// Ultima marca d'agua gravada com sucesso para uma fonte incremental.
export function lastWatermark(sourceId, stream) {
  const dir = path.join(LAKE_DIR, "ops", "source_runs");
  if (!existsSync(dir)) return null;
  let best = null;
  for (const part of readdirSync(dir)) {
    for (const file of readdirSync(path.join(dir, part))) {
      for (const line of readFileSync(path.join(dir, part, file), "utf8").split("\n")) {
        if (!line) continue;
        const run = JSON.parse(line);
        if (run.source_id !== sourceId || run.status !== "ok") continue;
        const mark = run.watermarks?.[stream];
        if (mark && (!best || mark > best)) best = mark;
      }
    }
  }
  return best;
}
