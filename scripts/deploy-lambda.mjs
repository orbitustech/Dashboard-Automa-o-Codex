// Empacota lambda/ + lib/ e publica na Lambda koinops-backend.
//
// Uso:
//   node scripts/deploy-lambda.mjs
//
// Requer AWS CLI logada: aws sso login --profile orbitus
//
// Enquanto o provider OIDC do GitHub nao existir na conta AWS, este script e a
// forma de publicar o backend. Quando o time de infra criar o provider, o
// .github/workflows/deploy-backend.yml passa a fazer isso sozinho a cada push
// e este script vira apenas um fallback manual.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

const PROFILE = process.env.AWS_PROFILE || "orbitus";
const REGION = process.env.AWS_REGION || "us-east-2";
const FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME || "koinops-backend";
const ZIP_PATH = "function.zip";

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// Zip escrito na mao (sem dependencia externa, mantendo a regra do projeto de
// zero dependencias). Os nomes vao sempre com "/" — a Lambda nao le entradas
// gravadas com "\" do Windows.
function buildZip() {
  if (existsSync(ZIP_PATH)) rmSync(ZIP_PATH);
  const files = [...walk("lambda"), ...walk("lib")];
  const local = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = relative(".", file).split(sep).join("/");
    const nameBuf = Buffer.from(name, "utf8");
    const data = readFileSync(file);
    const compressed = deflateRawSync(data);
    const sum = crc32(data);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(sum, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);
    local.push(header, nameBuf, compressed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0, 14);
    entry.writeUInt32LE(sum, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt16LE(0, 30);
    entry.writeUInt16LE(0, 32);
    entry.writeUInt16LE(0, 34);
    entry.writeUInt16LE(0, 36);
    entry.writeUInt32LE(0, 38);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);

    offset += header.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  writeFileSync(ZIP_PATH, Buffer.concat([...local, centralBuf, end]));
  return files.length;
}

function aws(args) {
  return execFileSync("aws", [...args, "--profile", PROFILE, "--region", REGION], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"]
  });
}

const count = buildZip();
console.log(`Empacotados ${count} arquivos em ${ZIP_PATH}.`);

if (process.argv.includes("--build-only")) {
  console.log("Modo --build-only: zip gerado, nada publicado.");
  process.exit(0);
}

aws([
  "lambda", "update-function-code",
  "--function-name", FUNCTION_NAME,
  "--zip-file", `fileb://${ZIP_PATH}`,
  "--publish"
]);
console.log("Codigo enviado. Aguardando a Lambda ficar pronta...");

aws(["lambda", "wait", "function-updated", "--function-name", FUNCTION_NAME]);
console.log(`Lambda ${FUNCTION_NAME} atualizada com sucesso.`);
