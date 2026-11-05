import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileStore, setStore } from "../server/store.mjs";
import { handleApi } from "../server/handler.mjs";
import { utmLink } from "../server/media.mjs";

const call = (method, pathname, body, params = {}) => handleApi(pathname, params, { method, body });
const tomorrow = () => new Date(Date.now() + 86400000).toISOString();

beforeEach(() => setStore(fileStore(mkdtempSync(path.join(tmpdir(), "hub-store-")))));

test("link do post sai com UTM no padrao que o hub entende como organico", () => {
  const url = new URL(utmLink("https://pesquisapremios.com.br/cadastro?ref=x", {
    brand: { campaign_tokens: ["PesquisaPremios"] }, network: "instagram", contentId: "abc"
  }));
  assert.equal(url.searchParams.get("ref"), "x");
  assert.equal(url.searchParams.get("utm_source"), "instagram");
  assert.equal(url.searchParams.get("utm_medium"), "social");
  assert.equal(url.searchParams.get("utm_campaign"), "ORB | PesquisaPremios | Conteudo | Instagram");
  assert.equal(url.searchParams.get("utm_content"), "abc");
  assert.equal(utmLink("sem-protocolo", { brand: { campaign_tokens: ["X"] }, network: "threads", contentId: "a" }), null);
});

test("conteudo anda no kanban so com o que cada etapa pede", async () => {
  const created = await call("POST", "/api/media/content", { brand_id: "pesquisa_premios", title: "Sorteio", networks: ["instagram"] });
  assert.equal(created.status, 200);
  const id = created.body.id;
  assert.equal(created.body.status, "rascunho");

  let r = await call("PATCH", `/api/media/content/${id}`, { status: "aprovacao" });
  assert.equal(r.status, 400, "sem legenda nao vai para aprovacao");

  r = await call("PATCH", `/api/media/content/${id}`, { caption: "Participe!", link_url: "https://pesquisapremios.com.br", status: "aprovacao" });
  assert.equal(r.body.status, "aprovacao");
  assert.match(r.body.links.instagram, /utm_campaign=ORB/);

  r = await call("PATCH", `/api/media/content/${id}`, { caption: "outra" });
  assert.equal(r.status, 400, "em aprovacao nao edita");

  r = await call("PATCH", `/api/media/content/${id}`, { status: "rascunho" });
  assert.equal(r.status, 400, "devolver pede o motivo");
  r = await call("PATCH", `/api/media/content/${id}`, { status: "rascunho", note: "trocar a imagem" });
  assert.equal(r.body.status, "rascunho");

  await call("PATCH", `/api/media/content/${id}`, { scheduled_for: tomorrow(), status: "aprovacao" });
  r = await call("PATCH", `/api/media/content/${id}`, { status: "agendado" });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /perfil ativo no Instagram/);

  await call("POST", "/api/media/accounts", { brand_id: "pesquisa_premios", network: "instagram", handle: "@pesquisapremios" });
  r = await call("PATCH", `/api/media/content/${id}`, { status: "agendado" });
  assert.equal(r.body.status, "agendado");
  assert.deepEqual(r.body.history.map((h) => h.to), ["rascunho", "aprovacao", "rascunho", "aprovacao", "agendado"]);

  r = await call("PATCH", `/api/media/content/${id}`, { status: "publicado" });
  assert.equal(r.status, 400, "publicado so pelo publicador");
});

test("entrada invalida volta 400 ou 404, nunca 500", async () => {
  assert.equal((await call("POST", "/api/media/content", { brand_id: "nao_existe" })).status, 400);
  const { body: draft } = await call("POST", "/api/media/content", { brand_id: "savvy_fesn" });
  assert.equal((await call("PATCH", `/api/media/content/${draft.id}`, { brand_id: "nao_existe" })).status, 400);
  assert.equal((await call("PATCH", `/api/media/content/${draft.id}`, { brand_id: "roda_facil" })).body.brand_id, "roda_facil");
  assert.equal((await call("POST", "/api/media/content", { brand_id: "savvy_fesn", networks: ["orkut"] })).status, 400);
  assert.equal((await call("POST", "/api/media/content", { brand_id: "savvy_fesn", link_url: "pesquisa.com" })).status, 400);
  assert.equal((await call("PATCH", "/api/media/content/nao-existe", { title: "x" })).status, 404);
  assert.equal((await call("POST", "/api/media/accounts", { brand_id: "savvy_fesn", network: "instagram", handle: " " })).status, 400);
  assert.equal((await call("GET", "/api/media/nada")).status, 404);
  assert.equal((await call("POST", "/api/overview")).status, 405);
});

test("perfil guarda so o nome do segredo, sem @ e com filtro por marca", async () => {
  await call("POST", "/api/media/accounts", { brand_id: "savvy_fesn", network: "threads", handle: "@savvy", secret_name: "hub/threads/savvy", token: "nao-guardar" });
  await call("POST", "/api/media/accounts", { brand_id: "protege_facil", network: "instagram", handle: "protege" });
  const r = await call("GET", "/api/media/accounts", null, { brand: "savvy_fesn" });
  assert.equal(r.body.accounts.length, 1);
  const [a] = r.body.accounts;
  assert.equal(a.handle, "savvy");
  assert.equal(a.secret_name, "hub/threads/savvy");
  assert.equal("token" in a, false);
});
