import type { SupabaseClient } from '@supabase/supabase-js';
import { type DB, type Obra, type Item, type Compra, type Historico, dbVazio, sanitizarDB } from './ac21';
import { iso2n, n2iso } from './dates';
import { type Estado, type Tarefa, normalizarEstado } from './schedule';

/* ======================================================================
   Mapeamento entre o estado do app e as tabelas do Supabase
   (obras, itens, compras, historico, cronogramas, tarefas, medicoes).
   ====================================================================== */
export type Row = Record<string, unknown>;
export const TABELAS = ['obras', 'itens', 'compras', 'historico', 'cronogramas', 'tarefas', 'medicoes'] as const;
export type Tabela = (typeof TABELAS)[number];
export type Linhas = Record<Tabela, Row[]>;

/** Colunas da chave primária de cada tabela (além de org_id). */
export const CHAVES: Record<Tabela, string[]> = {
  obras: ['id'], itens: ['id'], compras: ['id'], historico: ['id'],
  cronogramas: ['obra_id'], tarefas: ['obra_id', 'id'], medicoes: ['obra_id', 'data'],
};
/** Ordem segura para inserir (pais antes dos filhos); a exclusão usa a ordem inversa. */
const ORDEM: Tabela[] = ['obras', 'cronogramas', 'itens', 'compras', 'tarefas', 'medicoes', 'historico'];

const data = (s: unknown): string | null => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
const nIso = (n: number | null | undefined): string | null => (n == null ? null : n2iso(n));
const str = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/* ───────────── app → linhas ───────────── */
export function paraLinhas(db: DB, cronos: Record<string, Estado>): Linhas {
  const L: Linhas = { obras: [], itens: [], compras: [], historico: [], cronogramas: [], tarefas: [], medicoes: [] };
  db.obras.forEach((o) => {
    L.obras.push({
      id: o.id, nome: o.nome, codigo: o.codigo, local: o.local, responsavel: o.responsavel,
      inicio: data(o.inicio), fim: data(o.fim), ac21: o.ac21, status: o.status, obs: o.obs,
    });
    o.itens.forEach((i) => L.itens.push({
      id: i.id, obra_id: o.id, descricao: i.desc, categoria: i.cat, tipo: i.tipo, orcado: i.orcado, pago: i.pago,
      fornecedor: i.forn, nf: i.nf, data: data(i.data), obs: i.obs,
    }));
  });
  const ids = new Set(db.obras.map((o) => o.id));
  db.compras.filter((c) => ids.has(c.obraId)).forEach((c) => L.compras.push({
    id: c.id, obra_id: c.obraId, descricao: c.desc, categoria: c.cat, fornecedor: c.forn, cnpj: c.cnpj, nf: c.nf,
    data: data(c.data), vencimento: data(c.venc), qtde: c.qtde, unidade: c.unid, unitario: c.unit, total: c.total, status: c.status, obs: c.obs,
  }));
  db.historico.forEach((h) => L.historico.push({ id: h.id, ts: h.ts, tipo: h.tipo, icone: h.icone, texto: h.texto, usuario: h.user }));

  Object.keys(cronos).forEach((k) => {
    const obraId = Number(k);
    if (!ids.has(obraId)) return;
    const S = cronos[k];
    L.cronogramas.push({
      obra_id: obraId, nome: S.meta.nome, contrato: S.meta.contrato, empresa: S.meta.empresa, responsavel: S.meta.resp,
      contato_pmo: S.meta.pmo, observacoes: S.meta.obs, inicio: data(S.meta.inicio), data_status: data(S.meta.statusDate),
      trabalha_sabado: S.cal.sab, trabalha_domingo: S.cal.dom,
      feriados: (S.cal.fer || []).map((f) => data(f)).filter((f): f is string => !!f),
      zoom: S.zoom, baseline: S.baseline,
    });
    S.tarefas.forEach((t, ordem) => L.tarefas.push({
      obra_id: obraId, id: t.id, ordem, nome: t.nome, nivel: t.nivel, duracao: t.dur, inicio_manual: nIso(t.iniM),
      predecessoras: t.pred, peso: t.peso, pct: t.pct, inicio_real: nIso(t.rIni), fim_real: nIso(t.rFim),
      responsavel: t.resp, responsavel_id: t.respId, marco: t.marco, fechado: t.fechado,
      base_inicio: nIso(t.bl?.i), base_fim: nIso(t.bl?.f),
    }));
    S.medicoes.forEach((m) => { const d = data(m.d); if (d) L.medicoes.push({ obra_id: obraId, data: d, pct: Math.max(0, Math.min(100, m.p)) }); });
  });
  return L;
}

