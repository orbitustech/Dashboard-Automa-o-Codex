function plainText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function isVideoDraftAutomation(automation) {
  const text = plainText(`${automation?.name || ""} ${automation?.output || ""}`);
  return text.includes("video") && (text.includes("rascunho") || text.includes("conteudo") || text.includes("post"));
}

export function isContentDraftAutomation(automation) {
  if (isVideoDraftAutomation(automation)) return false;
  const text = plainText(`${automation?.name || ""} ${automation?.output || ""}`);
  return text.includes("post organico") || (text.includes("rascunho") && text.includes("conteudo"));
}

export function automationSlot(automation) {
  const text = plainText(`${automation?.name || ""} ${automation?.schedule || ""}`);
  return text.includes("18") ? "18h" : "14h";
}
