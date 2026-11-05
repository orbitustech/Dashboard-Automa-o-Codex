// Datas sempre como string YYYY-MM-DD no fuso de Sao Paulo, que e o fuso
// das contas de anuncio e da apresentacao de sexta.
export const TZ = "America/Sao_Paulo";

export function ymd(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
}

export function eachDay(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// Divide [from, to] em janelas de no maximo `size` dias (TikTok aceita 30).
export function chunkRange(from, to, size) {
  const out = [];
  for (let start = from; start <= to; start = addDays(start, size)) {
    const end = addDays(start, size - 1);
    out.push([start, end < to ? end : to]);
  }
  return out;
}

export function weekday(day) {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}
