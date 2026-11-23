// Acesso ao Supabase. Toda leitura e gravação passa por aqui.
const CFG = window.FESTA_CONFIG || {};
// lido antes do Supabase limpar o endereço: volta do link de "Esqueci a senha"
export const recuperando = /type=recovery/.test(location.hash);
export const linkErro = /error_code=|error=access_denied/.test(location.hash);
export const configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && !/COLE_AQUI/.test(CFG.SUPABASE_URL + CFG.SUPABASE_ANON_KEY));
export const sb = configured && window.supabase ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;
export const orgDomain = CFG.DOMINIO_LOGIN || '';

export const TABLES = ['config', 'pessoas', 'insumos', 'pratos', 'itens', 'decor'];
const ORDER = { config: 'id', pessoas: 'criado_em', insumos: 'nome', pratos: 'nome', itens: 'nome', decor: 'nome' };

function fail(error) { const e = new Error(traduz(error)); e.raw = error; throw e; }
export function traduz(error) {
  const m = (error && (error.message || error.error_description)) || String(error || '');
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/rate limit|only request this after/i.test(m)) return 'Muitos pedidos seguidos. Espere alguns minutos e tente de novo.';
  if (/should be different/i.test(m)) return 'A senha nova precisa ser diferente da atual.';
  if (/at least 6|weak password/i.test(m)) return 'Senha fraca: use pelo menos 6 caracteres.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sem conexão com o servidor. Confira a internet.';
  if (/row-level security|permission denied/i.test(m)) return 'Sem permissão para isso. Entre como organizador.';
  if (/Sem permissão/i.test(m)) return 'Este celular não tem permissão para alterar essa pessoa.';
  return m || 'Erro desconhecido.';
}

export async function load(table) {
  const { data, error } = await sb.from(table).select('*').order(ORDER[table] || 'id');
  if (error) fail(error);
  return data || [];
}
export async function loadContatos() {
  const { data, error } = await sb.from('contatos').select('*');
  if (error) return [];
  return data || [];
}
export async function insert(table, rows) {
  const { data, error } = await sb.from(table).insert(rows).select();
  if (error) fail(error);
  return data;
}
export async function update(table, id, patch) {
  const { error } = await sb.from(table).update(patch).eq('id', id);
  if (error) fail(error);
}
export async function remove(table, id) {
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) fail(error);
}
export async function upsert(table, row) {
  const { error } = await sb.from(table).upsert(row);
  if (error) fail(error);
}
export async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) fail(error);
  return data;
}

// ----- login de organizador -----
export async function session() { const { data } = await sb.auth.getSession(); return data.session; }
export async function login(user, senha) {
  const email = user.includes('@') || !orgDomain ? user.trim() : `${user.trim().toLowerCase()}@${orgDomain}`;
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) fail(error);
  return data.session;
}
export async function recuperarSenha(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.href.split('#')[0] });
  if (error) fail(error);
}
export async function novaSenha(senha) {
  const { error } = await sb.auth.updateUser({ password: senha });
  if (error) fail(error);
}
export async function logout() { await sb.auth.signOut(); }
export function onAuth(cb) { sb.auth.onAuthStateChange((_e, s) => cb(s)); }

// ----- tempo real: avisa quando outra pessoa mudou algo -----
export function subscribe(cb) {
  try {
    sb.channel('festa').on('postgres_changes', { event: '*', schema: 'public' }, p => cb(p.table)).subscribe();
  } catch (e) { /* sem tempo real: o app recarrega de tempos em tempos */ }
}