/* ───────────── linhas → app ───────────── */
export function deLinhas(L: Linhas): { db: DB; cronos: Record<string, Estado> } {
  const itensPorObra = new Map<number, Item[]>();
  L.itens.forEach((r) => {
    const o = num(r.obra_id); const arr = itensPorObra.get(o) ?? [];
    arr.push({
      id: num(r.id), desc: str(r.descricao), cat: str(r.categoria), tipo: r.tipo === 'nao_orcado' ? 'nao_orcado' : 'orcado',
      orcado: num(r.orcado), pago: num(r.pago), forn: str(r.fornecedor), nf: str(r.nf), data: str(r.data), obs: str(r.obs),
    });
    itensPorObra.set(o, arr);
  });
  const obras: Obra[] = L.obras.map((r) => ({
    id: num(r.id), nome: str(r.nome), codigo: str(r.codigo), local: str(r.local), responsavel: str(r.responsavel),
    inicio: str(r.inicio), fim: str(r.fim), ac21: num(r.ac21), status: r.status as Obra['status'], obs: str(r.obs),
    itens: itensPorObra.get(num(r.id)) ?? [],
  }));
  const compras: Compra[] = L.compras.map((r) => ({
    id: num(r.id), obraId: num(r.obra_id), desc: str(r.descricao), cat: str(r.categoria), forn: str(r.fornecedor), cnpj: str(r.cnpj),
    nf: str(r.nf), data: str(r.data), qtde: num(r.qtde), unid: str(r.unidade), unit: num(r.unitario), total: num(r.total), venc: str(r.vencimento),
    status: r.status as Compra['status'], obs: str(r.obs),
  }));
  const historico: Historico[] = L.historico.map((r) => ({
    id: num(r.id), ts: str(r.ts), tipo: str(r.tipo), icone: str(r.icone), texto: str(r.texto), user: str(r.usuario) || 'Gerente',
  })).sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : b.id - a.id));

  const maior = Math.max(0, ...obras.map((o) => o.id), ...L.itens.map((r) => num(r.id)), ...compras.map((c) => c.id), ...historico.map((h) => h.id));
  const db: DB = { ...dbVazio(), obras, compras, historico, nextId: maior + 1 };

  const cronos: Record<string, Estado> = {};
  L.cronogramas.forEach((r) => {
    const obraId = num(r.obra_id);
    const tarefas = L.tarefas.filter((t) => num(t.obra_id) === obraId).sort((a, b) => num(a.ordem) - num(b.ordem)).map((t): Partial<Tarefa> => ({
      id: str(t.id), nome: str(t.nome), nivel: num(t.nivel), dur: num(t.duracao, 1), iniM: iso2n(data(t.inicio_manual)),
      pred: Array.isArray(t.predecessoras) ? (t.predecessoras as Tarefa['pred']) : [],
      peso: t.peso == null ? null : num(t.peso), pct: num(t.pct), rIni: iso2n(data(t.inicio_real)), rFim: iso2n(data(t.fim_real)),
      resp: str(t.responsavel), respId: t.responsavel_id ? String(t.responsavel_id) : null, marco: !!t.marco, fechado: !!t.fechado,
      bl: t.base_inicio || t.base_fim ? { i: iso2n(data(t.base_inicio)), f: iso2n(data(t.base_fim)) } : null,
    }));
    const meta: Partial<Estado['meta']> = {
      nome: str(r.nome), contrato: str(r.contrato), empresa: str(r.empresa), resp: str(r.responsavel), pmo: str(r.contato_pmo), obs: str(r.observacoes),
    };
    if (data(r.inicio)) meta.inicio = data(r.inicio)!;
    if (data(r.data_status)) meta.statusDate = data(r.data_status)!;
    cronos[String(obraId)] = normalizarEstado({
      meta: meta as Estado['meta'],
      cal: { sab: !!r.trabalha_sabado, dom: !!r.trabalha_domingo, fer: Array.isArray(r.feriados) ? (r.feriados as string[]) : [] },
      tarefas: tarefas as Tarefa[],
      medicoes: L.medicoes.filter((m) => num(m.obra_id) === obraId).map((m) => ({ d: str(m.data), p: num(m.pct) })).sort((a, b) => (a.d < b.d ? -1 : 1)),
      zoom: r.zoom as Estado['zoom'], baseline: !!r.baseline,
    });
  });
  return { db: sanitizarDB(db) ?? dbVazio(), cronos };
}

