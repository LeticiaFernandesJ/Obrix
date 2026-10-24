import type { SupabaseClient } from '@supabase/supabase-js';

/* =========================== NOTIFICAÇÕES =========================== */
/** Aviso para uma pessoa da equipe (ex.: "te atribuíram uma tarefa"). É criado pelo banco, nunca pelo app. */
export interface Notificacao {
  id: string; titulo: string; texto: string; rota: string; obra_id: number | null; lida: boolean; created_at: string; de_nome: string;
}

const COLUNAS = 'id, titulo, texto, rota, obra_id, lida, created_at, de_nome';

export async function listarNotificacoes(sb: SupabaseClient, orgId: string, limite = 30): Promise<Notificacao[]> {
  const { data, error } = await sb.from('notificacoes').select(COLUNAS).eq('org_id', orgId).order('created_at', { ascending: false }).limit(limite);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...(r as unknown as Notificacao), obra_id: r.obra_id == null ? null : Number(r.obra_id) }));
}

export async function marcarLidas(sb: SupabaseClient, ids: string[]) {
  if (!ids.length) return;
  const { error } = await sb.from('notificacoes').update({ lida: true }).in('id', ids);
  if (error) throw error;
}

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias", ou a data. */
export function tempoRelativo(iso: string, agora = Date.now()): string {
  const t = new Date(iso).getTime(); if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.round((agora - t) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60); if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24); if (d === 1) return 'ontem'; if (d < 7) return `há ${d} dias`;
  return new Date(t).toLocaleDateString('pt-BR');
}
