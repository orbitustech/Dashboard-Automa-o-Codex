import { test } from "node:test";
import assert from "node:assert/strict";
import { periodRange, lastThursdayBefore } from "../server/periods.mjs";
import { sourceStatus } from "../server/api.mjs";
import { budgetRows, parseCsv } from "../extract/sources/forecast-sheet.mjs";
import { toRawRecord, LEAD_FIELDS } from "../extract/sources/internal.mjs";
import { chunkRange, addDays } from "../extract/lib/dates.mjs";
import { defaultWindow } from "../extract/run.mjs";

test("semana de sexta a quinta termina na ultima quinta antes de hoje", () => {
  assert.equal(lastThursdayBefore("2026-10-27"), "2026-10-22"); // terca
  assert.equal(lastThursdayBefore("2026-10-23"), "2026-10-22"); // sexta: a semana que acabou ontem
  assert.equal(lastThursdayBefore("2026-10-22"), "2026-10-15"); // quinta ainda nao fechou
  const p = periodRange("semana", "2026-10-27");
  assert.deepEqual([p.start, p.end, p.prevStart, p.prevEnd], ["2026-10-16", "2026-10-22", "2026-10-09", "2026-10-15"]);
  assert.match(p.label, /^Sexta 16\/10 a quinta 22\/10/);
});

test("mes compara com o mesmo trecho do mes anterior", () => {
  const p = periodRange("mes", "2026-10-27");
  assert.deepEqual([p.start, p.end, p.prevStart, p.prevEnd], ["2026-10-01", "2026-10-27", "2026-09-01", "2026-09-27"]);
});

test("periodo desconhecido cai na semana", () => {
  assert.equal(periodRange("xpto", "2026-10-27").key, "semana");
});

test("status da fonte: erro, nao configurada, atrasada e em dia", () => {
  const now = new Date("2026-10-27T16:00:00-03:00");
  const base = { kind: "ads", sla_hours: 30, last_status: "ok", last_ok_at: "2026-10-27 06:04:00" };
  assert.equal(sourceStatus(base, now).label, "Em dia");
  assert.equal(sourceStatus({ ...base, last_status: "error", last_error_code: "token_expired" }, now).label, "Token vencido");
  assert.equal(sourceStatus({ ...base, last_status: "skipped" }, now).status, "nao_configurada");
  assert.equal(sourceStatus({ ...base, last_ok_at: "2026-10-25 06:04:00" }, now).status, "atrasada");
  assert.equal(sourceStatus({ ...base, kind: "sheet", sla_hours: 192, last_ok_at: "2026-10-01 18:10:00" }, now).label, "Não atualizada na semana");
});

test("planilha: CSV com aspas e colunas obrigatorias", () => {
  const csv = 'mes,marca,canal,orcamento,meta_leads,meta_vendas\n2026-10,"Savvy · carteirinha FESN",Meta,"R$ 20.800,00",626,119\n';
  assert.deepEqual(parseCsv(csv)[1], ["2026-10", "Savvy · carteirinha FESN", "Meta", "R$ 20.800,00", "626", "119"]);
  assert.equal(budgetRows(csv)[0].orcamento, "R$ 20.800,00");
  assert.throws(() => budgetRows("mes,marca\n2026-10,X\n"), /colunas/);
});

test("contrato de exportacao bloqueia dado pessoal", () => {
  const ok = toRawRecord("panel_protege", { marca: "protege_facil", lead_id: "1", etapas: [{ etapa: "lead", data: "x" }] }, LEAD_FIELDS);
  assert.equal(ok.etapas, '[{"etapa":"lead","data":"x"}]');
  assert.equal(ok.gclid, null);
  assert.throws(() => toRawRecord("panel_protege", { lead_id: "1", telefone: "11999999999" }, LEAD_FIELDS), /dado pessoal/);
});

test("janelas: TikTok em blocos de 30 dias, anuncios reprocessam 7 dias ate ontem", () => {
  const chunks = chunkRange("2026-01-01", "2026-03-15", 30);
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks[0], ["2026-01-01", "2026-01-30"]);
  assert.equal(chunks.at(-1)[1], "2026-03-15");
  assert.deepEqual(defaultWindow({ kind: "ads", reprocess_days: 7 }, "2026-10-27"), { from: "2026-10-20", to: addDays("2026-10-27", -1) });
});
