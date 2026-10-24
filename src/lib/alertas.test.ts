import { describe, expect, it } from 'vitest';
import { type Compra, type DB, type Obra, dbVazio } from './ac21';
import { gerarAlertas } from './alertas';
import { type Estado, novaTarefa, novoEstado, predParse } from './schedule';

const HOJE = '2026-03-08';
const obra = (extra: Partial<Obra> = {}): Obra => ({
  id: 1, nome: 'Galpão', codigo: 'G-1', local: '', responsavel: '', inicio: '', fim: '', ac21: 1000, status: 'Em Andamento', obs: '', itens: [], ...extra,
});
const compra = (o: Partial<Compra>): Compra => ({
  id: Math.floor(Math.random() * 1e9), obraId: 1, desc: 'c', cat: 'x', forn: 'f', cnpj: '', nf: '', data: '2026-03-01', qtde: 1, unid: '', unit: 0,
  total: 100, status: 'Pendente', obs: '', venc: '', ...o,
});
const base = (o: Obra, compras: Compra[] = []): DB => ({ ...dbVazio(), obras: [o], compras });
const item = (orcado: number, pago: number) => ({ id: Math.random(), desc: 'i', cat: 'x', tipo: 'orcado' as const, orcado, pago, forn: '', nf: '', data: '', obs: '' });

function cronograma(pctA: number, pctB: number): Estado {
  const S = novoEstado(); S.meta.inicio = '2026-03-02'; S.meta.statusDate = HOJE;
  S.tarefas = [novaTarefa({ id: 'a', dur: 5, pct: pctA }), novaTarefa({ id: 'b', dur: 5, pct: pctB })];
  S.tarefas[1].pred = predParse(S.tarefas, '1', 1);
  return S;
}
const ids = (a: { id: string }[]) => a.map((x) => x.id).sort();

describe('alertas', () => {
  it('obra saudável não gera alerta', () => {
    const o = obra({ itens: [item(300, 100)] });
    expect(gerarAlertas(base(o), { '1': cronograma(100, 0) }, HOJE)).toEqual([]);
  });

  it('verba: atenção a partir de 90% e crítico a partir de 100% do comprometido', () => {
    expect(gerarAlertas(base(obra({ itens: [item(900, 0)] })), {}, HOJE).map((a) => [a.id, a.nivel])).toEqual([['verba-1', 'atencao']]);
    const a = gerarAlertas(base(obra({ itens: [item(1000, 0)] })), {}, HOJE);
    expect(a.map((x) => [x.id, x.nivel])).toEqual([['verba-1', 'critico']]);
    expect(a[0].titulo).toBe('Verba estourada'); expect(a[0].rota).toBe('/detalhe'); expect(a[0].obraId).toBe(1);
  });

  it('pagamentos acima do AC21 são críticos', () => {
    const a = gerarAlertas(base(obra({ itens: [item(0, 1500)] })), {}, HOJE);
    expect(ids(a)).toContain('pago-1');
  });

  it('contas vencidas (crítico) e que vencem em até 3 dias (atenção), com plural correto', () => {
    const compras = [compra({ venc: '2026-03-01', total: 200 }), compra({ venc: '2026-03-02', total: 300 }), compra({ venc: '2026-03-10', total: 50 }),
      compra({ venc: '2026-03-30' }), compra({ venc: '2026-03-01', status: 'Pago' }), compra({})];
    const a = gerarAlertas(base(obra(), compras), {}, HOJE);
    const v = a.find((x) => x.id === 'venc-1')!;
    expect(v.nivel).toBe('critico'); expect(v.texto).toContain('2 contas vencidas'); expect(v.texto).toContain('500,00'); expect(v.rota).toBe('/financeiro');
    const b = a.find((x) => x.id === 'breve-1')!;
    expect(b.nivel).toBe('atencao'); expect(b.texto).toContain('1 conta vence');
    expect(a[0].nivel).toBe('critico'); // críticos primeiro
  });

  it('tarefa atrasada no cronograma; com mais de 3 vira crítico', () => {
    const S1 = cronograma(100, 0); S1.meta.statusDate = '2026-03-20';
    const a = gerarAlertas(base(obra()), { '1': S1 }, '2026-03-20');
    expect(a.some((x) => x.id === 'atraso-1' && x.nivel === 'atencao' && x.texto.includes('1 tarefa atrasada'))).toBe(true);
    const S = novoEstado(); S.meta.inicio = '2026-03-02'; S.meta.statusDate = '2026-03-30';
    S.tarefas = [1, 2, 3, 4].map((i) => novaTarefa({ id: 't' + i, dur: 2, pct: 0 }));
    expect(gerarAlertas(base(obra()), { '1': S }, HOJE).find((x) => x.id === 'atraso-1')!.nivel).toBe('critico');
  });

  it('desempenho: obra atrasada e custo acima do avanço', () => {
    const o = obra({ itens: [item(0, 1000)] });
    const a = gerarAlertas(base(o), { '1': cronograma(50, 0) }, HOJE);
    expect(a.find((x) => x.id === 'idp-1')!.nivel).toBe('critico');
    expect(a.find((x) => x.id === 'idc-1')!.texto).toContain('índice de custo 0,25');
  });

  it('obra concluída ou suspensa não gera alerta de cronograma, mas contas vencidas continuam', () => {
    const compras = [compra({ venc: '2026-03-01' })];
    const a = gerarAlertas(base(obra({ status: 'Concluída' }), compras), { '1': cronograma(0, 0) }, '2026-03-20');
    expect(ids(a)).toEqual(['venc-1']);
  });

  it('cada obra tem os seus alertas', () => {
    const db: DB = { ...dbVazio(), obras: [obra({ id: 1, itens: [item(1000, 0)] }), obra({ id: 2, codigo: '', nome: 'Ponte', itens: [item(950, 0)] })] };
    const a = gerarAlertas(db, {}, HOJE);
    expect(a.map((x) => [x.id, x.nivel])).toEqual([['verba-1', 'critico'], ['verba-2', 'atencao']]);
    expect(a[1].texto.startsWith('Ponte:')).toBe(true);
  });
});
