import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { ROOT } from "../extract/lib/config.mjs";

// Dados da metade Midia (conteudos, perfis, marcas). A interface e pequena de
// proposito: list/get/put/remove por colecao. Local grava um JSON por colecao;
// na AWS entra outro adaptador com a mesma interface (decisao D4:
// DynamoDB ou Postgres), sem mexer nas rotas nem no front.

export const STORE_DIR = process.env.STORE_DIR || path.join(ROOT, "data", "store");

export function fileStore(dir = STORE_DIR) {
  const fileOf = (collection) => path.join(dir, `${collection}.json`);
  const read = (collection) => (existsSync(fileOf(collection)) ? JSON.parse(readFileSync(fileOf(collection), "utf8")) : {});
  const write = (collection, docs) => {
    mkdirSync(dir, { recursive: true });
    const tmp = `${fileOf(collection)}.tmp`;
    writeFileSync(tmp, JSON.stringify(docs, null, 2));
    renameSync(tmp, fileOf(collection));
  };

  return {
    async list(collection, filter = {}) {
      const entries = Object.entries(filter).filter(([, v]) => v !== undefined && v !== "");
      return Object.values(read(collection)).filter((doc) => entries.every(([k, v]) => doc[k] === v));
    },
    async get(collection, id) {
      return read(collection)[id] || null;
    },
    async put(collection, doc) {
      const docs = read(collection);
      const saved = { ...doc, id: doc.id || randomUUID() };
      docs[saved.id] = saved;
      write(collection, docs);
      return saved;
    },
    async remove(collection, id) {
      const docs = read(collection);
      const existed = Boolean(docs[id]);
      delete docs[id];
      if (existed) write(collection, docs);
      return existed;
    }
  };
}

let current = null;
export function getStore() {
  if (!current) current = fileStore();
  return current;
}
export function setStore(store) {
  current = store;
}
