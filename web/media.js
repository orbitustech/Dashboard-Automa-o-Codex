// Metade Midia: Conteudo (kanban com aprovacao) e Redes (perfis por marca).
// Recebe as pecas do app.js para seguir o mesmo visual e o mesmo roteador.

const COLUMNS = {
  rascunho: { label: "Rascunho", hint: "Escrevendo" },
  aprovacao: { label: "Aprovação", hint: "Esperando revisão" },
  agendado: { label: "Agendado", hint: "Aprovado, sai na data" },
  publicado: { label: "Publicado", hint: "No ar" }
};

const ACTIONS = {
  rascunho: [{ to: "aprovacao", label: "Enviar para aprovação", primary: true }],
  aprovacao: [{ to: "agendado", label: "Aprovar e agendar", primary: true }, { to: "rascunho", label: "Devolver para rascunho", needsNote: true }],
  agendado: [{ to: "rascunho", label: "Cancelar agendamento" }],
  publicado: []
};

export function mediaPages({ main, api, send, esc, head, route, brands }) {
  const ui = { brand: "", open: null, error: "" };

  const fmtWhen = (iso) => (iso ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso)) : "sem data");
  // datetime-local trabalha sem fuso; o valor salvo e ISO (UTC).
  const toLocalInput = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const brandSelect = (id, value, { all = false } = {}) => `<select id="${id}" aria-label="Marca">
    ${all ? '<option value="">Todas as marcas</option>' : ""}${brands().map((b) => `<option value="${b.brand_id}"${b.brand_id === value ? " selected" : ""}>${esc(b.short_name)}</option>`).join("")}</select>`;
  const errorBox = () => (ui.error ? `<div class="form-error" role="alert">${esc(ui.error)}</div>` : "");

  async function act(fn) {
    try {
      ui.error = "";
      await fn();
    } catch (err) {
      ui.error = err.message;
    }
    route();
  }

  // ------------------------------------------------------------ conteudo

  function card(item, networks) {
    return `<button class="kcard${ui.open === item.id ? " on" : ""}" type="button" data-open="${item.id}">
      <span class="mono muted">${esc(item.brand_name)}</span>
      <span class="ktitle">${esc(item.title || item.caption?.slice(0, 60) || "Sem título")}</span>
      <span class="kmeta">${item.networks.map((n) => `<span class="pill muted">${esc(networks[n])}</span>`).join("")}
        ${item.scheduled_for ? `<span class="faint">${esc(fmtWhen(item.scheduled_for))}</span>` : ""}</span>
    </button>`;
  }

  function editor(item, networks) {
    const editable = item.status === "rascunho";
    const dis = editable ? "" : " disabled";
    const last = [...item.history].reverse().find((h) => h.note);
    return `<section class="card editor" aria-label="Conteúdo selecionado">
      <div class="card-head"><h2>${esc(item.title || "Sem título")}</h2>
        <span class="pill ${item.status === "publicado" ? "good" : "muted"}">${COLUMNS[item.status].label}</span></div>
      ${last && item.status === "rascunho" ? `<div class="callout"><strong>Devolvido:</strong> ${esc(last.note)}</div>` : ""}
      <form id="content-form" class="form">
        <label>Marca<select name="brand_id"${dis}>${brands().map((b) => `<option value="${b.brand_id}"${b.brand_id === item.brand_id ? " selected" : ""}>${esc(b.short_name)}</option>`).join("")}</select></label>
        <label>Título interno<input name="title" value="${esc(item.title)}"${dis}></label>
        <label>Legenda<textarea name="caption" rows="6"${dis}>${esc(item.caption)}</textarea></label>
        <fieldset><legend>Redes</legend>${Object.entries(networks).map(([k, label]) =>
          `<label class="check"><input type="checkbox" name="networks" value="${k}"${item.networks.includes(k) ? " checked" : ""}${dis}> ${esc(label)}</label>`).join("")}</fieldset>
        <label>Link da publicação<input name="link_url" type="url" placeholder="https://" value="${esc(item.link_url)}"${dis}></label>
        <label>Publicar em<input name="scheduled_for" type="datetime-local" value="${toLocalInput(item.scheduled_for)}"${dis}></label>
        ${editable ? '<div class="actions"><button class="btn" type="submit">Salvar</button></div>' : ""}
      </form>
      ${Object.entries(item.links || {}).filter(([, l]) => l).length ? `<div class="links"><div class="mono muted">Links com UTM (o hub atribui os leads a este post)</div>
        ${Object.entries(item.links).filter(([, l]) => l).map(([n, l]) => `<div><span class="pill muted">${esc(networks[n])}</span> <code>${esc(l)}</code></div>`).join("")}</div>` : ""}
      ${errorBox()}
      <div class="actions">
        ${ACTIONS[item.status].map((a) => `<button class="btn${a.primary ? " primary" : ""}" type="button" data-move="${a.to}"${a.needsNote ? " data-note" : ""}>${esc(a.label)}</button>`).join("")}
        ${item.status === "rascunho" ? '<button class="btn danger" type="button" id="content-delete">Apagar</button>' : ""}
      </div>
      <textarea id="move-note" class="note-input" rows="2" placeholder="O que precisa mudar (obrigatório para devolver)"${item.status === "aprovacao" ? "" : " hidden"}></textarea>
      <details class="history"><summary>Histórico</summary><ol>${item.history.map((h) =>
        `<li><span class="faint">${esc(fmtWhen(h.at))}</span> ${esc(h.by)}: ${h.from ? `${esc(COLUMNS[h.from].label)} → ` : "criou em "}${esc(COLUMNS[h.to].label)}${h.note ? ` · “${esc(h.note)}”` : ""}</li>`).join("")}</ol></details>
    </section>`;
  }

  function formFields(form) {
    const data = new FormData(form);
    const local = data.get("scheduled_for");
    return {
      brand_id: data.get("brand_id"),
      title: data.get("title") || "",
      caption: data.get("caption") || "",
      networks: data.getAll("networks"),
      link_url: data.get("link_url") || "",
      scheduled_for: local ? new Date(local).toISOString() : null
    };
  }

  async function conteudo() {
    const d = await api("media/content", { brand: ui.brand });
    const item = d.items.find((i) => i.id === ui.open);
    main.innerHTML = `
      ${head({ eyebrow: "Mídia", title: "Conteúdo", sub: "Rascunho → aprovação → agendado → publicado. Só rascunho é editável.",
        controls: `<div class="filters">${brandSelect("c-brand", ui.brand, { all: true })}
          <button class="btn primary" type="button" id="c-new">Novo conteúdo</button></div>` })}
      ${!item ? errorBox() : ""}
      <section class="kanban">${d.statuses.map((s) => {
        const col = d.items.filter((i) => i.status === s);
        return `<div class="kcol"><div class="khead"><strong>${COLUMNS[s].label}</strong><span class="faint">${col.length}</span></div>
          <div class="note">${COLUMNS[s].hint}</div>
          ${col.map((i) => card(i, d.networks)).join("") || '<div class="kempty faint">Nada aqui</div>'}</div>`;
      }).join("")}</section>
      ${item ? editor(item, d.networks) : ""}`;

    document.getElementById("c-brand").addEventListener("change", (e) => { ui.brand = e.target.value; ui.open = null; route(); });
    document.getElementById("c-new").addEventListener("click", () => act(async () => {
      const created = await send("POST", "media/content", { brand_id: ui.brand || brands()[0].brand_id, title: "Novo conteúdo" });
      ui.open = created.id;
    }));
    main.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => {
      ui.open = ui.open === b.dataset.open ? null : b.dataset.open;
      ui.error = "";
      route();
    }));
    if (!item) return;
    const form = document.getElementById("content-form");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      act(() => send("PATCH", `media/content/${item.id}`, formFields(form)));
    });
    main.querySelectorAll("[data-move]").forEach((b) => b.addEventListener("click", () => act(() => {
      const body = { status: b.dataset.move };
      if (item.status === "rascunho") Object.assign(body, formFields(form));
      if (b.hasAttribute("data-note")) body.note = document.getElementById("move-note").value;
      return send("PATCH", `media/content/${item.id}`, body);
    })));
    document.getElementById("content-delete")?.addEventListener("click", () => act(async () => {
      await send("DELETE", `media/content/${item.id}`);
      ui.open = null;
    }));
  }

  // ------------------------------------------------------------ redes

  async function redes() {
    const d = await api("media/accounts");
    const byBrand = d.brands.map((b) => ({ ...b, accounts: d.accounts.filter((a) => a.brand_id === b.brand_id) }));
    main.innerHTML = `
      ${head({ eyebrow: "Mídia", title: "Redes", sub: "Perfis oficiais de cada marca. O token fica no Secrets Manager; aqui só o nome do segredo." })}
      <section class="card flush">
        <div class="table-wrap"><table>
          <thead><tr><th>Marca</th><th class="left">Rede</th><th class="left">Perfil</th><th class="left">ID na API</th><th class="left">Segredo do token</th><th class="left">Situação</th><th></th></tr></thead>
          <tbody>${byBrand.map((b) => b.accounts.length ? b.accounts.map((a, i) => `<tr>
            <td class="name">${i ? "" : esc(b.name)}</td><td class="left">${esc(d.networks[a.network])}</td><td class="left">@${esc(a.handle)}</td>
            <td class="left tag">${esc(a.external_id || "—")}</td><td class="left tag">${esc(a.secret_name || "—")}</td>
            <td class="left"><button class="btn small" type="button" data-toggle="${a.id}" data-active="${a.active}">${a.active ? '<span class="good">● Ativo</span>' : '<span class="faint">○ Pausado</span>'}</button></td>
            <td><button class="btn small danger" type="button" data-remove="${a.id}" aria-label="Remover @${esc(a.handle)}">Remover</button></td></tr>`).join("")
            : `<tr><td class="name">${esc(b.name)}</td><td class="left faint" colspan="6">Nenhum perfil cadastrado</td></tr>`).join("")}</tbody>
        </table></div>
      </section>
      <section class="card">
        <h2>Adicionar perfil</h2>
        <form id="acc-form" class="form inline">
          <label>Marca${brandSelect("acc-brand", ui.brand || d.brands[0].brand_id)}</label>
          <label>Rede<select name="network">${Object.entries(d.networks).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select></label>
          <label>Perfil<input name="handle" placeholder="@perfil" required></label>
          <label>ID na API<input name="external_id" placeholder="IG User ID numérico"></label>
          <label>Segredo do token<input name="secret_name" placeholder="hub/instagram/marca"></label>
          <div class="actions"><button class="btn primary" type="submit">Adicionar</button></div>
        </form>
        ${errorBox()}
      </section>`;

    document.getElementById("acc-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      data.brand_id = document.getElementById("acc-brand").value;
      ui.brand = data.brand_id;
      act(() => send("POST", "media/accounts", data));
    });
    main.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", () =>
      act(() => send("PATCH", `media/accounts/${b.dataset.toggle}`, { active: b.dataset.active !== "true" }))));
    main.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () =>
      act(() => send("DELETE", `media/accounts/${b.dataset.remove}`))));
  }

  return { conteudo, redes };
}
