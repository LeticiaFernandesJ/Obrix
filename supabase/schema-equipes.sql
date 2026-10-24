-- Obrix: equipes, papéis e dados por organização
--
-- Como usar: Supabase > SQL Editor > New query > cole tudo > Run.
-- Serve para instalação nova e também para quem já usa o schema-completo.sql:
--   * os dados antigos são copiados para uma organização ("Minha empresa") de cada usuário;
--   * as tabelas antigas ficam guardadas com o sufixo _v2 (só backup, sem acesso pela API).
--     Depois de conferir que está tudo certo, você pode apagá-las.
-- Pode rodar mais de uma vez.
--
-- Papéis: admin (tudo, gerencia a equipe) | editor (altera os dados) | leitor (só consulta).

-- ───────────────────────── 1) ORGANIZAÇÕES, MEMBROS E CONVITES ─────────────────────────
create table if not exists public.organizacoes (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (length(trim(nome)) > 0),
  criado_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.membros (
  org_id     uuid not null references public.organizacoes(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  email      text not null default '',
  papel      text not null check (papel in ('admin', 'editor', 'leitor', 'personalizado')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists membros_user_idx on public.membros (user_id);
-- nome completo de quem faz parte (vem do cadastro; cada pessoa pode corrigir o próprio)
alter table public.membros add column if not exists nome text not null default '';
-- acesso personalizado: {"obras":"ver|editar", "compras":"nenhum|ver|editar", "cronograma":"...", "historico":"..."}
alter table public.membros add column if not exists permissoes jsonb;
alter table public.membros drop constraint if exists membros_papel_check;
alter table public.membros add constraint membros_papel_check check (papel in ('admin', 'editor', 'leitor', 'personalizado'));

-- Convite por link: o token secreto vai no endereço, vale uma vez e expira.
create table if not exists public.convites (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizacoes(id) on delete cascade,
  token         uuid not null unique default gen_random_uuid(),
  papel         text not null check (papel in ('admin', 'editor', 'leitor', 'personalizado')),
  email         text not null default '',          -- só uma anotação: "para quem é"
  convidado_por uuid references auth.users(id) on delete set null default auth.uid(),
  expira_em     timestamptz not null default (now() + interval '7 days'),
  created_at    timestamptz not null default now()
);
create index if not exists convites_org_idx on public.convites (org_id);
alter table public.convites add column if not exists permissoes jsonb;
alter table public.convites drop constraint if exists convites_papel_check;
alter table public.convites add constraint convites_papel_check check (papel in ('admin', 'editor', 'leitor', 'personalizado'));

-- ───────────────────────── 2) FUNÇÕES AUXILIARES (usadas pelas regras de acesso) ─────────────────────────
create or replace function public.meu_papel(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select papel from public.membros where org_id = p_org and user_id = (select auth.uid())
$$;
create or replace function public.eh_membro(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membros where org_id = p_org and user_id = (select auth.uid()))
$$;
-- Nível de acesso de quem está logado numa área (obras, compras, cronograma, historico): 'nenhum', 'ver' ou 'editar'.
-- Administrador edita tudo; editor edita tudo menos o histórico; leitor só vê; personalizado segue o que o administrador marcou.
create or replace function public.nivel_area(p_org uuid, p_area text) returns text
language sql stable security definer set search_path = '' as $$
  select case m.papel
    when 'admin' then 'editar'
    when 'editor' then case p_area when 'historico' then 'ver' else 'editar' end
    when 'leitor' then 'ver'
    -- 'minhas' (só as tarefas atribuídas a si) só existe no cronograma
    else case when m.permissoes ->> p_area = 'minhas' and p_area <> 'cronograma' then 'ver' else coalesce(m.permissoes ->> p_area, 'ver') end
  end
  from public.membros m where m.org_id = p_org and m.user_id = (select auth.uid())
$$;
create or replace function public.pode_ver(p_org uuid, p_area text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.nivel_area(p_org, p_area), 'nenhum') in ('ver', 'minhas', 'editar')
$$;
create or replace function public.pode_area(p_org uuid, p_area text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.nivel_area(p_org, p_area), 'nenhum') = 'editar'
$$;
-- Pode mexer ao menos nas próprias tarefas (nível 'minhas') ou alterar a área toda.
create or replace function public.pode_minhas(p_org uuid, p_area text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.nivel_area(p_org, p_area), 'nenhum') in ('minhas', 'editar')
$$;
-- Pode alterar alguma coisa (usado para gravar o histórico das alterações).
create or replace function public.pode_editar(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.pode_area(p_org, 'obras') or public.pode_area(p_org, 'compras') or public.pode_minhas(p_org, 'cronograma')
$$;
create or replace function public.eh_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membros where org_id = p_org and user_id = (select auth.uid()) and papel = 'admin')
$$;

-- Cria a organização e já coloca quem criou como administrador.
create or replace function public.criar_organizacao(p_nome text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_email text; v_nome text;
begin
  if (select auth.uid()) is null then raise exception 'É preciso estar logado'; end if;
  if (select count(*) from public.organizacoes where criado_por = (select auth.uid())) >= 5 then
    raise exception 'Limite de organizações atingido';
  end if;
  select email, coalesce(raw_user_meta_data->>'nome', '') into v_email, v_nome from auth.users where id = (select auth.uid());
  insert into public.organizacoes (nome, criado_por) values (trim(p_nome), (select auth.uid())) returning id into v_org;
  insert into public.membros (org_id, user_id, email, nome, papel) values (v_org, (select auth.uid()), coalesce(v_email, ''), coalesce(v_nome, ''), 'admin');
  return v_org;
end $$;

-- Quem abre o link de convite entra na organização com o papel do convite.
create or replace function public.aceitar_convite(p_token uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_conv public.convites%rowtype; v_email text; v_nome text;
begin
  if (select auth.uid()) is null then raise exception 'É preciso estar logado'; end if;
  select * into v_conv from public.convites where token = p_token and expira_em > now();
  if not found then raise exception 'Convite inválido ou expirado'; end if;
  select email, coalesce(raw_user_meta_data->>'nome', '') into v_email, v_nome from auth.users where id = (select auth.uid());
  -- convite com e-mail (campo "para quem" com @): só essa conta entra; o convite continua válido para a pessoa certa
  if position('@' in coalesce(v_conv.email, '')) > 0 and lower(trim(v_conv.email)) <> lower(trim(coalesce(v_email, ''))) then
    raise exception 'Este convite é para outro e-mail';
  end if;
  insert into public.membros (org_id, user_id, email, nome, papel, permissoes)
    values (v_conv.org_id, (select auth.uid()), coalesce(v_email, ''), coalesce(v_nome, ''), v_conv.papel, v_conv.permissoes)
    on conflict (org_id, user_id) do nothing;
  delete from public.convites where id = v_conv.id;
  return v_conv.org_id;
end $$;

-- Cada pessoa corrige o próprio nome (vale em todas as organizações em que participa).
create or replace function public.definir_meu_nome(p_nome text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'É preciso estar logado'; end if;
  update public.membros set nome = left(trim(p_nome), 120) where user_id = (select auth.uid());
end $$;

-- Nunca deixa a organização sem administrador.
create or replace function public.garantir_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.papel = 'admin' and (tg_op = 'DELETE' or new.papel <> 'admin')
     and exists (select 1 from public.organizacoes where id = old.org_id)
     and not exists (select 1 from public.membros where org_id = old.org_id and papel = 'admin' and user_id <> old.user_id) then
    raise exception 'A organização precisa ter pelo menos um administrador';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists trg_garantir_admin on public.membros;
create trigger trg_garantir_admin before update or delete on public.membros
  for each row execute function public.garantir_admin();

revoke all on function public.meu_papel(uuid), public.eh_membro(uuid), public.pode_editar(uuid), public.eh_admin(uuid),
  public.nivel_area(uuid, text), public.pode_ver(uuid, text), public.pode_area(uuid, text), public.pode_minhas(uuid, text),
  public.criar_organizacao(text), public.aceitar_convite(uuid), public.definir_meu_nome(text) from public, anon;
grant execute on function public.meu_papel(uuid), public.eh_membro(uuid), public.pode_editar(uuid), public.eh_admin(uuid),
  public.nivel_area(uuid, text), public.pode_ver(uuid, text), public.pode_area(uuid, text), public.pode_minhas(uuid, text),
  public.criar_organizacao(text), public.aceitar_convite(uuid), public.definir_meu_nome(text) to authenticated;

-- ───────────────────────── 3) GUARDAR OS DADOS ANTIGOS (se existirem) ─────────────────────────
drop view if exists public.v_obras_resumo;

do $$
declare t text; i record;
begin
  perform set_config('obrix.migrar', '', false);
  -- só migra se as tabelas ainda estão no formato antigo (coluna user_id)
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'obras' and column_name = 'user_id') then
    foreach t in array array['medicoes', 'tarefas', 'cronogramas', 'historico', 'compras', 'itens', 'obras'] loop
      execute format('alter table public.%I rename to %I', t, t || '_v2');
      for i in select indexname from pg_indexes where schemaname = 'public' and tablename = t || '_v2' loop
        execute format('alter index public.%I rename to %I', i.indexname, i.indexname || '_v2');
      end loop;
      execute format('alter table public.%I enable row level security', t || '_v2');
      -- as cópias antigas ficam só como backup: sem acesso pela API
      execute format('revoke all on public.%I from anon, authenticated', t || '_v2');
    end loop;
    perform set_config('obrix.migrar', 'sim', false);
  end if;
end $$;

-- ───────────────────────── 4) TABELAS DE DADOS (agora por organização) ─────────────────────────
create table if not exists public.obras (
  org_id      uuid   not null references public.organizacoes(id) on delete cascade,
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
  primary key (org_id, id)
);

create table if not exists public.itens (
  org_id     uuid   not null references public.organizacoes(id) on delete cascade,
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
  primary key (org_id, id),
  foreign key (org_id, obra_id) references public.obras (org_id, id) on delete cascade
);
create index if not exists itens_obra_idx on public.itens (org_id, obra_id);

create table if not exists public.compras (
  org_id     uuid   not null references public.organizacoes(id) on delete cascade,
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
  primary key (org_id, id),
  foreign key (org_id, obra_id) references public.obras (org_id, id) on delete cascade
);
create index if not exists compras_obra_idx on public.compras (org_id, obra_id);
-- fase 2: vencimento do pagamento (instalações anteriores recebem a coluna ao rodar o script de novo)
alter table public.compras add column if not exists vencimento date;

create table if not exists public.historico (
  org_id  uuid   not null references public.organizacoes(id) on delete cascade,
  id      bigint not null,
  ts      timestamptz not null default now(),
  tipo    text   not null,
  icone   text   not null default '',
  texto   text   not null,
  usuario text   not null default '',            -- quem fez (e-mail)
  primary key (org_id, id)
);
create index if not exists historico_ts_idx on public.historico (org_id, ts desc);

-- O histórico é um registro de auditoria: quem grava não escolhe o autor nem a data, ninguém edita e só o administrador apaga.
create or replace function public.historico_carimbar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_quem text;
begin
  select coalesce(nullif(trim(nome), ''), email, '') into v_quem
    from public.membros where org_id = new.org_id and user_id = (select auth.uid());
  new.usuario := coalesce(v_quem, '');
  new.ts := least(coalesce(new.ts, now()), now());
  return new;
end $$;
drop trigger if exists trg_historico_carimbar on public.historico;
create trigger trg_historico_carimbar before insert on public.historico
  for each row execute function public.historico_carimbar();

-- Guarda só os 3000 registros mais recentes de cada organização.
create or replace function public.historico_limitar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_corte timestamptz;
begin
  select ts into v_corte from public.historico where org_id = new.org_id order by ts desc offset 3000 limit 1;
  if v_corte is not null then delete from public.historico where org_id = new.org_id and ts <= v_corte; end if;
  return null;
end $$;
drop trigger if exists trg_historico_limitar on public.historico;
create trigger trg_historico_limitar after insert on public.historico
  for each row execute function public.historico_limitar();

create table if not exists public.cronogramas (
  org_id      uuid   not null references public.organizacoes(id) on delete cascade,
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
  primary key (org_id, obra_id),
  foreign key (org_id, obra_id) references public.obras (org_id, id) on delete cascade
);

create table if not exists public.tarefas (
  org_id    uuid   not null references public.organizacoes(id) on delete cascade,
  obra_id   bigint not null,
  id        text   not null,
  ordem     integer not null,
  nome      text   not null default '',
  nivel     smallint not null default 0 check (nivel between 0 and 8),
  duracao   numeric(8,2) not null default 1 check (duracao >= 0),
  inicio_manual date,
  predecessoras jsonb not null default '[]'::jsonb,
  peso      numeric(10,2),
  pct       numeric(5,2) not null default 0 check (pct between 0 and 100),
  inicio_real date,
  fim_real    date,
  responsavel text not null default '',
  marco     boolean not null default false,
  fechado   boolean not null default false,
  base_inicio date,
  base_fim    date,
  primary key (org_id, obra_id, id),
  foreign key (org_id, obra_id) references public.cronogramas (org_id, obra_id) on delete cascade
);
create index if not exists tarefas_ordem_idx on public.tarefas (org_id, obra_id, ordem);
-- responsável da equipe: precisa existir antes das regras de acesso (seção 6)
alter table public.tarefas add column if not exists responsavel_id uuid references auth.users(id) on delete set null;

create table if not exists public.medicoes (
  org_id  uuid   not null references public.organizacoes(id) on delete cascade,
  obra_id bigint not null,
  data    date   not null,
  pct     numeric(5,2) not null check (pct between 0 and 100),
  primary key (org_id, obra_id, data),
  foreign key (org_id, obra_id) references public.cronogramas (org_id, obra_id) on delete cascade
);

-- updated_at automático (também nas tarefas, para detectar edição simultânea do cronograma)
alter table public.tarefas add column if not exists updated_at timestamptz not null default now();
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
do $$
declare t text;
begin
  foreach t in array array['obras','itens','compras','cronogramas','tarefas'] loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$s
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ───────────────────────── 5) COPIAR OS DADOS ANTIGOS PARA AS NOVAS TABELAS ─────────────────────────
do $$
declare u record; v_org uuid;
begin
  -- só copia na execução em que as tabelas antigas acabaram de ser renomeadas (evita duplicar)
  if coalesce(current_setting('obrix.migrar', true), '') <> 'sim' then return; end if;
  create temp table if not exists _mapa_org (user_id uuid primary key, org_id uuid) on commit drop;
  for u in
    select distinct user_id from (
      select user_id from public.obras_v2 union select user_id from public.historico_v2
    ) x
  loop
    insert into public.organizacoes (nome, criado_por) values ('Minha empresa', u.user_id) returning id into v_org;
    insert into public.membros (org_id, user_id, email, papel)
      select v_org, u.user_id, coalesce((select email from auth.users where id = u.user_id), ''), 'admin';
    insert into _mapa_org values (u.user_id, v_org);
  end loop;

  insert into public.obras (org_id, id, nome, codigo, local, responsavel, inicio, fim, ac21, status, obs, created_at, updated_at)
    select m.org_id, o.id, o.nome, o.codigo, o.local, o.responsavel, o.inicio, o.fim, o.ac21, o.status, o.obs, o.created_at, o.updated_at
    from public.obras_v2 o join _mapa_org m using (user_id);
  insert into public.itens (org_id, id, obra_id, descricao, categoria, tipo, orcado, pago, fornecedor, nf, data, obs, created_at, updated_at)
    select m.org_id, i.id, i.obra_id, i.descricao, i.categoria, i.tipo, i.orcado, i.pago, i.fornecedor, i.nf, i.data, i.obs, i.created_at, i.updated_at
    from public.itens_v2 i join _mapa_org m using (user_id);
  insert into public.compras (org_id, id, obra_id, descricao, categoria, fornecedor, cnpj, nf, data, qtde, unidade, unitario, total, status, obs, created_at, updated_at)
    select m.org_id, c.id, c.obra_id, c.descricao, c.categoria, c.fornecedor, c.cnpj, c.nf, c.data, c.qtde, c.unidade, c.unitario, c.total, c.status, c.obs, c.created_at, c.updated_at
    from public.compras_v2 c join _mapa_org m using (user_id);
  insert into public.historico (org_id, id, ts, tipo, icone, texto, usuario)
    select m.org_id, h.id, h.ts, h.tipo, h.icone, h.texto, h.usuario from public.historico_v2 h join _mapa_org m using (user_id);
  insert into public.cronogramas (org_id, obra_id, nome, contrato, empresa, responsavel, contato_pmo, observacoes, inicio, data_status, trabalha_sabado, trabalha_domingo, feriados, zoom, baseline, updated_at)
    select m.org_id, c.obra_id, c.nome, c.contrato, c.empresa, c.responsavel, c.contato_pmo, c.observacoes, c.inicio, c.data_status, c.trabalha_sabado, c.trabalha_domingo, c.feriados, c.zoom, c.baseline, c.updated_at
    from public.cronogramas_v2 c join _mapa_org m using (user_id);
  insert into public.tarefas (org_id, obra_id, id, ordem, nome, nivel, duracao, inicio_manual, predecessoras, peso, pct, inicio_real, fim_real, responsavel, marco, fechado, base_inicio, base_fim)
    select m.org_id, t.obra_id, t.id, t.ordem, t.nome, t.nivel, t.duracao, t.inicio_manual, t.predecessoras, t.peso, t.pct, t.inicio_real, t.fim_real, t.responsavel, t.marco, t.fechado, t.base_inicio, t.base_fim
    from public.tarefas_v2 t join _mapa_org m using (user_id);
  insert into public.medicoes (org_id, obra_id, data, pct)
    select m.org_id, d.obra_id, d.data, d.pct from public.medicoes_v2 d join _mapa_org m using (user_id);
  perform set_config('obrix.migrar', '', false);
end $$;

-- ───────────────────────── 6) SEGURANÇA (RLS) ─────────────────────────
alter table public.organizacoes enable row level security;
alter table public.membros      enable row level security;
alter table public.convites     enable row level security;

drop policy if exists organizacoes_ver     on public.organizacoes;
drop policy if exists organizacoes_editar  on public.organizacoes;
drop policy if exists organizacoes_apagar  on public.organizacoes;
create policy organizacoes_ver    on public.organizacoes for select to authenticated using (public.eh_membro(id));
create policy organizacoes_editar on public.organizacoes for update to authenticated using (public.eh_admin(id)) with check (public.eh_admin(id));
create policy organizacoes_apagar on public.organizacoes for delete to authenticated using (public.eh_admin(id));

drop policy if exists membros_ver     on public.membros;
drop policy if exists membros_editar  on public.membros;
drop policy if exists membros_apagar  on public.membros;
create policy membros_ver    on public.membros for select to authenticated using (public.eh_membro(org_id));
create policy membros_editar on public.membros for update to authenticated using (public.eh_admin(org_id)) with check (public.eh_admin(org_id));
create policy membros_apagar on public.membros for delete to authenticated using (public.eh_admin(org_id) or user_id = (select auth.uid()));

drop policy if exists convites_todos on public.convites;
create policy convites_todos on public.convites for all to authenticated using (public.eh_admin(org_id)) with check (public.eh_admin(org_id));

-- Cada tabela pertence a uma área de acesso. Obras e itens sempre podem ser vistos por quem é da equipe.
do $$
declare t text; p text; area text; ver text; criar text; alterar text; atualizar text;
begin
  foreach t in array array['obras','itens','compras','historico','cronogramas','tarefas','medicoes'] loop
    area := case t when 'obras' then 'obras' when 'itens' then 'obras' when 'compras' then 'compras'
                   when 'historico' then 'historico' else 'cronograma' end;
    ver := case when area = 'obras' then 'public.eh_membro(org_id)' else format('public.pode_ver(org_id, %L)', area) end;
    criar := case when t = 'historico' then 'public.pode_editar(org_id)' else format('public.pode_area(org_id, %L)', area) end;
    alterar := case when t = 'historico' then 'public.pode_editar(org_id)' else format('public.pode_area(org_id, %L)', area) end;
    -- quem tem o nível "só as minhas tarefas" altera apenas as tarefas em que é o responsável
    atualizar := case when t = 'tarefas'
      then 'public.pode_area(org_id, ''cronograma'') or (public.nivel_area(org_id, ''cronograma'') = ''minhas'' and responsavel_id = (select auth.uid()))'
      else alterar end;
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p, t);
    end loop;
    execute format('create policy %I on public.%I for select to authenticated using (%s)', t || '_ver', t, ver);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', t || '_criar', t, criar);
    if t <> 'historico' then
      execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', t || '_alterar', t, atualizar, atualizar);
    end if;
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', t || '_apagar', t, case when t = 'historico' then 'public.eh_admin(org_id)' else alterar end);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

revoke all on public.organizacoes, public.membros, public.convites from anon;
grant select, update, delete on public.organizacoes to authenticated;
grant select, update, delete on public.membros to authenticated;
grant select, insert, update, delete on public.convites to authenticated;

-- Quem já estava na equipe ganha o nome que informou no cadastro (se informou).
update public.membros m set nome = trim(u.raw_user_meta_data->>'nome')
  from auth.users u
  where u.id = m.user_id and m.nome = '' and coalesce(trim(u.raw_user_meta_data->>'nome'), '') <> '';

-- ───────────────────────── 7) RESUMO POR OBRA ─────────────────────────
create view public.v_obras_resumo with (security_invoker = true) as
select
  o.org_id, o.id, o.nome, o.codigo, o.status, o.ac21,
  coalesce(i.orcado, 0) + coalesce(c.total_todas, 0)                   as comprometido,
  coalesce(i.pago, 0)   + coalesce(c.total_pagas, 0)                   as pago,
  o.ac21 - (coalesce(i.pago, 0) + coalesce(c.total_pagas, 0))          as saldo,
  case when o.ac21 > 0
       then round((coalesce(i.orcado, 0) + coalesce(c.total_todas, 0)) / o.ac21 * 100, 1)
       else 0 end                                                       as pct_comprometido
