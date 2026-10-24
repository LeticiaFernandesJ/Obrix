/**
 * Testa o SQL das equipes num Postgres de verdade (PGlite, roda dentro do Node), simulando o Supabase:
 * migração dos dados antigos, isolamento entre organizações, convites, papéis e proteções.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const sql = (nome: string) => readFileSync(new URL(nome, import.meta.url), 'utf8');
const v2 = sql('./legado/schema-completo-v2.sql');
const equipes = sql('./schema-equipes.sql');

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';
const D = '44444444-4444-4444-4444-444444444444';

let db: PGlite;
let orgA = '', orgB = '';

const q = async <T = Record<string, unknown>>(texto: string, params?: unknown[]) => (await db.query<T>(texto, params)).rows;
const erro = async (texto: string) => { try { await db.exec(texto); return null; } catch (e) { return String((e as Error).message); } };
async function como<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
const tenta = (uid: string, texto: string) => como(uid, () => erro(texto));
const linhas = <T = Record<string, unknown>>(uid: string, texto: string) => como(uid, () => q<T>(texto));
const contar = async (tabela: string, org: string) => Number((await q<{ n: string }>(`select count(*) n from public.${tabela} where org_id = $1`, [org]))[0].n);

beforeAll(async () => {
  db = new PGlite();
  // simulação mínima do Supabase: usuários, auth.uid(), papéis e a publicação do realtime
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin; create role authenticated nologin;
    grant usage on schema public, auth to anon, authenticated;
    grant select on auth.users to authenticated;
    create publication supabase_realtime;
    insert into auth.users (id, email, raw_user_meta_data) values ('${A}','a@x.com','{"nome":"Ana Souza"}'),('${B}','b@x.com',null),('${C}','c@x.com','{"nome":"Carlos Lima"}'),('${D}','d@x.com','{"nome":"Diana Reis"}');
  `);
  // instalação antiga (uma conta = um conjunto de dados), com dados de A e B
  await db.exec(v2);
  for (const [u, n] of [[A, 'Obra A'], [B, 'Obra B']]) {
    await db.exec(`
      insert into public.obras (user_id, id, nome, ac21) values ('${u}', 1, '${n}', 1000);
      insert into public.itens (user_id, id, obra_id, descricao, orcado, pago) values ('${u}', 2, 1, 'item', 10, 5);
      insert into public.compras (user_id, id, obra_id, descricao, total, status) values ('${u}', 3, 1, 'compra', 7, 'Pago');
      insert into public.historico (user_id, id, tipo, texto, usuario) values ('${u}', 4, 'x', 'feito', 'Gerente');
      insert into public.cronogramas (user_id, obra_id, nome) values ('${u}', 1, 'crono');
      insert into public.tarefas (user_id, obra_id, id, ordem, nome, predecessoras) values ('${u}', 1, 't1', 0, 'tarefa', '[{"id":"t0","tipo":"TI","lag":0}]');
      insert into public.medicoes (user_id, obra_id, data, pct) values ('${u}', 1, '2026-01-01', 10);
    `);
  }
  await db.exec(equipes);
}, 60000);

describe('migração dos dados antigos', () => {
  it('cria uma organização administrada por cada usuário antigo', async () => {
    const orgs = await q<{ id: string; user_id: string; papel: string; nome: string; email: string }>(
      'select o.id, o.nome, m.user_id, m.papel, m.email from public.organizacoes o join public.membros m on m.org_id = o.id order by m.email');
    expect(orgs).toHaveLength(2);
    expect(orgs.every((o) => o.papel === 'admin' && o.nome === 'Minha empresa')).toBe(true);
    expect(orgs[0].email).toBe('a@x.com');
    orgA = orgs.find((o) => o.user_id === A)!.id; orgB = orgs.find((o) => o.user_id === B)!.id;
  });
  it('copia todas as tabelas, inclusive as predecessoras (jsonb)', async () => {
    for (const t of ['obras', 'itens', 'compras', 'historico', 'cronogramas', 'tarefas', 'medicoes']) {
      expect(await contar(t, orgA)).toBe(1);
      expect(await contar(t, orgB)).toBe(1);
    }
    expect((await q<{ p: string }>(`select predecessoras->0->>'id' p from public.tarefas where org_id = $1`, [orgA]))[0].p).toBe('t0');
  });
  it('quem já estava na equipe ganha o nome do cadastro, quando existe', async () => {
    const n = await q<{ email: string; nome: string }>('select email, nome from public.membros order by email');
    expect(n.map((x) => x.nome)).toEqual(['Ana Souza', '']);
  });
  it('as compras têm a coluna de vencimento (data), vazia nos dados migrados', async () => {
    expect((await q<{ v: string | null }>('select vencimento v from public.compras where org_id = $1', [orgA]))[0].v).toBeNull();
    await db.exec(`update public.compras set vencimento = '2026-05-10' where org_id = '${orgA}'`);
    expect((await q<{ v: string }>(`select to_char(vencimento, 'YYYY-MM-DD') v from public.compras where org_id = $1`, [orgA]))[0].v).toBe('2026-05-10');
  });
  it('mantém as tabelas antigas só como backup, sem acesso para usuários', async () => {
    expect(Number((await q<{ n: string }>('select count(*) n from public.obras_v2'))[0].n)).toBe(2);
    expect((await q<{ p: boolean }>(`select has_table_privilege('authenticated','public.obras_v2','select') p`))[0].p).toBe(false);
  });
  it('pode ser executado de novo sem duplicar nada', async () => {
    expect(await erro(equipes)).toBeNull();
    expect(Number((await q<{ n: string }>('select count(*) n from public.organizacoes'))[0].n)).toBe(2);
    expect(await contar('obras', orgA)).toBe(1);
  });
});

describe('isolamento entre organizações', () => {
  it('cada pessoa vê só os dados da própria organização', async () => {
    expect((await linhas<{ nome: string }>(A, 'select nome from public.obras')).map((r) => r.nome)).toEqual(['Obra A']);
    expect((await linhas<{ nome: string }>(B, 'select nome from public.obras')).map((r) => r.nome)).toEqual(['Obra B']);
    expect(await linhas(C, 'select * from public.obras')).toHaveLength(0);
    expect(await linhas(A, `select * from public.itens where org_id = '${orgB}'`)).toHaveLength(0);
  });
  it('ninguém grava na organização dos outros', async () => {
    expect(await tenta(A, `insert into public.obras (org_id, id, nome) values ('${orgB}', 99, 'invasão')`)).not.toBeNull();
  });
});

describe('convites e papéis', () => {
  let token = '';
  it('só administradores criam e veem convites', async () => {
    await como(A, () => db.exec(`insert into public.convites (org_id, papel, email) values ('${orgA}', 'leitor', 'c@x.com')`));
    token = (await linhas<{ token: string }>(A, 'select token from public.convites'))[0].token;
    expect(await linhas(C, 'select * from public.convites')).toHaveLength(0);
    expect(await tenta(C, `insert into public.convites (org_id, papel) values ('${orgA}', 'admin')`)).not.toBeNull();
  });
  it('recusa convite inválido e aceita o válido uma única vez', async () => {
    expect(await tenta(C, `select public.aceitar_convite('00000000-0000-0000-0000-000000000000')`)).toMatch(/inválido/);
    const r = await linhas<{ org: string }>(C, `select public.aceitar_convite('${token}') as org`);
    expect(r[0].org).toBe(orgA);
    expect((await linhas<{ nome: string }>(C, `select nome from public.membros where user_id = '${C}'`))[0].nome).toBe('Carlos Lima');
    expect(await linhas(A, 'select * from public.convites')).toHaveLength(0);
    expect(await tenta(C, `select public.aceitar_convite('${token}')`)).not.toBeNull();
  });
  it('convite expirado não vale', async () => {
    await como(A, () => db.exec(`insert into public.convites (org_id, papel, expira_em) values ('${orgA}', 'editor', now() - interval '1 day')`));
    const t = (await linhas<{ token: string }>(A, 'select token from public.convites'))[0].token;
    expect(await tenta(D, `select public.aceitar_convite('${t}')`)).toMatch(/inválido|expirado/);
    await como(A, () => db.exec('delete from public.convites'));
  });
  it('leitor consulta mas não grava, altera, apaga nem se promove', async () => {
    expect(await linhas(C, 'select nome from public.obras')).toHaveLength(1);
    expect(await tenta(C, `insert into public.obras (org_id, id, nome) values ('${orgA}', 50, 'x')`)).not.toBeNull();
    await tenta(C, `update public.obras set nome = 'x' where org_id = '${orgA}'`);
    await tenta(C, `delete from public.obras where org_id = '${orgA}'`);
    expect((await linhas<{ nome: string }>(A, 'select nome from public.obras'))[0].nome).toBe('Obra A');
    await tenta(C, `update public.membros set papel = 'admin' where user_id = '${C}'`);
    expect((await linhas<{ papel: string }>(A, `select papel from public.membros where user_id = '${C}'`))[0].papel).toBe('leitor');
  });
  it('editor grava e altera, mas não gerencia a equipe', async () => {
    await como(A, () => db.exec(`update public.membros set papel = 'editor' where user_id = '${C}'`));
    expect(await tenta(C, `insert into public.obras (org_id, id, nome) values ('${orgA}', 51, 'editor grava')`)).toBeNull();
    await tenta(C, `update public.obras set nome = 'Editada' where org_id = '${orgA}' and id = 51`);
    expect((await linhas<{ nome: string }>(A, 'select nome from public.obras where id = 51'))[0].nome).toBe('Editada');
    expect(await tenta(C, `insert into public.convites (org_id, papel) values ('${orgA}', 'leitor')`)).not.toBeNull();
    await tenta(C, `update public.membros set papel = 'admin' where user_id = '${C}'`);
    expect((await linhas<{ papel: string }>(A, `select papel from public.membros where user_id = '${C}'`))[0].papel).toBe('editor');
  });
  it('a outra organização continua isolada', async () => {
    expect((await linhas<{ nome: string }>(B, 'select nome from public.obras')).map((r) => r.nome)).toEqual(['Obra B']);
  });
});

describe('proteções da equipe', () => {
  it('nunca deixa a organização sem administrador', async () => {
    expect(await tenta(A, `update public.membros set papel = 'leitor' where user_id = '${A}'`)).toMatch(/administrador/);
    expect(await tenta(A, `delete from public.membros where user_id = '${A}'`)).not.toBeNull();
  });
  it('com outro administrador, é possível rebaixar e remover', async () => {
    await como(A, () => db.exec(`update public.membros set papel = 'admin' where user_id = '${C}'`));
    expect(await tenta(A, `update public.membros set papel = 'leitor' where user_id = '${A}'`)).toBeNull();
    await como(C, () => db.exec(`delete from public.membros where user_id = '${A}'`));
    expect(await linhas(C, 'select * from public.membros')).toHaveLength(1);
    expect(await linhas(A, 'select * from public.obras')).toHaveLength(0); // quem saiu perde o acesso
    expect(await tenta(C, `delete from public.membros where user_id = '${C}'`)).not.toBeNull(); // o último admin não sai
  });
});

describe('organização nova', () => {
  let org = '';
  it('quem cria vira administrador e já grava', async () => {
    org = (await linhas<{ org: string }>(D, `select public.criar_organizacao('Construtora D') as org`))[0].org;
    expect((await linhas<{ papel: string }>(D, `select papel from public.membros where org_id = '${org}'`))[0].papel).toBe('admin');
    await como(D, () => db.exec(`insert into public.obras (org_id, id, nome) values ('${org}', 1, 'D1')`));
    expect(await linhas(D, 'select * from public.obras')).toHaveLength(1);
  });
  it('o nome do cadastro vai junto e cada pessoa corrige o próprio', async () => {
    expect((await linhas<{ nome: string }>(D, `select nome from public.membros where org_id = '${org}'`))[0].nome).toBe('Diana Reis');
    await como(D, () => db.exec(`select public.definir_meu_nome('  Diana R. Reis  ')`));
    expect((await linhas<{ nome: string }>(D, `select nome from public.membros where org_id = '${org}'`))[0].nome).toBe('Diana R. Reis');
  });
  it('não cria organização direto na tabela nem com nome vazio', async () => {
    expect(await tenta(D, `insert into public.organizacoes (nome) values ('direto')`)).not.toBeNull();
    expect(await tenta(B, `select public.criar_organizacao('   ')`)).not.toBeNull();
  });
  it('o resumo por obra respeita as regras de acesso', async () => {
    expect(await linhas(D, 'select nome from public.v_obras_resumo')).toHaveLength(1);
    expect(await linhas(B, 'select nome from public.v_obras_resumo')).toHaveLength(1);
  });
  it('apagar a organização apaga tudo que é dela', async () => {
    await como(D, () => db.exec(`delete from public.organizacoes where id = '${org}'`));
    expect(await linhas(D, 'select * from public.obras')).toHaveLength(0);
  });
});

describe('instalação limpa', () => {
  it('funciona num banco vazio, mesmo rodando duas vezes', async () => {
    const novo = new PGlite();
    await novo.exec(`create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated;`);
    await novo.exec(equipes); await novo.exec(equipes);
    const t = (await novo.query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema = 'public'`)).rows.map((r) => r.table_name);
    expect(t).toEqual(expect.arrayContaining(['organizacoes', 'membros', 'convites', 'obras', 'itens', 'compras', 'historico', 'cronogramas', 'tarefas', 'medicoes']));
  }, 60000);
});
