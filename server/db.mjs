import { DuckDBInstance } from "@duckdb/node-api";
import { WAREHOUSE_FILE } from "../extract/lib/config.mjs";

// Abre o warehouse so leitura a cada requisicao e fecha no fim. Assim o
// transform pode trocar o arquivo a qualquer momento, e no Lambda o mesmo
// codigo abre o arquivo baixado do S3 para /tmp.

function plain(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object") {
    const name = value.constructor?.name;
    if (name === "DuckDBDecimalValue") return Number(String(value));
    return String(value);
  }
  return value;
}

export async function withWarehouse(fn, file = WAREHOUSE_FILE) {
  const instance = await DuckDBInstance.create(file, { access_mode: "READ_ONLY" });
  const conn = await instance.connect();
  const query = async (sql, params) => {
    const reader = await conn.runAndReadAll(sql, params);
    return reader.getRowObjects().map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, plain(v)])));
  };
  try {
    return await fn(query);
  } finally {
    conn.closeSync();
    instance.closeSync();
  }
}
