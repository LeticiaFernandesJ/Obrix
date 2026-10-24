import type { SupabaseClient } from '@supabase/supabase-js';

/* =========================== EQUIPES E PAPÉIS =========================== */
export type Papel = 'admin' | 'editor' | 'leitor';

export const PAPEIS: Record<Papel, { rotulo: string; descricao: string }> = {
  admin: { rotulo: 'Administrador', descricao: 'Altera os dados e gerencia a equipe.' },
  editor: { rotulo: 'Editor', descricao: 'Cadastra e altera obras, itens, compras e cronogramas.' },
  leitor: { rotulo: 'Leitor', descricao: 'Só consulta, sem alterar nada.' },
};
export const LISTA_PAPEIS: Papel[] = ['admin', 'editor', 'leitor'];

export interface Org { id: string; nome: string; papel: Papel }
export interface Membro { user_id: string; email: string; papel: Papel; created_at: string }
export interface Convite { id: string; token: string; papel: Papel; email: string; expira_em: string; created_at: string }

const BASE = import.meta.env.BASE_URL;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const K_CONVITE = 'obrix-convite';

/** Quem pode alterar dados. Sem papel (uso local, sem nuvem) pode tudo. */
export const podeAlterar = (papel: Papel | null) => papel === null || papel === 'admin' || papel === 'editor';

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
  if (m.includes('pelo menos um administrador')) return 'A organização precisa ter pelo menos um administrador.';
  if (m.includes('row-level security') || m.includes('permission denied')) return 'Você não tem permissão para fazer isso.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sem conexão com o servidor.';
  return msg;
}

export async function minhasOrgs(sb: SupabaseClient, userId: string): Promise<Org[]> {
  const { data, error } = await sb.from('membros').select('papel, organizacoes(id, nome)').eq('user_id', userId);
  lancar(error);
  const out: Org[] = [];
  for (const r of (data ?? []) as unknown as { papel: Papel; organizacoes: { id: string; nome: string } | { id: string; nome: string }[] | null }[]) {
    const o = Array.isArray(r.organizacoes) ? r.organizacoes[0] : r.organizacoes;
    if (o) out.push({ id: o.id, nome: o.nome, papel: r.papel });
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
  const { data, error } = await sb.from('membros').select('user_id, email, papel, created_at').eq('org_id', orgId).order('created_at');
  lancar(error);
  return (data ?? []) as Membro[];
}
export async function mudarPapel(sb: SupabaseClient, orgId: string, userId: string, papel: Papel) {
  const { error } = await sb.from('membros').update({ papel }).eq('org_id', orgId).eq('user_id', userId);
  lancar(error);
}
export async function removerMembro(sb: SupabaseClient, orgId: string, userId: string) {
  const { error } = await sb.from('membros').delete().eq('org_id', orgId).eq('user_id', userId);
  lancar(error);
}

/* ---------- convites ---------- */
export async function listarConvites(sb: SupabaseClient, orgId: string): Promise<Convite[]> {
  const { data, error } = await sb.from('convites').select('id, token, papel, email, expira_em, created_at').eq('org_id', orgId).order('created_at', { ascending: false });
  lancar(error);
  return (data ?? []) as Convite[];
}
export async function criarConvite(sb: SupabaseClient, orgId: string, papel: Papel, email: string): Promise<Convite> {
  const { data, error } = await sb.from('convites').insert({ org_id: orgId, papel, email: email.trim().toLowerCase() })
    .select('id, token, papel, email, expira_em, created_at').single();
  lancar(error);
  return data as Convite;
}
export async function apagarConvite(sb: SupabaseClient, id: string) {
  const { error } = await sb.from('convites').delete().eq('id', id);
  lancar(error);
}
