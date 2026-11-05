// Cliente HTTP fino: retry em 429/5xx e erro classificado, para a Saude dos
// dados mostrar "Token vencido" em vez de um stack trace.

export class ApiError extends Error {
  constructor(message, { status, code = "http_error", body } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson(url, { classify, retries = 3, ...init } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      if (attempt < retries) { await sleep(1000 * 2 ** attempt); continue; }
      throw new ApiError(`Falha de rede: ${err.message}`, { code: "network" });
    }
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }

    if (res.ok) {
      // Algumas APIs (TikTok) devolvem 200 com erro no corpo.
      const bodyError = classify?.(res.status, body);
      if (bodyError) throw new ApiError(bodyError.message, { status: res.status, code: bodyError.code, body });
      return body;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(Number(res.headers.get("retry-after")) * 1000 || 2000 * 2 ** attempt);
      continue;
    }
    const known = classify?.(res.status, body);
    const code = known?.code || (res.status === 401 ? "auth" : res.status === 429 ? "rate_limited" : "http_error");
    throw new ApiError(known?.message || `HTTP ${res.status}: ${String(text).slice(0, 300)}`, { status: res.status, code, body });
  }
}