/* ───────────── leitura / escrita incremental ───────────── */
export type Snap = Record<Tabela, Map<string, string>>;
export const snapVazio = (): Snap => ({ obras: new Map(), itens: new Map(), compras: new Map(), historico: new Map(), cronogramas: new Map(), tarefas: new Map(), medicoes: new Map() });
const chave = (t: Tabela, r: Row) => CHAVES[t].map((c) => String(r[c])).join('|');

export function snapDe(L: Linhas): Snap {
  const s = snapVazio();
  TABELAS.forEach((t) => L[t].forEach((r) => s[t].set(chave(t, r), JSON.stringify(r))));
  return s;
}

async function todas(sb: SupabaseClient, orgId: string, t: Tabela): Promise<Row[]> {
  const out: Row[] = [];
  for (let de = 0; ; de += 1000) {
    let q = sb.from(t).select('*').eq('org_id', orgId);
    CHAVES[t].forEach((c) => { q = q.order(c); });
    const { data: rows, error } = await q.range(de, de + 999);
    if (error) throw error;
    out.push(...((rows ?? []) as Row[]));
    if (!rows || rows.length < 1000) break;
  }
  return out;
}

/** Lê todos os dados de uma organização (quem está em várias organizações precisa filtrar). */
export async function lerNuvem(sb: SupabaseClient, orgId: string): Promise<Linhas> {
  const r = await Promise.all(TABELAS.map((t) => todas(sb, orgId, t)));
  const L = {} as Linhas;
  TABELAS.forEach((t, i) => { L[t] = r[i]; });
  return L;
}

/* ───────────── edição simultânea ───────────── */
/** Tabelas que têm updated_at no banco: dá para saber se outra pessoa mexeu na mesma linha. */
const VERSIONADAS: Tabela[] = ['obras', 'itens', 'compras', 'cronogramas', 'tarefas'];
export type Versoes = Map<string, string>;
const chaveVersao = (t: Tabela, r: Row) => t + '|' + chave(t, r);

/** Guarda a versão (updated_at) de cada linha lida da nuvem. Chamar com as linhas cruas, logo depois de lerNuvem. */
export function versoesDe(L: Linhas): Versoes {
  const v: Versoes = new Map();
  VERSIONADAS.forEach((t) => L[t].forEach((r) => { if (r.updated_at != null) v.set(chaveVersao(t, r), String(r.updated_at)); }));
  return v;
}

/** Outra pessoa alterou (ou apagou) linhas que esta pessoa também alterou. Nada foi gravado. */
export class ConflitoErro extends Error {
  constructor(public readonly linhas: string[]) { super('Edição simultânea'); this.name = 'ConflitoErro'; }
}

async function conferirVersoes(sb: SupabaseClient, orgId: string, novas: Record<Tabela, Row[]>, snap: Snap, versoes: Versoes): Promise<string[]> {
  const conflitos: string[] = [];
  for (const t of VERSIONADAS) {
    const existentes = novas[t].filter((r) => snap[t].has(chave(t, r)) && versoes.has(chaveVersao(t, r)));
    if (!existentes.length) continue;
    const ultimo = CHAVES[t][CHAVES[t].length - 1];
    const grupos = new Map<string, Row[]>();
    existentes.forEach((r) => { const g = CHAVES[t].slice(0, -1).map((c) => r[c]).join('|'); grupos.set(g, [...(grupos.get(g) ?? []), r]); });
    for (const rows of grupos.values()) {
      for (let i = 0; i < rows.length; i += 200) {
        const parte = rows.slice(i, i + 200);
        let q = sb.from(t).select([...CHAVES[t], 'updated_at'].join(',')).eq('org_id', orgId);
        CHAVES[t].slice(0, -1).forEach((c) => { q = q.eq(c, parte[0][c] as string); });
        const { data: atuais, error } = await q.in(ultimo, parte.map((r) => r[ultimo] as string));
        if (error) throw error;
        const nuvem = new Map(((atuais ?? []) as unknown as Row[]).map((r) => [chave(t, r), String(r.updated_at)] as const));
        parte.forEach((r) => { if (nuvem.get(chave(t, r)) !== versoes.get(chaveVersao(t, r))) conflitos.push(chaveVersao(t, r)); });
      }
    }
  }
  return conflitos;
}

/**
 * Envia só o que mudou desde o último estado sincronizado. Atualiza `snap` à medida que avança.
 * `permitidas`: só estas tabelas são gravadas (quem tem acesso parcial não mexe nas outras).
 * `ctrl`: com as versões lidas, confere antes se outra pessoa mexeu nas mesmas linhas e lança ConflitoErro (sem gravar nada);
 * `ctrl.forcar` grava mesmo assim. As versões são atualizadas após cada envio.
 */