from public.obras o
left join (select org_id, obra_id, sum(orcado) orcado, sum(pago) pago
           from public.itens group by org_id, obra_id) i on i.org_id = o.org_id and i.obra_id = o.id
left join (select org_id, obra_id, sum(total) total_todas,
                  sum(total) filter (where status = 'Pago') total_pagas
           from public.compras group by org_id, obra_id) c on c.org_id = o.org_id and c.obra_id = o.id;
grant select on public.v_obras_resumo to authenticated;

-- ───────────────────────── 7b) RESPONSÁVEL DA EQUIPE E NOTIFICAÇÕES ─────────────────────────
-- A tarefa pode ter como responsável uma pessoa da equipe (responsavel_id) ou só um nome (responsavel).
alter table public.tarefas add column if not exists responsavel_id uuid references auth.users(id) on delete set null;

create table if not exists public.notificacoes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizacoes(id) on delete cascade,
  para_user  uuid not null references auth.users(id) on delete cascade,
  de_user    uuid references auth.users(id) on delete set null,
  de_nome    text not null default '',
  tipo       text not null default 'tarefa',
  titulo     text not null,
  texto      text not null default '',
  rota       text not null default '/',
  obra_id    bigint,
  lida       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notificacoes_para_idx on public.notificacoes (para_user, org_id, created_at desc);

