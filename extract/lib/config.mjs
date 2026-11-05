import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(rel) {
  return JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
}

export const brandsConfig = readJson("config/brands.json");
export const sourcesConfig = readJson("config/sources.json");

export function sourceById(id) {
  const source = sourcesConfig.sources.find((s) => s.source_id === id);
  if (!source) throw new Error(`Fonte desconhecida: ${id}`);
  return source;
}

// .env local so para desenvolvimento. Na AWS as mesmas chaves vem do
// Secrets Manager, injetadas como variaveis de ambiente no Lambda.
export function loadDotEnv(file = path.join(ROOT, ".env")) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

export class ConfigMissingError extends Error {
  constructor(names) {
    super(`Credencial ausente: ${names.join(", ")}`);
    this.code = "config_missing";
  }
}

export function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new ConfigMissingError(missing);
  return Object.fromEntries(names.map((n) => [n, process.env[n]]));
}

export const LAKE_DIR = process.env.LAKE_DIR || path.join(ROOT, "data", "lake");
export const WAREHOUSE_FILE = process.env.WAREHOUSE_FILE || path.join(ROOT, "data", "hub.duckdb");
