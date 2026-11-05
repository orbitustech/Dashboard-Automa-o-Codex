import { DuckDBInstance } from "@duckdb/node-api";
import { WAREHOUSE_FILE } from "../extract/lib/config.mjs";

// Consulta rapida no warehouse local:
//   node transform/query.mjs "SELECT * FROM mart.dim_campaign LIMIT 5"

const sql = process.argv.slice(2).join(" ");
if (!sql) {
  console.error('Uso: node transform/query.mjs "SELECT ..."');
  process.exit(1);
}
const instance = await DuckDBInstance.create(WAREHOUSE_FILE, { access_mode: "READ_ONLY" });
const conn = await instance.connect();
try {
  const reader = await conn.runAndReadAll(sql);
  console.table(reader.getRowObjectsJson());
} finally {
  conn.closeSync();
  instance.closeSync();
}
