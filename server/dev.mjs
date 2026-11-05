import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../extract/lib/config.mjs";
import { handleApi } from "./handler.mjs";

// Servidor local: front estatico de web/ + API em /api/*. Na AWS o front vai
// para S3 + CloudFront e a mesma ROUTES roda atras do API Gateway (lambda.mjs).

const PORT = Number(process.env.PORT || 8787);
const WEB = path.join(ROOT, "web");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    let payload = null;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      try {
        payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
      } catch {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify({ error: "JSON inválido" }));
        return;
      }
    }
    const { status, body } = await handleApi(url.pathname, Object.fromEntries(url.searchParams), { method: req.method, body: payload });
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
    return;
  }
  const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const file = path.resolve(WEB, rel);
  if (!file.startsWith(WEB) || !existsSync(file)) {
    res.writeHead(404).end("Nao encontrado");
    return;
  }
  // Sem cache local: editar um .js e recarregar ja pega a versao nova.
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  res.end(await readFile(file));
});

server.listen(PORT, () => console.log(`Hub de marketing em http://localhost:${PORT}`));
