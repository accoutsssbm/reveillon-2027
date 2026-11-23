-- Réveillon 2027 · organizadores
-- Deixa a admin principal cadastrar outros organizadores pela tela do app.
-- Rode no SQL Editor depois do 01_schema.sql. Pode rodar de novo sem problema.
--
-- ANTES DE RODAR: troque SEU_USUARIO@familia.festa (lá no fim) pelo SEU e-mail de login,
-- exatamente como aparece em Authentication > Users.

create table if not exists public.org_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.org_admins enable row level security;
revoke all on public.org_admins from anon, authenticated;

create or replace function public.sou_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_admins where user_id = auth.uid());
$$;

create or replace function public.listar_organizadores()
returns table (email text, criado_em timestamptz, admin boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'Só a admin principal pode ver os organizadores.'; end if;
  return query
    select u.email::text, u.created_at, exists (select 1 from public.org_admins a where a.user_id = u.id)
    from auth.users u order by u.created_at;
end $$;

create or replace function public.criar_organizador(p_email text, p_senha text)
returns void language plpgsql security definer set search_path = public as $$
declare
  em text := lower(trim(p_email));
  uid uuid := gen_random_uuid();
begin
  if not public.sou_admin() then raise exception 'Só a admin principal pode cadastrar organizadores.'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Usuário ou e-mail inválido.'; end if;
  if length(coalesce(p_senha, '')) < 6 then raise exception 'Senha fraca: use pelo menos 6 caracteres.'; end if;
  if exists (select 1 from auth.users where lower(email) = em) then raise exception 'Esse usuário já existe.'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em,
    extensions.crypt(p_senha, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

  insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (uid, uid::text, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true), 'email', now(), now(), now());
end $$;

create or replace function public.redefinir_senha_organizador(p_email text, p_senha text)
returns void language plpgsql security definer set search_path = public as $$
declare em text := lower(trim(p_email));
begin
  if not public.sou_admin() then raise exception 'Só a admin principal pode redefinir senhas.'; end if;
  if length(coalesce(p_senha, '')) < 6 then raise exception 'Senha fraca: use pelo menos 6 caracteres.'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')), updated_at = now()
  where lower(email) = em;
  if not found then raise exception 'Organizador não encontrado.'; end if;
end $$;

create or replace function public.remover_organizador(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare em text := lower(trim(p_email)); alvo uuid;
begin
  if not public.sou_admin() then raise exception 'Só a admin principal pode remover organizadores.'; end if;
  select id into alvo from auth.users where lower(email) = em;
  if alvo is null then raise exception 'Organizador não encontrado.'; end if;
  if exists (select 1 from public.org_admins where user_id = alvo) then raise exception 'A admin principal não pode ser removida.'; end if;
  delete from auth.users where id = alvo;  -- leva junto o login e as sessões dele
end $$;

revoke all on function public.redefinir_senha_organizador(text, text) from public, anon;
revoke all on function public.remover_organizador(text) from public, anon;
grant execute on function public.redefinir_senha_organizador(text, text) to authenticated;
grant execute on function public.remover_organizador(text) to authenticated;

revoke all on function public.sou_admin() from public, anon;
revoke all on function public.listar_organizadores() from public, anon;
revoke all on function public.criar_organizador(text, text) from public, anon;
grant execute on function public.sou_admin() to authenticated;
grant execute on function public.listar_organizadores() to authenticated;
grant execute on function public.criar_organizador(text, text) to authenticated;

-- ---------- quem é a admin principal ----------
do $$
declare em text := lower('SEU_USUARIO@familia.festa');  -- <<< TROQUE AQUI
begin
  if not exists (select 1 from auth.users where lower(email) = em) then
    raise exception 'Não achei o usuário % em Authentication > Users. Corrija o e-mail na linha marcada e rode de novo.', em;
  end if;
  insert into public.org_admins (user_id) select id from auth.users where lower(email) = em on conflict do nothing;
end $$;
