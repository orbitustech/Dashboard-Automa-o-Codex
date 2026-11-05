import { existsSync } from "node:fs";
import { WAREHOUSE_FILE } from "../extract/lib/config.mjs";
import { withWarehouse } from "./db.mjs";
import { ROUTES, ApiInputError } from "./api.mjs";

// Ponto unico de entrada da API, usado pelo servidor local e pelo Lambda.
export async function handleApi(pathname, params) {
  const route = ROUTES[pathname];
  if (!route) return { status: 404, body: { error: "Rota inexistente" } };
  if (!existsSync(WAREHOUSE_FILE)) return { status: 503, body: { error: "Warehouse ainda nao foi gerado. Rode npm run pipeline." } };
  try {
    return { status: 200, body: await withWarehouse((q) => route(q, params)) };
  } catch (err) {
    if (err instanceof ApiInputError) return { status: 400, body: { error: err.message } };
    console.error(err);
    return { status: 500, body: { error: "Erro ao consultar o warehouse" } };
  }
}
