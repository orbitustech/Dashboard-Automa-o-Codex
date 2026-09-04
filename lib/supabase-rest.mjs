const DEFAULT_SUPABASE_URL = "https://nbbprjduqtndkwbknyud.supabase.co";

// Sem fallback para a chave anonima de proposito: com RLS ligado ela nao le
// nada, e o processo falharia em silencio (lendo zero linhas) em vez de avisar.
export function supabaseConfig(options = {}) {
  const key = options.key || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY nao configurada. As tabelas usam RLS e a chave anonima nao acessa nada.");
  }
  return {
    url: options.url || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
    key
  };
}

export async function supabaseRest(path, options = {}) {
  const config = supabaseConfig(options.config);
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase ${response.status}: ${detail}`);
  }

  if (response.status === 204) return null;
  return response.json();
}
