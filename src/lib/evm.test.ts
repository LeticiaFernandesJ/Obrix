import { describe, expect, it } from 'vitest';
import { type DB, type Obra, dbVazio } from './ac21';
import { calcularEVM, curvaFinanceira, nivelIndice } from './evm';
import { iso2n } from './dates';
import { type Estado, novaTarefa, novoEstado, predParse } from './schedule';

/** Duas tarefas de 5 dias úteis em sequência (03/03 a 06/03 e 09/03 a 13/03). */
function cronograma(pctA: number, pctB: number, status: string): Estado {
  const S = novoEstado();
  S.meta.inicio = '2026-03-02'; S.meta.statusDate = status;
  S.tarefas = [novaTarefa({ id: 'a', dur: 5, pct: pctA }), novaTarefa({ id: 'b', dur: 5, pct: pctB })];
  S.tarefas[1].pred = predParse(S.tarefas, '1', 1);
  return S;
}
const obra = (extra: Partial<Obra> = {}): Obra => ({
  id: 1, nome: 'O', codigo: 'O-1', local: '', responsavel: '', inicio: '', fim: '', ac21: 1000, status: 'Em Andamento', obs: '', itens: [], ...extra,
});
const bd = (o: Obra, compras: DB['compras'] = []): DB => ({ ...dbVazio(), obras: [o], compras });
const itemPago = (pago: number, data = '') => ({ id: Math.random(), desc: 'i', cat: 'x', tipo: 'orcado' as const, orcado: 0, pago, forn: '', nf: '', data, obs: '' });

describe('valor agregado', () => {
  it('no ritmo e dentro do custo: índices 1 e estimativa igual ao orçamento', () => {
    // domingo 08/03: a primeira tarefa (50% do físico) já devia estar pronta e está
    const o = obra({ itens: [itemPago(500)] });
    const e = calcularEVM(o, bd(o), cronograma(100, 0, '2026-03-08'))!;
    expect(e.pctPrevisto).toBeCloseTo(50, 5); expect(e.pctReal).toBeCloseTo(50, 5);
    expect(e.vp).toBe(500); expect(e.va).toBe(500); expect(e.cr).toBe(500);
    expect(e.idp).toBeCloseTo(1, 5); expect(e.idc).toBeCloseTo(1, 5);
    expect(e.eac).toBe(1000); expect(e.vac).toBe(0); expect(e.etc).toBe(500);
    expect(e.nivel).toBe('bom');
  });
  it('gastou menos do que avançou: índice de custo acima de 1, sobra no término', () => {
    const o = obra({ itens: [itemPago(400)] });
    const e = calcularEVM(o, bd(o), cronograma(100, 0, '2026-03-08'))!;
    expect(e.idc).toBeCloseTo(1.25, 5);
    expect(e.eac).toBe(800); expect(e.vac).toBe(200); expect(e.vcusto).toBe(100);
  });
  it('gastou mais do que avançou: estoura a estimativa e fica crítico', () => {
    const o = obra({ itens: [itemPago(1000)] });
    const e = calcularEVM(o, bd(o), cronograma(100, 0, '2026-03-08'))!;
    expect(e.idc).toBeCloseTo(0.5, 5);
    expect(e.eac).toBe(2000); expect(e.vac).toBe(-1000);
    expect(e.nivelCusto).toBe('critico'); expect(e.nivel).toBe('critico');
  });
  it('atrasado no físico: índice de prazo abaixo de 1', () => {
    const o = obra({ itens: [itemPago(250)] });
    const e = calcularEVM(o, bd(o), cronograma(50, 0, '2026-03-08'))!;
    expect(e.idp).toBeCloseTo(0.5, 5); expect(e.vprazo).toBe(-250);
    expect(e.nivelPrazo).toBe('critico');
  });
  it('soma as compras pagas ao custo real, mas não as pendentes', () => {
    const o = obra({ itens: [itemPago(100)] });
    const compras = [
      { id: 1, obraId: 1, desc: 'c', cat: 'x', forn: '', cnpj: '', nf: '', data: '2026-03-04', qtde: 1, unid: '', unit: 0, total: 300, status: 'Pago' as const, obs: '', venc: '' },
      { id: 2, obraId: 1, desc: 'c', cat: 'x', forn: '', cnpj: '', nf: '', data: '2026-03-04', qtde: 1, unid: '', unit: 0, total: 999, status: 'Pendente' as const, obs: '', venc: '' },
    ];
    expect(calcularEVM(o, bd(o, compras), cronograma(100, 0, '2026-03-08'))!.cr).toBe(400);
  });
  it('sem gasto ainda, não há índice de custo e vale o orçamento', () => {
    const o = obra();
    const e = calcularEVM(o, bd(o), cronograma(100, 0, '2026-03-08'))!;
    expect(e.idc).toBeNull(); expect(e.eac).toBe(1000); expect(e.nivelCusto).toBe('indef');
  });
  it('gastou sem avançar nada: não existe estimativa', () => {
    const o = obra({ itens: [itemPago(300)] });
    const e = calcularEVM(o, bd(o), cronograma(0, 0, '2026-03-08'))!;
    expect(e.idc).toBe(0); expect(e.eac).toBeNull(); expect(e.vac).toBeNull();
  });
  it('sem cronograma, sem tarefas ou sem verba não calcula', () => {
    const o = obra();
    expect(calcularEVM(o, bd(o), undefined)).toBeNull();
    expect(calcularEVM(o, bd(o), novoEstado())).toBeNull();
    expect(calcularEVM(obra({ ac21: 0 }), bd(o), cronograma(0, 0, '2026-03-08'))).toBeNull();
  });
  it('classifica os índices', () => {
    expect(nivelIndice(1)).toBe('bom'); expect(nivelIndice(0.95)).toBe('bom');
    expect(nivelIndice(0.9)).toBe('atencao'); expect(nivelIndice(0.85)).toBe('atencao');
    expect(nivelIndice(0.84)).toBe('critico'); expect(nivelIndice(null)).toBe('indef');
  });
});

describe('curva S financeira', () => {
  it('planejado vai de 0 ao orçamento; agregado e custo param na data de status', () => {
    const o = obra({ itens: [itemPago(200, '2026-03-03'), itemPago(100, '2026-03-05'), itemPago(50)] });
    const f = curvaFinanceira(o, bd(o), cronograma(100, 0, '2026-03-11'))!;
    expect(f.planejado[0]).toBe(0);
    expect(f.planejado[f.planejado.length - 1]).toBe(1000);
    expect(f.agregado[f.agregado.length - 1]).toBeNull(); // depois da data de status
    const iSd = f.rotulos.indexOf('11/mar');
    expect(f.custo[iSd]).toBe(350); // 200 + 100 + 50 sem data (entra na data de status)
    expect(f.semData).toBe(50);
    expect(f.custo.filter((v) => v != null).every((v, i, a) => i === 0 || v! >= a[i - 1]!)).toBe(true); // nunca diminui
  });
  it('não calcula sem cronograma', () => {
    expect(curvaFinanceira(obra(), bd(obra()), novoEstado())).toBeNull();
    expect(iso2n('2026-03-08')).toBeGreaterThan(0);
  });
});
