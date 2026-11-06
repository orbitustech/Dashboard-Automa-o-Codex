import { test } from "node:test";
import assert from "node:assert/strict";
import { pickXLabels, stackLabels } from "../web/charts.js";

const gaps = (xs) => xs.slice(1).map((x, i) => x - xs[i]);

test("rotulos do eixo X nunca ficam a menos de 48px, e o ultimo sempre aparece", () => {
  // 30 dias num grafico estreito e num largo, como o mes da Previsao.
  for (const plotWidth of [260, 420, 700, 1100]) {
    const step = plotWidth / 29;
    const xOf = (i) => 56 + step * i;
    const picked = pickXLabels(30, xOf);
    assert.equal(picked.at(-1), 29, `ultimo dia some em ${plotWidth}px`);
    assert.equal(picked[0], 0);
    assert.ok(gaps(picked.map(xOf)).every((g) => g >= 48), `rotulos encostam em ${plotWidth}px`);
  }
  assert.deepEqual(pickXLabels(1, () => 0), [0]);
  assert.deepEqual(pickXLabels(0, () => 0), []);
});

test("rotulos do fim da linha sao empilhados sem encostar e sem sair do grafico", () => {
  // Caso real da tela: projecao 97,5 mil e orcamento 92,0 mil quase na mesma altura.
  const out = stackLabels([{ y: 40, text: "97,5 mil" }, { y: 48, text: "Orcamento" }], 18, 240);
  assert.ok(out[1].y - out[0].y >= 16);
  assert.equal(out[0].text, "97,5 mil", "a ordem de cima para baixo se mantem");

  // Encostados no fundo: sobem em vez de sair por baixo.
  const low = stackLabels([{ y: 238 }, { y: 239 }], 18, 240);
  assert.ok(low[1].y <= 240 && low[1].y - low[0].y >= 16);

  // Encostados no topo: descem em vez de sair por cima.
  const high = stackLabels([{ y: 10 }, { y: 12 }], 18, 240);
  assert.ok(high[0].y >= 18 && high[1].y - high[0].y >= 16);

  // Longe um do outro: ficam onde estao.
  assert.deepEqual(stackLabels([{ y: 50 }, { y: 150 }], 18, 240).map((l) => l.y), [50, 150]);
});
