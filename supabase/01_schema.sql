-- =====================================================================
-- Réveillon em Família 2027 — estrutura do banco (Supabase / Postgres)
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- Depois rode 02_catalogo.sql para carregar pratos, insumos e decoração.
-- Pode rodar de novo sem perder dados: é assim que se aplica uma versão nova.
--
-- Quem pode o quê:
--   Convidado (sem login, chave "anon"): lê as informações da festa,
--     confirma presença, cadastra a família, escolhe o que vai levar e
--     sugere prato — sempre por meio das funções no fim deste arquivo.
--   Organizador (com login e senha): edita tudo, inclusive preços e
--     pagamentos, e vê os telefones.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- configuração geral (uma linha só) ----------
create table if not exists public.config (
  id          int primary key default 1 check (id = 1),
  evento      text not null default 'Réveillon em família 2027',
  data        text not null default '31/12/2026',
  local       text not null default '',
  pix_tipo    text not null default 'telefone' check (pix_tipo in ('cpf','cnpj','telefone','email','aleatoria')),
  pix_chave   text not null default '',
  pix_nome    text not null default '',
  pix_cidade  text not null default '',
  whats_org   text not null default '',
  fc          numeric not null default 0.5,   -- quanto uma criança come (fração de um adulto)
  fcota       numeric not null default 0,     -- quanto uma criança paga (fração da cota)
  limite      int not null default 3,         -- tarefas por pessoa antes de alertar
  atualizado_em timestamptz not null default now()
);

-- ---------- pessoas ----------
create table if not exists public.pessoas (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null check (char_length(nome) between 1 and 80),
  tipo      text not null default 'adulto' check (tipo in ('adulto','crianca')),
  status    text not null default 'pend' check (status in ('sim','talvez','pend','nao')),
  dorme     boolean not null default false,
  de        uuid references public.pessoas(id) on delete set null,  -- "família de": quem é o responsável da família
  pago      numeric not null default 0,
  criado_em timestamptz not null default now()
);
-- no responsável da família: true = uma cobrança só para a família; false = cada um paga a sua parte
alter table public.pessoas add column if not exists cobrar_junto boolean not null default true;

-- telefone fica separado: só organizador lê
create table if not exists public.contatos (
  pessoa_id uuid primary key references public.pessoas(id) on delete cascade,
  telefone  text not null default ''
);

-- código que o celular do convidado guarda para editar a própria participação
create table if not exists public.pessoa_tokens (
  pessoa_id uuid primary key references public.pessoas(id) on delete cascade,
  token     uuid not null default gen_random_uuid()
);

-- ---------- catálogo ----------
create table if not exists public.insumos (
  id     text primary key default gen_random_uuid()::text,
  nome   text not null,
  un     text not null default 'un',
  preco  numeric not null default 0,
  grupo  text not null default 'Outros',
  est    boolean not null default false     -- true = preço ainda é estimativa
);

create table if not exists public.pratos (
  id           text primary key default gen_random_uuid()::text,
  nome         text not null,
  cat          text not null default 'principal'
               check (cat in ('entrada','principal','acompanhamento','sobremesa','mesa','cafe')),
  rende        numeric not null default 10,   -- serve quantas pessoas com a receita base
  sel          boolean not null default false, -- está no cardápio
  resp         uuid references public.pessoas(id) on delete set null,
  ing          jsonb not null default '[]'::jsonb,  -- [{"i": id_do_insumo, "q": quantidade}]
  sugerido_por uuid references public.pessoas(id) on delete set null,
  criado_em    timestamptz not null default now()
);

create table if not exists public.itens (
  id     text primary key default gen_random_uuid()::text,
  nome   text not null,
  cat    text not null check (cat in ('bebida','descartavel','aluguel')),
  tipo   text not null default 'rende' check (tipo in ('fixo','rende')),
  n      numeric not null default 1,   -- fixo: quantidade | rende: 1 unidade atende n pessoas
  conta  text not null default 'todos' check (conta in ('todos','dorme')),
  un     text not null default 'un',
  preco  numeric not null default 0,
  sel    boolean not null default true,
  resp   uuid references public.pessoas(id) on delete set null,
  est    boolean not null default false
);

