import { existsSync } from "node:fs";
import { WAREHOUSE_FILE } from "../extract/lib/config.mjs";
import { withWarehouse } from "./db.mjs";
import { ROUTES, ApiInputError } from "./api.mjs";
import { matchMediaRoute } from "./media.mjs";

// Ponto unico de entrada da API, usado pelo servidor local e pelo Lambda.
// Dados (/api/<tela>) so leem o warehouse; Midia (/api/media/*) le e grava no store.
export async function handleApi(pathname, params = {}, { method = "GET", body = null, user = null } = {}) {
  try {
    const media = matchMediaRoute(method, pathname);
    if (media) return { status: 200, body: await media.fn({ params, body, user }, media.id) };
    if (pathname.startsWith("/api/media/")) return { status: 404, body: { error: "Rota inexistente" } };

    const route = ROUTES[pathname];
    if (!route) return { status: 404, body: { error: "Rota inexistente" } };
    if (method !== "GET") return { status: 405, body: { error: "Método não permitido" } };
    if (!existsSync(WAREHOUSE_FILE)) return { status: 503, body: { error: "Warehouse ainda nao foi gerado. Rode npm run pipeline." } };
    return { status: 200, body: await withWarehouse((q) => route(q, params)) };
  } catch (err) {
    if (err instanceof ApiInputError) return { status: err.status, body: { error: err.message } };
    console.error(err);
    return { status: 500, body: { error: "Erro interno" } };
  }
}
