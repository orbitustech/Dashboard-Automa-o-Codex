window.KOINOPS_SUPABASE = {
  url: "https://nbbprjduqtndkwbknyud.supabase.co",
  anonKey: "sb_publishable_q4AiMHgZ-zx-88KMCRiNFg_OpztyQZv"
};

window.KOINOPS_BACKEND = {
  // Se publicar no Vercel, coloque aqui a URL do projeto. Ex:
  // baseUrl: "https://seu-projeto.vercel.app"
  baseUrl: "https://dashboard-redes-automatico.vercel.app"
};

window.KOINOPS_AUTH = {
  enabled: false,
  provider: "aws-cognito",
  cognitoDomain: "",
  clientId: "",
  redirectUri: "https://dashboard-redes-automatico.vercel.app/dashboard/",
  logoutUri: "https://dashboard-redes-automatico.vercel.app/dashboard/",
  scopes: "openid email profile"
};
