import type { SupabaseClient } from '@supabase/supabase-js';

/* =========================== EQUIPES E PAPÉIS =========================== */
export type Papel = 'admin' | 'editor' | 'leitor' | 'personalizado';

export const PAPEIS: Record<Papel, { rotulo: string; descricao: string }> = {
  admin: { rotulo: 'Administrador', descricao: 'Altera os dados e gerencia a equipe.' },
  editor: { rotulo: 'Editor', descricao: 'Cadastra e altera obras, itens, compras e cronogramas.' },
  leitor: { rotulo: 'Leitor', descricao: 'Só consulta, sem alterar nada.' },
  personalizado: { rotulo: 'Personalizado', descricao: 'Você escolhe o que a pessoa vê e altera em cada área.' },
};
export const LISTA_PAPEIS: Papel[] = ['admin', 'editor', 'leitor', 'personalizado'];

/* ---------- acesso por área (papel Personalizado) ---------- */
export type Area = 'obras' | 'compras' | 'cronograma' | 'historico';
export type Nivel = 'nenhum' | 'ver' | 'editar';
export type Permissoes = Partial<Record<Area, Nivel>>;

/** Regra de senha para contas novas e redefinição: 8 caracteres ou mais, com letra e número. Devolve a mensagem de erro, ou null se estiver boa. */
export function erroDeSenha(senha: string): string | null {
  if (senha.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (!/[A-Za-zÀ-ÿ]/.test(senha) || !/\d/.test(senha)) return 'Use letras e números na senha.';
  return null;
}

export const NIVEIS: Record<Nivel, string> = { nenhum: 'Sem acesso', ver: 'Só ver', editar: 'Ver e alterar' };
export const AREAS: { id: Area; rotulo: string; descricao: string; niveis: Nivel[] }[] = [
  { id: 'obras', rotulo: 'Obras e itens', descricao: 'Cadastro das obras, AC21 e itens orçados', niveis: ['ver', 'editar'] },
  { id: 'compras', rotulo: 'Compras e financeiro', descricao: 'Compras, notas fiscais, contas a pagar e fluxo de caixa', niveis: ['nenhum', 'ver', 'editar'] },
  { id: 'cronograma', rotulo: 'Cronograma', descricao: 'Cronograma, painel do PMO e dados do projeto', niveis: ['nenhum', 'ver', 'editar'] },
  { id: 'historico', rotulo: 'Histórico de alterações', descricao: 'Quem alterou o quê e quando', niveis: ['nenhum', 'ver'] },
];

/** Nível de acesso de um papel numa área. Sem papel (uso local, sem nuvem) pode tudo. */
export function nivelDaArea(papel: Papel | null, perm: Permissoes | null | undefined, area: Area): Nivel {
  if (papel === null || papel === 'admin') return 'editar';
  if (papel === 'editor') return area === 'historico' ? 'ver' : 'editar';
  if (papel === 'leitor') return 'ver';
  const n = perm?.[area];
  if (n !== 'nenhum' && n !== 'ver' && n !== 'editar') return 'ver';
  if (area === 'obras' && n === 'nenhum') return 'ver'; // quem é da equipe sempre vê as obras
  if (area === 'historico' && n === 'editar') return 'ver';
  return n;
}
export const podeEditarArea = (papel: Papel | null, perm: Permissoes | null | undefined, area: Area) => nivelDaArea(papel, perm, area) === 'editar';
export const podeVerArea = (papel: Papel | null, perm: Permissoes | null | undefined, area: Area) => nivelDaArea(papel, perm, area) !== 'nenhum';
/** Altera alguma coisa (obras, compras ou cronograma). */
export const podeAlterar = (papel: Papel | null, perm?: Permissoes | null) => (['obras', 'compras', 'cronograma'] as Area[]).some((a) => podeEditarArea(papel, perm, a));

/** As quatro áreas de qualquer papel; serve de ponto de partida ao personalizar. */
export function permissoesDoPapel(papel: Papel, perm?: Permissoes | null): Permissoes {
  return Object.fromEntries(AREAS.map((a) => [a.id, nivelDaArea(papel, perm, a.id)])) as Permissoes;
}
/** Remove o que não faz sentido (obras sem acesso, histórico editável) antes de gravar. */
export const normalizarPermissoes = (perm: Permissoes | null | undefined): Permissoes => permissoesDoPapel('personalizado', perm);

export function resumoPermissoes(papel: Papel, perm?: Permissoes | null): string {
  if (papel !== 'personalizado') return '';
  const p = permissoesDoPapel(papel, perm);
  const lista = (n: Nivel) => AREAS.filter((a) => p[a.id] === n).map((a) => a.rotulo.toLowerCase());
  const edita = lista('editar'), sem = lista('nenhum');
  return [edita.length ? `Altera: ${edita.join(', ')}` : 'Não altera nada', sem.length ? `Sem acesso: ${sem.join(', ')}` : ''].filter(Boolean).join('. ');
}

export interface Org { id: string; nome: string; papel: Papel; permissoes: Permissoes | null; /** nome completo de quem está logado */ meuNome: string }
export interface Membro { user_id: string; email: string; nome: string; papel: Papel; permissoes: Permissoes | null; created_at: string }
export interface Convite { id: string; token: string; papel: Papel; permissoes: Permissoes | null; email: string; expira_em: string; created_at: string }

const BASE = import.meta.env.BASE_URL;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const K_CONVITE = 'obrix-convite';

/** Quem pode alterar dados. Sem papel (uso local, sem nuvem) pode tudo. */

/* ---------- convite: o token chega no endereço (?convite=...) e é guardado até a pessoa entrar ---------- */
export const linkConvite = (token: string) => `${location.origin}${BASE}?convite=${token}`;

/** Guarda o token do endereço e o tira da barra (chamar assim que o app abre). */
export function capturarConvite() {
  try {
    const t = new URLSearchParams(location.search).get('convite');
    if (t && UUID.test(t)) {
      localStorage.setItem(K_CONVITE, t);
      const url = new URL(location.href); url.searchParams.delete('convite');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  } catch { /* sem armazenamento */ }
}
export const conviteGuardado = (): string | null => { try { return localStorage.getItem(K_CONVITE); } catch { return null; } };
export const limparConvite = () => { try { localStorage.removeItem(K_CONVITE); } catch { /* ok */ } };

/* ---------- organizações ---------- */
function lancar(error: { message: string } | null) { if (error) throw new Error(traduzirErro(error.message)); }

export function traduzirErro(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('convite inválido') || m.includes('convite invalido')) return 'Convite inválido ou expirado. Peça um novo link a um administrador.';
  if (m.includes('limite de organizações')) return 'Você atingiu o limite de organizações criadas por conta. Peça um convite para entrar em uma existente.';
  if (m.includes('pelo menos um administrador')) return 'A organização precisa ter pelo menos um administrador.';
  if (m.includes('row-level security') || m.includes('permission denied')) return 'Você não tem permissão para fazer isso.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sem conexão com o servidor.';
  return msg;
}

export async function minhasOrgs(sb: SupabaseClient, userId: string): Promise<Org[]> {
  const { data, error } = await sb.from('membros').select('papel, permissoes, nome, organizacoes(id, nome)').eq('user_id', userId);
  lancar(error);
  const out: Org[] = [];
  for (const r of (data ?? []) as unknown as { papel: Papel; permissoes: Permissoes | null; nome: string | null; organizacoes: { id: string; nome: string } | { id: string; nome: string }[] | null }[]) {
    const o = Array.isArray(r.organizacoes) ? r.organizacoes[0] : r.organizacoes;
    if (o) out.push({ id: o.id, nome: o.nome, papel: r.papel, permissoes: r.permissoes ?? null, meuNome: r.nome ?? '' });
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export async function criarOrg(sb: SupabaseClient, nome: string): Promise<string> {
  const { data, error } = await sb.rpc('criar_organizacao', { p_nome: nome });
  lancar(error);
  return data as string;
}
export async function aceitarConvite(sb: SupabaseClient, token: string): Promise<string> {
  const { data, error } = await sb.rpc('aceitar_convite', { p_token: token });
  lancar(error);
  return data as string;
}
export async function renomearOrg(sb: SupabaseClient, orgId: string, nome: string) {
  const { error } = await sb.from('organizacoes').update({ nome: nome.trim() }).eq('id', orgId);
  lancar(error);
}

/* ---------- membros ---------- */
export async function listarMembros(sb: SupabaseClient, orgId: string): Promise<Membro[]> {
  const { data, error } = await sb.from('membros').select('user_id, email, nome, papel, permissoes, created_at').eq('org_id', orgId).order('created_at');
  lancar(error);
  return (data ?? []) as Membro[];
}
export async function definirMeuNome(sb: SupabaseClient, nome: string) {
  const { error } = await sb.rpc('definir_meu_nome', { p_nome: nome.trim().split(/s+/).join(' ') });
  lancar(error);
}
export async function mudarPapel(sb: SupabaseClient, orgId: string, userId: string, papel: Papel, permissoes?: Permissoes | null) {
  const { error } = await sb.from('membros').update({ papel, permissoes: papel === 'personalizado' ? normalizarPermissoes(permissoes) : null }).eq('org_id', orgId).eq('user_id', userId);
  lancar(error);
}
export async function removerMembro(sb: SupabaseClient, orgId: string, userId: string) {
  const { error } = await sb.from('membros').delete().eq('org_id', orgId).eq('user_id', userId);
  lancar(error);
}

/* ---------- convites ---------- */
export async function listarConvites(sb: SupabaseClient, orgId: string): Promise<Convite[]> {
  const { data, error } = await sb.from('convites').select('id, token, papel, permissoes, email, expira_em, created_at').eq('org_id', orgId).order('created_at', { ascending: false });
  lancar(error);
  return (data ?? []) as Convite[];
}
export async function criarConvite(sb: SupabaseClient, orgId: string, papel: Papel, email: string, permissoes?: Permissoes | null): Promise<Convite> {
  const { data, error } = await sb.from('convites').insert({ org_id: orgId, papel, email: email.trim().toLowerCase(), permissoes: papel === 'personalizado' ? normalizarPermissoes(permissoes) : null })
    .select('id, token, papel, permissoes, email, expira_em, created_at').single();
  lancar(error);
  return data as Convite;
}
export async function apagarConvite(sb: SupabaseClient, id: string) {
  const { error } = await sb.from('convites').delete().eq('id', id);
  lancar(error);
}
