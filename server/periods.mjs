import { addDays, weekday } from "../extract/lib/dates.mjs";

// Os quatro recortes do dashboard. "Sexta a quinta" e a semana fechada
// apresentada na sexta: a quinta-feira mais recente antes de hoje e os 6 dias
// anteriores. Cada recorte vem com o periodo anterior de mesmo tamanho.

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const dm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export const PERIOD_KEYS = ["hoje", "24h", "semana", "mes"];

export function lastThursdayBefore(asOf) {
  let d = addDays(asOf, -1);
  while (weekday(d) !== 4) d = addDays(d, -1);
  return d;
}

export function periodRange(key, asOf) {
  switch (key) {
    case "hoje":
      return { key, start: asOf, end: asOf, prevStart: addDays(asOf, -1), prevEnd: addDays(asOf, -1),
        label: `Hoje, ${dm(asOf)} · comparado a ontem`, compareLabel: "vs. ontem" };
    case "24h":
      return { key, start: addDays(asOf, -1), end: asOf, prevStart: addDays(asOf, -3), prevEnd: addDays(asOf, -2),
        label: `Ontem e hoje, ${dm(addDays(asOf, -1))} a ${dm(asOf)}`, compareLabel: "vs. 2 dias antes" };
    case "mes": {
      const start = `${asOf.slice(0, 7)}-01`;
      const elapsed = Number(asOf.slice(8, 10)) - 1;
      const prevStart = addDays(start, -1).slice(0, 7) + "-01";
      return { key, start, end: asOf, prevStart, prevEnd: addDays(prevStart, elapsed),
        label: `Mês até hoje, ${dm(start)} a ${dm(asOf)} · comparado ao mesmo trecho do mês anterior`, compareLabel: "vs. mês anterior" };
    }
    case "semana":
    default: {
      const end = lastThursdayBefore(asOf);
      const start = addDays(end, -6);
      return { key: "semana", start, end, prevStart: addDays(start, -7), prevEnd: addDays(end, -7),
        label: `${cap(WEEKDAYS[weekday(start)])} ${dm(start)} a ${WEEKDAYS[weekday(end)]} ${dm(end)} · comparado à semana anterior`,
        compareLabel: "na semana" };
    }
  }
}