-- Quem recebe uma tarefa é avisado na hora, pelo próprio banco (não dá para forjar nem esquecer de avisar).
create or replace function public.notificar_responsavel() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_de text; v_obra text;
begin
  if new.responsavel_id is null or v_uid is null or new.responsavel_id = v_uid then return null; end if;
  if tg_op = 'UPDATE' and old.responsavel_id is not distinct from new.responsavel_id then return null; end if;
  if not exists (select 1 from public.membros where org_id = new.org_id and user_id = new.responsavel_id) then return null; end if;
  select coalesce(nullif(trim(nome), ''), email, '') into v_de from public.membros where org_id = new.org_id and user_id = v_uid;
  select case when coalesce(codigo, '') <> '' then codigo || ' - ' else '' end || nome into v_obra
    from public.obras where org_id = new.org_id and id = new.obra_id;
  insert into public.notificacoes (org_id, para_user, de_user, de_nome, tipo, titulo, texto, rota, obra_id)
  values (new.org_id, new.responsavel_id, v_uid, coalesce(v_de, ''), 'tarefa', 'Nova tarefa para você',
    coalesce(nullif(v_de, ''), 'Alguém') || ' atribuiu a você a tarefa "' || coalesce(nullif(new.nome, ''), 'sem nome') || '"'
      || case when v_obra is not null then ' na obra ' || v_obra else '' end || '.',
    '/cronograma', new.obra_id);
  return null;