create table if not exists public.decor (
  id     text primary key default gen_random_uuid()::text,
  nome   text not null,
  local  text not null default 'Outros',
  descr  text not null default '',
  busca  text not null default '',
  sel    boolean not null default false,
  resp   uuid references public.pessoas(id) on delete set null,
  mat    jsonb not null default '[]'::jsonb  -- [{"n": nome, "q": qtd, "un": un, "p": preço, "est": bool}]
);

insert into public.config (id) values (1) on conflict (id) do nothing;

-- ---------- segurança (RLS) ----------
alter table public.config        enable row level security;
alter table public.pessoas       enable row level security;
alter table public.contatos      enable row level security;
alter table public.pessoa_tokens enable row level security;
alter table public.insumos       enable row level security;
alter table public.pratos        enable row level security;
alter table public.itens         enable row level security;
alter table public.decor         enable row level security;

do $$
declare t text;
begin
  foreach t in array array['config','pessoas','insumos','pratos','itens','decor'] loop
    execute format('drop policy if exists "todos leem" on public.%I', t);
    execute format('drop policy if exists "organizador edita" on public.%I', t);
    execute format('create policy "todos leem" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "organizador edita" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

drop policy if exists "organizador ve telefones" on public.contatos;
create policy "organizador ve telefones" on public.contatos
  for all to authenticated using (true) with check (true);

-- tokens: ninguém lê direto, só as funções abaixo
revoke all on public.pessoa_tokens from anon, authenticated;

-- ---------- funções usadas pela tela do convidado ----------
create or replace function public._token_ok(pid uuid, tk uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from pessoa_tokens where pessoa_id = pid and token = tk);
$$;
revoke all on function public._token_ok(uuid, uuid) from public, anon, authenticated;

-- Cadastra uma ou mais pessoas (a família toda de uma vez).
-- lista = [{"nome","tipo","status","dorme","telefone","junto"}].
-- Todos ficam na família da primeira pessoa da lista ("junto" na primeira = cobrar a família junto).
-- p_familia + p_tk: adiciona as pessoas a uma família que este celular já cadastrou.
drop function if exists public.registrar(jsonb);
create or replace function public.registrar(lista jsonb, p_familia uuid default null, p_tk uuid default null)
returns table (id uuid, token uuid, nome text)
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; novo uuid; tk uuid; chefe uuid; v_tipo text; v_status text; v_nome text; v_tel text;
begin
  if p_familia is not null then
    if not _token_ok(p_familia, p_tk) then raise exception 'Sem permissão'; end if;
    select coalesce(pessoas.de, pessoas.id) into chefe from pessoas where pessoas.id = p_familia;
  end if;
  if jsonb_typeof(lista) <> 'array' or jsonb_array_length(lista) = 0 then
    raise exception 'Lista vazia';
  end if;
  if jsonb_array_length(lista) > 40 then
    raise exception 'Máximo de 40 pessoas por vez';
  end if;
  for r in select * from jsonb_array_elements(lista) loop
    v_nome := left(btrim(coalesce(r->>'nome','')), 80);
    continue when v_nome = '';
    v_tipo := case when r->>'tipo' = 'crianca' then 'crianca' else 'adulto' end;
    v_status := case when r->>'status' in ('sim','talvez','pend','nao') then r->>'status' else 'sim' end;
    insert into pessoas (nome, tipo, status, dorme, de, cobrar_junto)
    values (v_nome, v_tipo, v_status, coalesce((r->>'dorme')::boolean, false), chefe,
            coalesce((r->>'junto')::boolean, true))
    returning pessoas.id into novo;
    if chefe is null then chefe := novo; end if;
    insert into pessoa_tokens (pessoa_id) values (novo) returning pessoa_tokens.token into tk;
    v_tel := left(regexp_replace(coalesce(r->>'telefone',''), '[^0-9+]', '', 'g'), 20);
    if v_tel <> '' then insert into contatos (pessoa_id, telefone) values (novo, v_tel); end if;
    id := novo; token := tk; nome := v_nome;
    return next;
  end loop;
end $$;

-- Convidado altera a própria participação.
create or replace function public.atualizar_participacao(
  pid uuid, tk uuid, p_nome text, p_tipo text, p_status text, p_dorme boolean, p_telefone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _token_ok(pid, tk) then raise exception 'Sem permissão'; end if;
  update pessoas set
    nome   = coalesce(nullif(left(btrim(p_nome), 80), ''), nome),
    tipo   = case when p_tipo in ('adulto','crianca') then p_tipo else tipo end,
    status = case when p_status in ('sim','talvez','pend','nao') then p_status else status end,
    dorme  = coalesce(p_dorme, dorme)
  where id = pid;
  if p_telefone is not null then
    insert into contatos (pessoa_id, telefone)
    values (pid, left(regexp_replace(p_telefone, '[^0-9+]', '', 'g'), 20))
    on conflict (pessoa_id) do update set telefone = excluded.telefone;
  end if;
end $$;

-- Convidado assume (ou larga) um prato, uma decoração ou um item.
create or replace function public.assumir(pid uuid, tk uuid, p_tabela text, p_item text, p_liberar boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not _token_ok(pid, tk) then raise exception 'Sem permissão'; end if;
  if p_tabela = 'pratos' then
    if p_liberar then update pratos set resp = null where id = p_item and resp = pid;
    else update pratos set resp = pid where id = p_item and resp is null and sel; end if;
  elsif p_tabela = 'decor' then
    if p_liberar then update decor set resp = null where id = p_item and resp = pid;
    else update decor set resp = pid where id = p_item and resp is null and sel; end if;
  elsif p_tabela = 'itens' then
    if p_liberar then update itens set resp = null where id = p_item and resp = pid;
    else update itens set resp = pid where id = p_item and resp is null and sel; end if;
  else
    raise exception 'Tabela inválida';
  end if;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Convidado cadastra um prato que vai levar (receita digitada em texto).
-- p_ing = [{"i": id existente} ou {"nome": "...", "un": "kg"}, com "q": quantidade]
-- Insumos novos entram com preço 0 para o organizador preencher.
create or replace function public.sugerir_prato(
  pid uuid, tk uuid, p_nome text, p_cat text, p_rende numeric, p_ing jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare r jsonb; ins_id text; lista jsonb := '[]'::jsonb; novo text;
begin
  if not _token_ok(pid, tk) then raise exception 'Sem permissão'; end if;
  if coalesce(btrim(p_nome), '') = '' then raise exception 'Informe o nome do prato'; end if;
  if jsonb_typeof(p_ing) <> 'array' or jsonb_array_length(p_ing) > 40 then raise exception 'Ingredientes inválidos'; end if;
  for r in select * from jsonb_array_elements(p_ing) loop
    ins_id := null;
    if r ? 'i' then select id into ins_id from insumos where id = r->>'i'; end if;
    if ins_id is null and coalesce(btrim(r->>'nome'), '') <> '' then
      select id into ins_id from insumos where lower(nome) = lower(btrim(r->>'nome')) limit 1;
      if ins_id is null then
        insert into insumos (nome, un, preco, grupo, est)
        values (left(btrim(r->>'nome'), 60), left(coalesce(nullif(r->>'un',''), 'un'), 12), 0, 'Sem preço', false)
        returning id into ins_id;
      end if;
    end if;
    if ins_id is not null then
      lista := lista || jsonb_build_object('i', ins_id, 'q', greatest(coalesce((r->>'q')::numeric, 1), 0));
    end if;
  end loop;
  insert into pratos (nome, cat, rende, sel, resp, ing, sugerido_por)
  values (left(btrim(p_nome), 80),
          case when p_cat in ('entrada','principal','acompanhamento','sobremesa','mesa','cafe') then p_cat else 'principal' end,
          greatest(coalesce(p_rende, 10), 1), true, pid, lista, pid)
  returning id into novo;
  return novo;
end $$;

-- Responsável da família escolhe cobrar junto ou separado.
create or replace function public.cobranca_familia(pid uuid, tk uuid, p_junto boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _token_ok(pid, tk) then raise exception 'Sem permissão'; end if;
  update pessoas set cobrar_junto = coalesce(p_junto, true) where id = pid;
end $$;

grant execute on function public.registrar(jsonb, uuid, uuid) to anon, authenticated;
grant execute on function public.cobranca_familia(uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.atualizar_participacao(uuid, uuid, text, text, text, boolean, text) to anon, authenticated;
grant execute on function public.assumir(uuid, uuid, text, text, boolean) to anon, authenticated;
grant execute on function public.sugerir_prato(uuid, uuid, text, text, numeric, jsonb) to anon, authenticated;

-- ---------- atualização ao vivo (Realtime) ----------
do $$
declare t text;
begin
  foreach t in array array['config','pessoas','insumos','pratos','itens','decor','contatos'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null;  -- já estava adicionada ou publicação inexistente
    end;
  end loop;
end $$;
