// Graficos em SVG puro, desenhados na largura real do container (texto nunca
// escala junto). Regras: um eixo so, uma serie por grafico (ou serie +
// referencia), linha 2px, coluna <= 24px com ponta arredondada, grade
// discreta, tooltip no hover e tabela equivalente ao lado.

const NS = "http://www.w3.org/2000/svg";

function niceMax(v) {
  if (!v || v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * exp >= v) return m * exp;
  return 10 * exp;
}

function compact(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1e3) return `${(n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Desenha de novo quando o container muda de largura.
function responsive(container, draw) {
  container.classList.add("chart");
  let last = 0;
  const render = () => {
    const w = Math.round(container.clientWidth);
    if (!w || w === last) return;
    last = w;
    draw(w);
  };
  new ResizeObserver(render).observe(container);
  render();
}

function tooltip(container) {
  let tip = container.querySelector(".tooltip");
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "tooltip";
    tip.hidden = true;
    container.appendChild(tip);
  }
  return {
    show(x, y, html) { tip.innerHTML = html; tip.style.left = `${x}px`; tip.style.top = `${y}px`; tip.hidden = false; },
    hide() { tip.hidden = true; }
  };
}

function yAxis(max, h, pad, width, fmt) {
  const ticks = [0, max / 2, max];
  return `<g class="grid">${ticks.map((t) => {
    const y = pad.top + h - (t / max) * h;
    return `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y}" y2="${y}"/>`;
  }).join("")}</g>
  <g class="axis">${ticks.map((t) => {
    const y = pad.top + h - (t / max) * h;
    return `<text x="${pad.left - 8}" y="${y + 4}" text-anchor="end">${esc(fmt(t))}</text>`;
  }).join("")}</g>`;
}

// Rotulos do eixo X espacados pela distancia real em pixels: o ultimo sempre
// aparece, e qualquer outro que ficaria a menos de minGap dele (ou do anterior)
// e pulado. Antes era "um a cada N", e o ultimo encostava no penultimo.
export function pickXLabels(n, xOf, minGap = 48) {
  if (!n) return [];
  const last = n - 1;
  const picked = [];
  let prevX = -Infinity;
  for (let i = 0; i < last; i++) {
    const x = xOf(i);
    if (x - prevX >= minGap && xOf(last) - x >= minGap) {
      picked.push(i);
      prevX = x;
    }
  }
  picked.push(last);
  return picked;
}

function xLabels(points, xOf, y) {
  return `<g class="axis">${pickXLabels(points.length, xOf).map((i) =>
    `<text x="${xOf(i)}" y="${y}" text-anchor="middle">${esc(points[i].label)}</text>`).join("")}</g>`;
}

// Rotulos no fim das linhas: ordena por altura e empurra para nao encostarem
// (gap = altura de uma linha de texto), sem sair da area do grafico.
export function stackLabels(items, top, bottom, gap = 16) {
  const out = [...items].sort((a, b) => a.y - b.y).map((it) => ({ ...it }));
  for (let k = 1; k < out.length; k++) out[k].y = Math.max(out[k].y, out[k - 1].y + gap);
  const overflow = out.length ? out.at(-1).y - bottom : 0;
  if (overflow > 0) out.forEach((it) => { it.y -= overflow; });
  for (let k = out.length - 2; k >= 0; k--) out[k].y = Math.min(out[k].y, out[k + 1].y - gap);
  if (out.length && out[0].y < top) {
    const shift = top - out[0].y;
    out.forEach((it) => { it.y += shift; });
  }
  return out;
}

// Colunas de uma serie. data: [{ label, value, tip }]
export function columnChart(container, data, { height = 150, format = compact, highlight = () => false } = {}) {
  responsive(container, (width) => {
    const pad = { top: 10, right: 12, bottom: 24, left: 52 };
    const h = height - pad.top - pad.bottom;
    const max = niceMax(Math.max(...data.map((d) => d.value), 0));
    const band = (width - pad.left - pad.right) / data.length;
    const bw = Math.min(24, Math.max(2, band - 2));
    const xOf = (i) => pad.left + band * i + band / 2;
    const bars = data.map((d, i) => {
      const bh = Math.max(0, (d.value / max) * h);
      const x = xOf(i) - bw / 2;
      const y = pad.top + h - bh;
      const r = Math.min(4, bw / 2, bh);
      // ponta de cima arredondada, base reta
      const path = bh <= 0 ? "" : `M${x},${pad.top + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${pad.top + h} Z`;
      return `<path class="col${highlight(d, i) ? "" : " dim"}" d="${path}"/>`;
    }).join("");
    const hits = data.map((_, i) => `<rect class="hit" data-i="${i}" x="${pad.left + band * i}" y="${pad.top}" width="${band}" height="${h}"/>`).join("");
    container.innerHTML = `<svg width="${width}" height="${height}" role="img">
      ${yAxis(max, h, pad, width, format)}${bars}${xLabels(data, xOf, height - 6)}${hits}</svg>`;
    const tip = tooltip(container);
    container.querySelectorAll(".hit").forEach((el) => {
      el.addEventListener("mouseenter", () => {
        const d = data[el.dataset.i];
        tip.show(xOf(Number(el.dataset.i)), pad.top + h - (d.value / max) * h, d.tip || `${esc(d.label)}: ${esc(format(d.value))}`);
      });
      el.addEventListener("mouseleave", tip.hide);
    });
  });
}

// Linha de uma serie com area suave, ponto e rotulo no fim, crosshair no hover.
export function lineChart(container, data, { height = 150, format = compact } = {}) {
  responsive(container, (width) => {
    const pad = { top: 14, right: 48, bottom: 24, left: 52 };
    const h = height - pad.top - pad.bottom;
    const max = niceMax(Math.max(...data.map((d) => d.value), 0));
    const step = (width - pad.left - pad.right) / Math.max(1, data.length - 1);
    const xOf = (i) => pad.left + step * i;
    const yOf = (v) => pad.top + h - (v / max) * h;
    const d = data.map((p, i) => `${i ? "L" : "M"}${xOf(i)},${yOf(p.value)}`).join(" ");
    const lastI = data.length - 1;
    container.innerHTML = `<svg width="${width}" height="${height}" role="img">
      ${yAxis(max, h, pad, width, format)}
      <path class="area" d="${d} L${xOf(lastI)},${pad.top + h} L${xOf(0)},${pad.top + h} Z"/>
      <path class="line" d="${d}"/>
      <circle class="dot" r="4" cx="${xOf(lastI)}" cy="${yOf(data[lastI].value)}"/>
      <text class="label strong" x="${xOf(lastI) + 8}" y="${yOf(data[lastI].value) + 4}">${esc(format(data[lastI].value))}</text>
      ${xLabels(data, xOf, height - 6)}
      <line class="crosshair" x1="0" x2="0" y1="${pad.top}" y2="${pad.top + h}" visibility="hidden"/>
      <circle class="dot hover" r="4" visibility="hidden"/>
      <rect class="hit" x="${pad.left}" y="${pad.top}" width="${width - pad.left - pad.right}" height="${h}"/></svg>`;
    crosshair(container, data.length, xOf, (i) => [{ y: yOf(data[i].value) }], (i) => data[i].tip || `${esc(data[i].label)}: ${esc(format(data[i].value))}`);
  });
}

function crosshair(container, n, xOf, dotsAt, html) {
  const svg = container.querySelector("svg");
  const hit = svg.querySelector(".hit");
  const line = svg.querySelector(".crosshair");
  const dots = [...svg.querySelectorAll(".dot.hover")];
  const tip = tooltip(container);
  hit.addEventListener("mousemove", (e) => {
    const box = svg.getBoundingClientRect();
    const x = e.clientX - box.left;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(xOf(i) - x) < Math.abs(xOf(best) - x)) best = i;
    const cx = xOf(best);
    line.setAttribute("x1", cx); line.setAttribute("x2", cx); line.setAttribute("visibility", "visible");
    const ys = dotsAt(best);
    dots.forEach((dot, k) => {
      if (ys[k]?.y === undefined || ys[k].y === null) { dot.setAttribute("visibility", "hidden"); return; }
      dot.setAttribute("cx", cx); dot.setAttribute("cy", ys[k].y); dot.setAttribute("visibility", "visible");
    });
    tip.show(cx, Math.min(...ys.map((p) => p.y ?? Infinity).filter(Number.isFinite)), html(best));
  });
  hit.addEventListener("mouseleave", () => {
    line.setAttribute("visibility", "hidden");
    dots.forEach((dot) => dot.setAttribute("visibility", "hidden"));
    tip.hide();
  });
}

// Investimento acumulado no mes: realizado (linha), projecao (tracejada, com
// faixa) e o ritmo do orcamento como linha de referencia cinza.
export function cumulativeChart(container, { days, actual, projected, budget }, { height = 260, format = compact } = {}) {
  responsive(container, (width) => {
    const pad = { top: 14, right: 124, bottom: 24, left: 56 };
    const h = height - pad.top - pad.bottom;
    const max = niceMax(Math.max(budget || 0, ...projected.map((p) => p.high), ...actual.map((p) => p.value)));
    const step = (width - pad.left - pad.right) / Math.max(1, days.length - 1);
    const idx = Object.fromEntries(days.map((d, i) => [d, i]));
    const xOf = (i) => pad.left + step * i;
    const yOf = (v) => pad.top + h - (v / max) * h;
    const path = (pts, key = "value") => pts.map((p, i) => `${i ? "L" : "M"}${xOf(idx[p.date])},${yOf(p[key])}`).join(" ");
    const bandPath = projected.length
      ? `${path(projected, "high")} ${[...projected].reverse().map((p) => `L${xOf(idx[p.date])},${yOf(p.low)}`).join(" ")} Z` : "";
    const budgetAt = (i) => (budget ? (budget * (i + 1)) / days.length : null);
    const lastA = actual.at(-1);
    const lastP = projected.at(-1);
    const labels = days.map((d) => ({ label: `${d.slice(8, 10)}/${d.slice(5, 7)}` }));
    // Projecao e orcamento terminam no mesmo dia: os dois rotulos dividem a
    // mesma coluna e sao empilhados para nao se sobreporem.
    const ends = stackLabels([
      ...(lastP ? [{ y: yOf(lastP.value) + 4, cls: "label strong", text: format(lastP.value) }] : []),
      ...(budget ? [{ y: yOf(budget) + 4, cls: "label", text: `Orçamento ${format(budget)}` }] : [])
    ], pad.top + 4, pad.top + h + 4);
    container.innerHTML = `<svg width="${width}" height="${height}" role="img">
      ${yAxis(max, h, pad, width, format)}
      ${budget ? `<path class="line reference" d="M${xOf(0)},${yOf(budgetAt(0))} L${xOf(days.length - 1)},${yOf(budget)}"/>` : ""}
      ${ends.map((l) => `<text class="${l.cls}" x="${xOf(days.length - 1) + 8}" y="${l.y}">${esc(l.text)}</text>`).join("")}
      ${bandPath ? `<path class="band" d="${bandPath}"/>` : ""}
      ${projected.length ? `<path class="line projection" d="${path(projected)}"/>` : ""}
      <path class="line" d="${path(actual)}"/>
      ${lastA ? `<circle class="dot" r="4" cx="${xOf(idx[lastA.date])}" cy="${yOf(lastA.value)}"/>` : ""}
      ${xLabels(labels, xOf, height - 6)}
      <line class="crosshair" x1="0" x2="0" y1="${pad.top}" y2="${pad.top + h}" visibility="hidden"/>
      <circle class="dot hover" r="4" visibility="hidden"/>
      <rect class="hit" x="${pad.left}" y="${pad.top}" width="${width - pad.left - pad.right}" height="${h}"/></svg>`;
    const actualBy = Object.fromEntries(actual.map((p) => [p.date, p]));
    const projBy = Object.fromEntries(projected.map((p) => [p.date, p]));
    crosshair(container, days.length, xOf, (i) => {
      const a = actualBy[days[i]];
      const p = projBy[days[i]];
      return [{ y: a ? yOf(a.value) : p ? yOf(p.value) : null }];
    }, (i) => {
      const day = days[i];
      const a = actualBy[day];
      const p = projBy[day];
      const lines = [`<strong>${labels[i].label}</strong>`];
      if (a) lines.push(`Realizado: ${esc(format(a.value))}`);
      if (p && !a) lines.push(`Projeção: ${esc(format(p.value))}`, `Faixa: ${esc(format(p.low))} a ${esc(format(p.high))}`);
      if (budget) lines.push(`Ritmo do orçamento: ${esc(format(budgetAt(i)))}`);
      return lines.join("<br>");
    });
  });
}

// Linha minima para tabela (ultimos 7 dias).
export function sparkline(values, { width = 84, height = 24 } = {}) {
  const max = Math.max(...values, 1);
  const step = width / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [i * step, height - 3 - (v / max) * (height - 6)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts.at(-1);
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "spark");
  svg.setAttribute("width", width + 4);
  svg.setAttribute("height", height);
  svg.setAttribute("aria-label", `Leads por dia: ${values.join(", ")}`);
  svg.innerHTML = `<title>Leads por dia: ${values.join(", ")}</title><path d="${d}"/><circle r="2.5" cx="${lx}" cy="${ly}"/>`;
  return svg.outerHTML;
}