end $$;
drop trigger if exists trg_tarefas_notificar on public.tarefas;
create trigger trg_tarefas_notificar after insert or update of responsavel_id on public.tarefas
  for each row execute function public.notificar_responsavel();

alter table public.notificacoes enable row level security;
drop policy if exists notificacoes_ver on public.notificacoes;
drop policy if exists notificacoes_ler on public.notificacoes;
drop policy if exists notificacoes_apagar on public.notificacoes;
create policy notificacoes_ver    on public.notificacoes for select to authenticated using (para_user = (select auth.uid()));
create policy notificacoes_ler    on public.notificacoes for update to authenticated using (para_user = (select auth.uid())) with check (para_user = (select auth.uid()));
create policy notificacoes_apagar on public.notificacoes for delete to authenticated using (para_user = (select auth.uid()));
revoke all on public.notificacoes from anon, authenticated;
grant select, delete on public.notificacoes to authenticated;
grant update (lida) on public.notificacoes to authenticated;

-- Quem só altera as próprias tarefas não muda de quem é a tarefa, nem a posição dela, nem a linha de base.
create or replace function public.tarefas_proteger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.pode_area(new.org_id, 'cronograma') then
    new.responsavel := old.responsavel; new.responsavel_id := old.responsavel_id;
    new.ordem := old.ordem; new.nivel := old.nivel; new.base_inicio := old.base_inicio; new.base_fim := old.base_fim;
  end if;
  return new;
end $$;
drop trigger if exists trg_tarefas_proteger on public.tarefas;
create trigger trg_tarefas_proteger before update on public.tarefas
  for each row execute function public.tarefas_proteger();

-- ───────────────────────── 8) ATUALIZAÇÃO EM TEMPO REAL ─────────────────────────
-- Faz o app de cada pessoa perceber quando outra alterou os dados.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['obras','itens','compras','historico','cronogramas','tarefas','medicoes','membros','notificacoes'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;
