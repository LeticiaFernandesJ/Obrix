-- LEGADO: o app agora usa as tabelas de supabase/schema-completo.sql. Este arquivo não é mais necessário.
-- (Se você já salvou dados aqui, eles são importados automaticamente no primeiro login.)
-- Obrix - esquema do Supabase
-- Cole este arquivo inteiro em: Supabase > SQL Editor > New query > Run.
-- Uma linha por usuário, contendo as obras, itens, compras, histórico e cronogramas.

create table if not exists public.obrix_dados (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  revision   integer     not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.obrix_dados enable row level security;

-- Cada usuário enxerga e altera apenas a própria linha.
drop policy if exists "obrix_dados_select_own" on public.obrix_dados;
drop policy if exists "obrix_dados_insert_own" on public.obrix_dados;
drop policy if exists "obrix_dados_update_own" on public.obrix_dados;
drop policy if exists "obrix_dados_delete_own" on public.obrix_dados;

create policy "obrix_dados_select_own" on public.obrix_dados
  for select to authenticated using (user_id = (select auth.uid()));
create policy "obrix_dados_insert_own" on public.obrix_dados
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "obrix_dados_update_own" on public.obrix_dados
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "obrix_dados_delete_own" on public.obrix_dados
  for delete to authenticated using (user_id = (select auth.uid()));

-- Sem acesso para visitantes não autenticados.
revoke all on public.obrix_dados from anon;
grant select, insert, update, delete on public.obrix_dados to authenticated;
