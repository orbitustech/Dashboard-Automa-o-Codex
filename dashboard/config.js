window.KOINOPS_SUPABASE = {
  url: "https://nbbprjduqtndkwbknyud.supabase.co",
  anonKey: "sb_publishable_q4AiMHgZ-zx-88KMCRiNFg_OpztyQZv"
};

window.KOINOPS_BACKEND = {
  // Backend na AWS Lambda (Function URL). Publique com:
  // node scripts/deploy-lambda.mjs
  baseUrl: "https://7klvpt3aodrou2ywmwvbghwkwi0dszzw.lambda-url.us-east-2.on.aws"
};

window.KOINOPS_AUTH = {
  enabled: true,
  forceLogin: true,
  signupEnabled: true,
  provider: "aws-cognito",
  cognitoDomain: "https://koinops-nicolas-sandbox.auth.us-east-2.amazoncognito.com",
  clientId: "3035tmlje9mph30ngbbdl75p00",
  redirectUri: "https://orbitustech.github.io/Dashboard-Automa-o-Codex/dashboard/",
  logoutUri: "https://orbitustech.github.io/Dashboard-Automa-o-Codex/dashboard/",
  scopes: "openid email profile"
};
