const DEFAULT_SUPABASE_URL = "https://nbbprjduqtndkwbknyud.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_q4AiMHgZ-zx-88KMCRiNFg_OpztyQZv";

export function supabaseConfig(options = {}) {
  return {
    url: options.url || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
    key: options.key || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY
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