export async function enviarMudancas(sb: SupabaseClient, orgId: string, L: Linhas, snap: Snap, permitidas?: ReadonlySet<Tabela>, ctrl?: { versoes: Versoes; forcar?: boolean }): Promise<number> {
  let total = 0;
  const novas: Record<Tabela, Row[]> = {} as Record<Tabela, Row[]>;
  const removidas: Record<Tabela, Row[]> = {} as Record<Tabela, Row[]>;
  TABELAS.forEach((t) => {
    if (permitidas && !permitidas.has(t)) { novas[t] = []; removidas[t] = []; return; }
    if (t === 'historico') {
      // registro de auditoria: o app só acrescenta; editar e apagar não são enviados (o banco também recusa)
      novas[t] = L[t].filter((r) => !snap[t].has(chave(t, r))); removidas[t] = []; return;
    }
    const atual = new Map(L[t].map((r) => [chave(t, r), r] as const));
    novas[t] = L[t].filter((r) => snap[t].get(chave(t, r)) !== JSON.stringify(r));
    removidas[t] = [...snap[t].keys()].filter((k) => !atual.has(k)).map((k) => {
      const parts = k.split('|'); const row: Row = {}; CHAVES[t].forEach((c, i) => { row[c] = parts[i]; }); return row;
    });
  });

  if (ctrl && !ctrl.forcar) {
    const conflitos = await conferirVersoes(sb, orgId, novas, snap, ctrl.versoes);
    if (conflitos.length) throw new ConflitoErro(conflitos);
  }

  // exclusões: filhos antes dos pais
  for (const t of [...ORDEM].reverse()) {
    const rem = removidas[t]; if (!rem.length) continue;
    const ultimo = CHAVES[t][CHAVES[t].length - 1];
    const grupos = new Map<string, Row[]>();
    rem.forEach((r) => { const g = CHAVES[t].slice(0, -1).map((c) => r[c]).join('|'); grupos.set(g, [...(grupos.get(g) ?? []), r]); });
    for (const rows of grupos.values()) {
      for (let i = 0; i < rows.length; i += 200) {
        const parte = rows.slice(i, i + 200);
        let q = sb.from(t).delete().eq('org_id', orgId);
        CHAVES[t].slice(0, -1).forEach((c) => { q = q.eq(c, parte[0][c] as string); });
        const { error } = await q.in(ultimo, parte.map((r) => r[ultimo] as string));
        if (error) throw error;
      }
    }
    rem.forEach((r) => { snap[t].delete(chave(t, r)); ctrl?.versoes.delete(chaveVersao(t, r)); });
    total += rem.length;
  }
  // inserções e alterações: pais antes dos filhos
  for (const t of ORDEM) {
    const rows = novas[t];
    for (let i = 0; i < rows.length; i += 500) {
      const parte = rows.slice(i, i + 500);
      const linhas = parte.map((r) => ({ ...r, org_id: orgId }));
      const opcoes = { onConflict: ['org_id', ...CHAVES[t]].join(','), ...(t === 'historico' ? { ignoreDuplicates: true } : {}) };
      const versionada = !!ctrl && VERSIONADAS.includes(t);
      let res = versionada ? await sb.from(t).upsert(linhas, opcoes).select([...CHAVES[t], 'updated_at'].join(',')) : await sb.from(t).upsert(linhas, opcoes);
      // banco ainda sem a coluna updated_at nesta tabela (script SQL antigo): grava sem acompanhar a versão
      if (res.error && versionada && /updated_at/.test(res.error.message ?? '')) res = await sb.from(t).upsert(linhas, opcoes);
      // banco ainda sem a coluna do responsável da equipe: grava sem ela (o nome continua indo no campo de texto)
      if (res.error && t === 'tarefas' && /responsavel_id/.test(res.error.message ?? '')) {
        res = await sb.from(t).upsert(linhas.map((r) => { const { responsavel_id: _ignorado, ...resto } = r as Row; return resto; }), opcoes);
      }
      if (res.error) throw res.error;
      if (versionada) ((res.data ?? []) as unknown as Row[]).forEach((r) => { if (r.updated_at != null) ctrl!.versoes.set(chaveVersao(t, r), String(r.updated_at)); });
      parte.forEach((r) => snap[t].set(chave(t, r), JSON.stringify(r)));
    }
    total += rows.length;
  }
  return total;
}
