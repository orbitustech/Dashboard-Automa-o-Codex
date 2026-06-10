export const PESQUISA_PREMIOS_BRAND = {
  name: "Pesquisa Premios",
  url: "https://pesquisapremios.com/",
  objective: "Usuario entrar no site e responder pesquisas",
  audience: "Pessoas de 18 a 45 anos, com tempo para responder pesquisas e interesse em ganhar algo em troca dentro das regras do site.",
  rewards: ["Netflix R$35", "Netflix R$50", "iFood R$35", "iFood R$50", "Spotify R$35"],
  palette: "dark navy #0f172a / #111827, amarelo #ffcc00, verde #22c55e / teal #14b8a6, branco para texto",
  imageStyle: "Pesquisa Premios brand palette, dark navy background, yellow highlights, green CTA accents, one Brazilian adult when useful, survey app UI, named gift cards Netflix R$35/R$50, iFood R$35/R$50 and Spotify R$35, no money imagery, no official logos",
  rules: [
    "Nao prometer Pix ou qualquer outra forma de pagamento.",
    "Nao mencionar ou prometer recargas; o produto nao oferece recargas.",
    "Nao prometer saque, renda, lucro, premio certo, ganho garantido ou mudanca de vida.",
    "Nao usar linguagem de aposta, jogo de azar ou promessa financeira.",
    "Sempre tratar Coins como pontos internos do site.",
    "Sempre deixar claro que recompensas dependem de disponibilidade, estoque, campanha, perfil e regras."
  ]
};

export function pesquisaPremiosRewardText() {
  return PESQUISA_PREMIOS_BRAND.rewards.join(", ");
}

export function pesquisaPremiosRulesText() {
  return PESQUISA_PREMIOS_BRAND.rules.join(" ");
}

export function pesquisaPremiosContextText() {
  return [
    `Nome do site: ${PESQUISA_PREMIOS_BRAND.name}`,
    `URL: ${PESQUISA_PREMIOS_BRAND.url}`,
    `Objetivo: ${PESQUISA_PREMIOS_BRAND.objective}`,
    `Publico: ${PESQUISA_PREMIOS_BRAND.audience}`,
    `Recompensas permitidas: ${pesquisaPremiosRewardText()}.`,
    `Paleta visual: ${PESQUISA_PREMIOS_BRAND.palette}.`,
    `Regras: ${pesquisaPremiosRulesText()}`
  ].join("\n");
}
