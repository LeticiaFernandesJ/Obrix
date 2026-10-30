import { type Estado, type Pred, type Tarefa, normalizarEstado, novaTarefa } from './schedule';

/* Importação e exportação de cronogramas por obra.
   Tudo aqui é função pura: calcula o cronograma novo de UMA obra e devolve; quem chama aplica de uma vez só. */

export const LIMITE_TAREFAS = 3000;
/** Tamanho máximo de um arquivo importado (cronograma, backup, NF-e): arquivos maiores travam a tela e não são cronogramas. */
export const LIMITE_ARQUIVO_MB = 20;
export const arquivoGrandeDemais = (f: { size: number }) => f.size > LIMITE_ARQUIVO_MB * 1024 * 1024;
export const AVISO_ARQUIVO_GRANDE = `O arquivo tem mais de ${LIMITE_ARQUIVO_MB} MB, o que é grande demais para ser importado com segurança.`;
export const MAX_BACKUPS = 3;

/** atualizar: casa as tarefas do arquivo com as já existentes (sem duplicar); acrescentar: coloca no fim; substituir: troca tudo. */
export type ModoImport = 'atualizar' | 'acrescentar' | 'substituir';
export const MODOS_IMPORT: { id: ModoImport; rotulo: string; ajuda: string }[] = [
  { id: 'atualizar', rotulo: 'Atualizar o cronograma (sem duplicar)', ajuda: 'Tarefas com o mesmo nome e nível são atualizadas; as novas entram; as que não vieram no arquivo são mantidas.' },
  { id: 'acrescentar', rotulo: 'Acrescentar no fim', ajuda: 'Tudo que vier no arquivo entra como tarefa nova, no fim do cronograma.' },
  { id: 'substituir', rotulo: 'Substituir o cronograma inteiro', ajuda: 'Apaga o cronograma atual desta obra e usa o do arquivo (a versão atual fica guardada para restaurar).' },
];

export interface ObraRef { id: number; nome: string; codigo: string }
/** Arquivo .json exportado: o cronograma vem com a identificação da obra de origem, para conferir antes de importar. */
export interface ArquivoCrono { obrix: 'cronograma'; v: 1; obra: ObraRef; exportadoEm: string; cronograma: Estado }

export function montarArquivo(obra: ObraRef | null, crono: Estado, agora = new Date()): ArquivoCrono | Estado {
  if (!obra) return crono;
  return { obrix: 'cronograma', v: 1, obra: { id: obra.id, nome: obra.nome, codigo: obra.codigo }, exportadoEm: agora.toISOString(), cronograma: crono };
}

const eObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Lê o conteúdo de um .json: aceita o formato com identificação da obra e o antigo (só o cronograma). */
export function lerArquivo(obj: unknown): { estado: Estado; obra: ObraRef | null } {
  if (!eObj(obj)) throw new Error('o arquivo não tem um cronograma do Obrix.');
  let obra: ObraRef | null = null;
  let corpo: unknown = obj;
  if (obj.obrix === 'cronograma' && eObj(obj.cronograma)) {
    corpo = obj.cronograma;
    const o = obj.obra;
    if (eObj(o) && Number.isFinite(Number(o.id))) obra = { id: Number(o.id), nome: String(o.nome ?? ''), codigo: String(o.codigo ?? '') };
  }
  if (!eObj(corpo) || !Array.isArray(corpo.tarefas)) throw new Error('o arquivo não tem um cronograma do Obrix.');
  return { estado: normalizarEstado(corpo as Partial<Estado>), obra };
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const chaveDe = (t: Pick<Tarefa, 'nome' | 'nivel'>) => norm(t.nome) + '|' + t.nivel;

export interface Resumo { atualizadas: number; novas: number; mantidas: number; removidas: number }

/** Junta as tarefas do arquivo às da obra sem duplicar. Só devolve tarefas novas; não altera os argumentos. */
export function mesclarTarefas(atual: Tarefa[], vindas: Tarefa[], mesmaObra: boolean): { tarefas: Tarefa[]; resumo: Resumo } {
  const usados = new Set<number>();
  const par = new Map<number, number>(); // posição no arquivo -> posição na obra
  const porId = new Map(atual.map((t, i) => [t.id, i]));
  vindas.forEach((v, j) => {
    const i = porId.get(v.id);
    if (i !== undefined && !usados.has(i) && (mesmaObra || norm(atual[i].nome) === norm(v.nome))) { usados.add(i); par.set(j, i); }
  });
  const filas = new Map<string, number[]>();
  atual.forEach((t, i) => { if (!usados.has(i)) { const k = chaveDe(t); filas.set(k, [...(filas.get(k) ?? []), i]); } });
  vindas.forEach((v, j) => {
    if (par.has(j)) return;
    const q = filas.get(chaveDe(v));
    if (q && q.length) { const i = q.shift() as number; usados.add(i); par.set(j, i); }
  });

  const ocupados = new Set(atual.map((t) => t.id));
  const idFinal = new Map<string, string>(); // id no arquivo -> id na obra
  vindas.forEach((v, j) => {
    const i = par.get(j);
    if (i !== undefined) { idFinal.set(v.id, atual[i].id); return; }
    let id = v.id;
    while (ocupados.has(id)) id = novaTarefa().id;
    ocupados.add(id); idFinal.set(v.id, id);
  });

  const refaz = (preds: Pred[], dono: string): Pred[] =>
    preds.map((p) => ({ ...p, id: idFinal.get(p.id) ?? '' })).filter((p) => p.id && p.id !== dono);
  let atualizadas = 0, novas = 0;
  const tarefas = vindas.map((v, j): Tarefa => {
    const i = par.get(j);
    const id = idFinal.get(v.id) as string;
    if (i === undefined) { novas++; return { ...v, id, pred: refaz(v.pred, id) }; }
    atualizadas++;
    const a = atual[i];
    const mudouResp = !!v.resp && v.resp !== a.resp;
    return {
      ...a, nome: v.nome, nivel: v.nivel, dur: v.dur, marco: v.marco,
      iniM: v.iniM ?? a.iniM, peso: v.peso ?? a.peso, pct: v.pct > 0 ? v.pct : a.pct,
      rIni: v.rIni ?? a.rIni, rFim: v.rFim ?? a.rFim,
      pred: v.pred.length ? refaz(v.pred, id) : a.pred,
      resp: mudouResp ? v.resp : a.resp, respId: mudouResp ? null : a.respId,
    };
  });
  const mantidas = atual.filter((_, i) => !usados.has(i));
  return { tarefas: tarefas.concat(mantidas), resumo: { atualizadas, novas, mantidas: mantidas.length, removidas: 0 } };
}

export interface Extra { cal?: Estado['cal'] | null; inicio?: string; nome?: string }

/** Calcula o cronograma resultante da importação numa obra. Lança erro (e nada é aplicado) se o arquivo não servir. */
export function aplicarImportacao(atual: Estado, vindas: Tarefa[], modo: ModoImport, opc: { mesmaObra?: boolean; extra?: Extra } = {}): { estado: Estado; resumo: Resumo } {
  if (!vindas.length) throw new Error('o arquivo não tem nenhuma tarefa.');
  if (vindas.length > LIMITE_TAREFAS) throw new Error(`o arquivo tem ${vindas.length} tarefas; o limite é ${LIMITE_TAREFAS}.`);
  const S: Estado = JSON.parse(JSON.stringify(atual));
  let resumo: Resumo;
  if (modo === 'substituir') {
    S.tarefas = vindas.map((t) => ({ ...t })); S.medicoes = [];
    const x = opc.extra;
    if (x?.cal) S.cal = x.cal; if (x?.inicio) S.meta.inicio = x.inicio; if (x?.nome && !S.meta.nome) S.meta.nome = x.nome;
    resumo = { atualizadas: 0, novas: vindas.length, mantidas: 0, removidas: atual.tarefas.length };
  } else if (modo === 'acrescentar') {
    const ocupados = new Set(S.tarefas.map((t) => t.id)); const novoId = new Map<string, string>();
    vindas.forEach((v) => { let id = v.id; while (ocupados.has(id)) id = novaTarefa().id; ocupados.add(id); novoId.set(v.id, id); });
    S.tarefas = S.tarefas.concat(vindas.map((v) => ({ ...v, id: novoId.get(v.id) as string, pred: v.pred.map((p) => ({ ...p, id: novoId.get(p.id) ?? '' })).filter((p) => p.id) })));
    resumo = { atualizadas: 0, novas: vindas.length, mantidas: atual.tarefas.length, removidas: 0 };
  } else {
    const r = mesclarTarefas(S.tarefas, vindas, !!opc.mesmaObra);
    S.tarefas = r.tarefas; resumo = r.resumo;
  }
  if (S.tarefas.length > LIMITE_TAREFAS) throw new Error(`o cronograma ficaria com ${S.tarefas.length} tarefas; o limite é ${LIMITE_TAREFAS}.`);
  // predecessoras que apontam para tarefas que não existem são descartadas
  const ids = new Set(S.tarefas.map((t) => t.id));
  S.tarefas.forEach((t) => { t.pred = t.pred.filter((p) => ids.has(p.id) && p.id !== t.id); });
  return { estado: normalizarEstado(S), resumo };
}

/** Devolve o mapa de cronogramas com a troca de UMA obra; as demais continuam exatamente como estavam (mesmas referências). */
export function trocarCronoDaObra(cronos: Record<string, Estado>, obraId: number, novo: Estado, obrasIds: number[]): Record<string, Estado> {
  if (!obrasIds.includes(obraId)) throw new Error('a obra de destino não existe mais.');
  return { ...cronos, [String(obraId)]: novo };
}

/* ---------- cópia de segurança antes de substituir ---------- */
export interface BackupCrono { ts: string; motivo: string; estado: Estado }
export function empilharBackup(lista: BackupCrono[], b: BackupCrono): BackupCrono[] {
  if (!b.estado.tarefas.length) return lista; // não há o que guardar
  return [b, ...lista].slice(0, MAX_BACKUPS);
}

export const textoResumo = (r: Resumo) => {
  const p: string[] = [];
  if (r.atualizadas) p.push(`${r.atualizadas} atualizada${r.atualizadas === 1 ? '' : 's'}`);
  if (r.novas) p.push(`${r.novas} nova${r.novas === 1 ? '' : 's'}`);
  if (r.mantidas) p.push(`${r.mantidas} mantida${r.mantidas === 1 ? '' : 's'} sem alteração`);
  if (r.removidas) p.push(`${r.removidas} removida${r.removidas === 1 ? '' : 's'}`);
  return p.join(', ');
};
