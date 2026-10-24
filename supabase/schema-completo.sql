-- Obrix — esquema completo em tabelas (obras, itens, compras, histórico e cronograma)
-- Cole em: Supabase > SQL Editor > New query > Run.
--
-- ATENÇÃO: este script recria as 7 tabelas do Obrix (apaga o conteúdo delas, se houver).
-- Não mexe em nenhuma outra tabela do seu projeto.
--
-- Todas as chaves são por usuário: (user_id, id). Os ids são gerados pelo app e só precisam
-- ser únicos dentro dos dados de cada usuário. Cada linha só é visível ao seu dono (RLS).

drop view  if exists public.v_obras_resumo;
drop table if exists public.medicoes    cascade;
drop table if exists public.tarefas     cascade;
drop table if exists public.cronogramas cascade;
drop table if exists public.historico   cascade;
drop table if exists public.compras     cascade;
drop table if exists public.itens       cascade;
drop table if exists public.obras       cascade;

-- ───────────────────────── OBRAS (controle AC21) ─────────────────────────
create table public.obras (
  user_id     uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  id          bigint not null,
  nome        text   not null,
  codigo      text   not null default '',
  local       text   not null default '',
  responsavel text   not null default '',
  inicio      date,
  fim         date,
  ac21        numeric(14,2) not null default 0 check (ac21 >= 0),
  status      text   not null default 'Em Andamento'
              check (status in ('Em Andamento','Planejamento','Concluída','Suspensa')),
  obs         text   not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.itens (
  user_id    uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  id         bigint not null,
  obra_id    bigint not null,
  descricao  text   not null,
  categoria  text   not null default 'Outros',
  tipo       text   not null default 'orcado' check (tipo in ('orcado','nao_orcado')),
  orcado     numeric(14,2) not null default 0 check (orcado >= 0),
  pago       numeric(14,2) not null default 0 check (pago >= 0),
  fornecedor text   not null default '',
  nf         text   not null default '',
  data       date,
  obs        text   not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, obra_id) references public.obras (user_id, id) on delete cascade
);
create index itens_obra_idx on public.itens (user_id, obra_id);

create table public.compras (
  user_id    uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  id         bigint not null,
  obra_id    bigint not null,
  descricao  text   not null,
  categoria  text   not null default 'Outros',
  fornecedor text   not null default '',
  cnpj       text   not null default '',
  nf         text   not null default '',
  data       date,
  qtde       numeric(14,3) not null default 0,
  unidade    text   not null default '',
  unitario   numeric(14,2) not null default 0,
  total      numeric(14,2) not null default 0 check (total >= 0),
  status     text   not null default 'Pendente' check (status in ('Pago','Pendente','Parcial')),
  obs        text   not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, obra_id) references public.obras (user_id, id) on delete cascade
);
create index compras_obra_idx on public.compras (user_id, obra_id);

create table public.historico (
  user_id uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  id      bigint not null,
  ts      timestamptz not null default now(),
  tipo    text   not null,
  icone   text   not null default '',
  texto   text   not null,
  usuario text   not null default 'Gerente',
  primary key (user_id, id)
);
create index historico_ts_idx on public.historico (user_id, ts desc);

-- ───────────────────────── CRONOGRAMA (um por obra) ─────────────────────────
create table public.cronogramas (
  user_id     uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  obra_id     bigint not null,
  nome        text   not null default '',
  contrato    text   not null default '',
  empresa     text   not null default '',
  responsavel text   not null default '',
  contato_pmo text   not null default '',
  observacoes text   not null default '',
  inicio      date,
  data_status date,
  trabalha_sabado  boolean not null default false,
  trabalha_domingo boolean not null default false,
  feriados    date[] not null default '{}',
  zoom        text   not null default 's' check (zoom in ('d','s','m','q')),
  baseline    boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (user_id, obra_id),
  foreign key (user_id, obra_id) references public.obras (user_id, id) on delete cascade
);

create table public.tarefas (
  user_id   uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  obra_id   bigint not null,
  id        text   not null,               -- id gerado pelo app (usado nas predecessoras)
  ordem     integer not null,
  nome      text   not null default '',
  nivel     smallint not null default 0 check (nivel between 0 and 8),
  duracao   numeric(8,2) not null default 1 check (duracao >= 0),
  inicio_manual date,
  predecessoras jsonb not null default '[]'::jsonb,   -- [{id, tipo: TI|II|TT|IT, lag}]
  peso      numeric(10,2),
  pct       numeric(5,2) not null default 0 check (pct between 0 and 100),
  inicio_real date,
  fim_real    date,
  responsavel text not null default '',
  marco     boolean not null default false,
  fechado   boolean not null default false,
  base_inicio date,                        -- linha de base
  base_fim    date,
  primary key (user_id, obra_id, id),
  foreign key (user_id, obra_id) references public.cronogramas (user_id, obra_id) on delete cascade
);
create index tarefas_ordem_idx on public.tarefas (user_id, obra_id, ordem);

create table public.medicoes (
  user_id uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  obra_id bigint not null,
  data    date   not null,
  pct     numeric(5,2) not null check (pct between 0 and 100),
  primary key (user_id, obra_id, data),
  foreign key (user_id, obra_id) references public.cronogramas (user_id, obra_id) on delete cascade
);

-- ───────────────────────── updated_at automático ─────────────────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['obras','itens','compras','cronogramas'] loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$s
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ───────────────────────── segurança (RLS) ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['obras','itens','compras','historico','cronogramas','tarefas','medicoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s_proprio" on public.%1$I for all to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ───────────────────────── resumo por obra (comprometido, pago, saldo) ─────────────────────────
create view public.v_obras_resumo with (security_invoker = true) as
select
  o.user_id, o.id, o.nome, o.codigo, o.status, o.ac21,
  coalesce(i.orcado, 0) + coalesce(c.total_todas, 0)                   as comprometido,
  coalesce(i.pago, 0)   + coalesce(c.total_pagas, 0)                   as pago,
  o.ac21 - (coalesce(i.pago, 0) + coalesce(c.total_pagas, 0))          as saldo,
  case when o.ac21 > 0
       then round((coalesce(i.orcado, 0) + coalesce(c.total_todas, 0)) / o.ac21 * 100, 1)
       else 0 end                                                       as pct_comprometido
from public.obras o
left join (select user_id, obra_id, sum(orcado) orcado, sum(pago) pago
           from public.itens group by user_id, obra_id) i on i.user_id = o.user_id and i.obra_id = o.id
left join (select user_id, obra_id, sum(total) total_todas,
                  sum(total) filter (where status = 'Pago') total_pagas
           from public.compras group by user_id, obra_id) c on c.user_id = o.user_id and c.obra_id = o.id;

grant select on public.v_obras_resumo to authenticated;
