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
  enabled: true,
  forceLogin: true,
  signupEnabled: true,
  provider: "aws-cognito",
  cognitoDomain: "https://koinops-nicolas-sandbox.auth.us-east-2.amazoncognito.com",
  clientId: "3035tmlje9mph30ngbbdl75p00",
  redirectUri: "https://dashboard-redes-automatico.vercel.app/dashboard/",
  logoutUri: "https://dashboard-redes-automatico.vercel.app/dashboard/",
  scopes: "openid email profile"
};
