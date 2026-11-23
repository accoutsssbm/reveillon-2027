// Preencha com os dados do seu projeto Supabase:
// Supabase > Project Settings > API (ou "Data API" / "API Keys").
// A chave "anon" (public) pode ficar no GitHub: quem protege os dados são as regras (RLS) do banco.
// NUNCA coloque aqui a chave "service_role".
window.FESTA_CONFIG = {
  SUPABASE_URL: 'https://ygvmjgblscasjzwxltex.supabase.co',        // ex.: https://abcdefghijk.supabase.co
  SUPABASE_ANON_KEY: 'sb_publishable_mPkqJQeFq6IZshe8JCSnWg_Wp1kekNn',

  // Opcional: deixa o organizador entrar só com o usuário (ex.: "maria")
  // em vez do e-mail completo. Com 'familia.festa', "maria" vira maria@familia.festa.
  // Os usuários precisam ser criados no Supabase com esse mesmo e-mail.
  DOMINIO_LOGIN: 'familia.festa'
};
s