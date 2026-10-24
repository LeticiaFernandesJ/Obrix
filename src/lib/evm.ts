import { type DB, type Obra, totalPago } from './ac21';
import { hojeN, iso2n, n2brc, parseData } from './dates';
import { type Estado, calcular, curvaPrevista, makeCal, pctPrevistoEm, pctRealAtual, realEm, serieReal } from './schedule';

/* =========================== VALOR AGREGADO (EVM) ===========================
   Junta o físico (cronograma) com o financeiro (AC21) de cada obra:
   - Orçamento no término (BAC) = AC21 aprovado
   - Valor planejado (VP)  = BAC x % que deveria estar feito na data de status
   - Valor agregado (VA)   = BAC x % realmente feito
   - Custo real (CR)       = o que já foi pago (itens + compras pagas) */

export type Nivel = 'bom' | 'atencao' | 'critico' | 'indef';
export const nivelIndice = (i: number | null): Nivel => (i == null ? 'indef' : i >= 0.95 ? 'bom' : i >= 0.85 ? 'atencao' : 'critico');
const gravidade: Record<Nivel, number> = { indef: 0, bom: 1, atencao: 2, critico: 3 };
const pior = (a: Nivel, b: Nivel): Nivel => (gravidade[a] >= gravidade[b] ? a : b);

export interface EVM {
  bac: number; pctPrevisto: number; pctReal: number;
  vp: number; va: number; cr: number;
  /** variação de prazo (VA - VP) e de custo (VA - CR), em R$ */
  vprazo: number; vcusto: number;
  /** índices de desempenho de prazo e de custo; null quando ainda não dá para calcular */
  idp: number | null; idc: number | null;
  /** estimativa no término, para concluir e variação no término; eac é null se já se gastou sem avançar */
  eac: number | null; etc: number | null; vac: number | null;
  nivelPrazo: Nivel; nivelCusto: Nivel; nivel: Nivel;
  dataStatus: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function calcularEVM(obra: Obra, db: DB, S: Estado | undefined): EVM | null {
  if (!S || !S.tarefas.length || !(obra.ac21 > 0)) return null;
  const cal = makeCal(S), c = calcular(S, cal), cp = curvaPrevista(S, c, cal);
  if (!cp.dias.length) return null;
  const sd = parseData(S.meta.statusDate) ?? hojeN();
  const pctPrevisto = pctPrevistoEm(sd, cp), pctReal = pctRealAtual(c);
  const bac = obra.ac21;
  const vp = (bac * pctPrevisto) / 100, va = (bac * pctReal) / 100, cr = totalPago(db, obra);
  const idp = vp > 0.005 ? va / vp : null;
  const idc = cr > 0.005 ? va / cr : null;
  // se o índice de custo é zero (gastou e nada avançou), a estimativa não existe; sem gasto, vale o orçamento
  const eac = idc == null ? bac : idc > 0 ? bac / idc : null;
  const nivelPrazo = nivelIndice(idp), nivelCusto = nivelIndice(idc);
  return {
    bac, pctPrevisto, pctReal, vp: r2(vp), va: r2(va), cr: r2(cr), vprazo: r2(va - vp), vcusto: r2(va - cr),
    idp, idc, eac: eac == null ? null : r2(eac), etc: eac == null ? null : r2(eac - cr), vac: eac == null ? null : r2(bac - eac),
    nivelPrazo, nivelCusto, nivel: pior(nivelPrazo, nivelCusto), dataStatus: sd,
  };
}

/* =========================== CURVA S FINANCEIRA =========================== */
export interface CurvaFin { rotulos: string[]; planejado: number[]; agregado: (number | null)[]; custo: (number | null)[]; semData: number }

/** Quanto foi pago até cada dia: itens com data de pagamento e compras pagas; o que não tem data entra na data de status. */
function pagamentosPorDia(obra: Obra, db: DB): { dia: number | null; valor: number }[] {
  const itens = obra.itens.filter((i) => Number(i.pago) > 0).map((i) => ({ dia: iso2n(i.data), valor: Number(i.pago) }));
  const compras = db.compras.filter((c) => c.obraId === obra.id && c.status === 'Pago').map((c) => ({ dia: iso2n(c.data), valor: Number(c.total || 0) }));
  return [...itens, ...compras];
}

export function curvaFinanceira(obra: Obra, db: DB, S: Estado): CurvaFin | null {
  const cal = makeCal(S), c = calcular(S, cal), cp = curvaPrevista(S, c, cal);
  if (!cp.dias.length || !(obra.ac21 > 0)) return null;
  const sd = parseData(S.meta.statusDate) ?? hojeN();
  const pagos = pagamentosPorDia(obra, db);
  const datados = pagos.filter((p) => p.dia != null) as { dia: number; valor: number }[];
  const semData = pagos.filter((p) => p.dia == null).reduce((s, p) => s + p.valor, 0);
  const inicio = Math.min(cp.dias[0], ...datados.map((p) => p.dia)) - 1; // começa no dia anterior, onde tudo é zero
  const fim = Math.max(cp.dias[cp.dias.length - 1], sd);
  const serie = serieReal(S, c);

  const dias: number[] = [];
  for (let n = inicio; n <= fim; n += 7) dias.push(n);
  [sd, fim].forEach((n) => { if (n >= inicio && n <= fim && !dias.includes(n)) dias.push(n); }); // a data de status e o fim sempre aparecem
  dias.sort((a, b) => a - b);

  return {
    rotulos: dias.map((n) => n2brc(n)),
    planejado: dias.map((n) => r2((obra.ac21 * pctPrevistoEm(n, cp)) / 100)),
    agregado: dias.map((n) => (n > sd ? null : r2((obra.ac21 * (realEm(n, serie) ?? 0)) / 100))),
    custo: dias.map((n) => (n > sd ? null : r2(datados.filter((p) => p.dia <= n).reduce((s, p) => s + p.valor, 0) + (n >= sd ? semData : 0)))),
    semData: r2(semData),
  };
}
