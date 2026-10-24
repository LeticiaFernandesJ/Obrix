import { describe, expect, it } from 'vitest';
import { iso2n, n2br, parseData } from './dates';
import {
  aplicarCampo, calcular, difUtil, exemplo, importarTexto, makeCal, normalizarEstado, novaTarefa, novoEstado, pctRealAtual,
  predParse, predTexto, somaUtil,
} from './schedule';

const seg = iso2n('2026-03-02')!; // segunda-feira

function projeto(tarefas: Parameters<typeof novaTarefa>[0][]) {
  const S = novoEstado();
  S.meta.inicio = '2026-03-02';
  S.tarefas = tarefas.map((t) => novaTarefa(t));
  return S;
}

describe('datas', () => {
  it('aceita vários formatos', () => {
    expect(n2br(parseData('02/03/2026'))).toBe('02/03/2026');
    expect(parseData('2026-03-02')).toBe(seg);
    expect(parseData('02-03-26')).toBe(seg);
    expect(parseData('')).toBeNull();
    expect(parseData('abc')).toBeNull();
  });
});

describe('calendário', () => {
  it('pula fim de semana', () => {
    const cal = makeCal(novoEstado());
    expect(somaUtil(cal, seg, 4)).toBe(seg + 4); // seg → sex
    expect(somaUtil(cal, seg, 5)).toBe(seg + 7); // → próxima segunda
    expect(difUtil(cal, seg, seg + 6)).toBe(5);
  });
  it('respeita feriados e sábado trabalhado', () => {
    const S = novoEstado(); S.cal.fer = ['2026-03-04'];
    expect(somaUtil(makeCal(S), seg, 2)).toBe(seg + 3); // pula quarta
    S.cal.sab = true; S.cal.fer = [];
    expect(difUtil(makeCal(S), seg, seg + 6)).toBe(6);
  });
});

describe('motor do cronograma', () => {
  it('encadeia tarefas pela predecessora', () => {
    const S = projeto([{ id: 'a', nome: 'A', dur: 3 }, { id: 'b', nome: 'B', dur: 2 }]);
    S.tarefas[1].pred = predParse(S.tarefas, '1', 1);
    const c = calcular(S, makeCal(S));
    expect(c[0].ini).toBe(seg); expect(c[0].fim).toBe(seg + 2);
    expect(c[1].ini).toBe(seg + 3); expect(c[1].fim).toBe(seg + 4);
  });
  it('aplica início-início', () => {
    const S = projeto([{ id: 'a', dur: 4 }, { id: 'c', dur: 2 }]);
    S.tarefas[1].pred = predParse(S.tarefas, '1II', 1);
    const c = calcular(S, makeCal(S));
    expect(c[1].ini).toBe(seg); // começa junto com A
  });
  it('aplica defasagem de dias úteis', () => {
    const S = projeto([{ id: 'a', dur: 2 }, { id: 'b', dur: 1 }]);
    S.tarefas[1].pred = predParse(S.tarefas, '1TI+1', 1);
    const c = calcular(S, makeCal(S));
    expect(c[0].fim).toBe(seg + 1);
    expect(c[1].ini).toBe(seg + 3); // quarta é o dia seguinte; +1 dia útil → quinta
  });
  it('soma fases e calcula avanço ponderado', () => {
    const S = projeto([{ id: 'f', nome: 'Fase', nivel: 0 }, { id: 'a', nivel: 1, dur: 2, pct: 100 }, { id: 'b', nivel: 1, dur: 2, pct: 0 }]);
    S.tarefas[2].pred = predParse(S.tarefas, '2', 2);
    const c = calcular(S, makeCal(S));
    expect(c[0].res).toBe(true);
    expect(c[0].pct).toBe(50);
    expect(pctRealAtual(c)).toBe(50);
    expect(c[0].ini).toBe(seg); expect(c[0].fim).toBe(seg + 3);
  });
  it('marca o caminho crítico', () => {
    const S = projeto([{ id: 'a', dur: 3 }, { id: 'b', dur: 5 }, { id: 'c', dur: 1 }]);
    S.tarefas[2].pred = predParse(S.tarefas, '1;2', 2);
    const c = calcular(S, makeCal(S));
    expect(c[1].crit).toBe(true); // B é a mais longa
    expect(c[0].crit).toBe(false); // A tem folga
    expect(c[0].folga).toBeGreaterThan(0);
  });
  it('não trava com ciclo de dependências', () => {
    const S = projeto([{ id: 'a', dur: 1 }, { id: 'b', dur: 1 }]);
    S.tarefas[0].pred = [{ id: 'b', tipo: 'TI', lag: 0 }];
    S.tarefas[1].pred = [{ id: 'a', tipo: 'TI', lag: 0 }];
    const c = calcular(S, makeCal(S));
    expect(c.every((x) => x.erro === 'ciclo')).toBe(true);
  });
  it('exemplo pronto fica consistente', () => {
    const E = exemplo();
    const c = calcular(E, makeCal(E));
    const real = pctRealAtual(c);
    expect(E.tarefas).toHaveLength(20);
    expect(real).toBeGreaterThan(0); expect(real).toBeLessThan(100);
    expect(c.some((x) => x.crit)).toBe(true);
  });
});

describe('predecessoras e importação', () => {
  it('converte texto ↔ estrutura', () => {
    const S = projeto([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const p = predParse(S.tarefas, '1;2II+3;3FS-1', 2);
    expect(p.map((x) => x.id)).toEqual(['a', 'b']); // a linha 3 aponta para si mesma e é ignorada
    S.tarefas[2].pred = p;
    expect(predTexto(S.tarefas, S.tarefas[2])).toBe('1;2II+3');
  });
  it('importa texto do Excel com níveis e predecessoras', () => {
    const S = novoEstado();
    const n = importarTexto(S, makeCal(S), 'Item\tTarefa\tDuração\tInício\tPredecessoras\n1\tFundações\t\t\t\n1.1\tEscavação\t5\t02/03/2026\t\n1.2\tSapatas\t8\t\t2');
    expect(n).toBe(3);
    expect(S.tarefas.map((t) => t.nivel)).toEqual([0, 1, 1]);
    expect(S.tarefas[2].pred[0].id).toBe(S.tarefas[1].id);
    const c = calcular(S, makeCal(S));
    expect(n2br(c[1].ini)).toBe('02/03/2026');
    expect(n2br(c[2].ini)).toBe('09/03/2026');
  });
  it('ignora texto sem tarefas', () => {
    expect(importarTexto(novoEstado(), makeCal(novoEstado()), '\n\n')).toBe(0);
  });
});

describe('normalizarEstado', () => {
  it('aguenta dados corrompidos', () => {
    const S = normalizarEstado({
      tarefas: [null, { nome: 5, nivel: 'x', pred: 'abc' }, { id: 'a', nivel: 9, dur: '3', pred: [{ id: 'zz' }] }],
      meta: null, cal: { fer: 'x' }, medicoes: [1, { d: '2026-01-01', p: '5' }],
    } as never);
    expect(S.tarefas).toHaveLength(2);
    expect(S.tarefas[0].nivel).toBe(0);
    expect(S.tarefas[1].nivel).toBeLessThanOrEqual(1); // o nível não pode pular
    expect(S.medicoes).toEqual([{ d: '2026-01-01', p: 5 }]);
    expect(() => calcular(S, makeCal(S))).not.toThrow();
  });
});

describe('responsável da equipe', () => {
  it('a tarefa nasce sem pessoa da equipe e o arquivo carregado mantém só ids válidos', () => {
    expect(novaTarefa().respId).toBeNull();
    const S = normalizarEstado({ tarefas: [{ ...novaTarefa({ nome: 'a', resp: 'Ana', respId: 'u-1' }) }, { ...novaTarefa({ nome: 'b' }), respId: 5 as unknown as string }] });
    expect(S.tarefas[0].respId).toBe('u-1'); expect(S.tarefas[1].respId).toBeNull();
  });
  it('digitar outro nome na grade desfaz a ligação com a pessoa da equipe', () => {
    const S = novoEstado(); S.tarefas = [novaTarefa({ resp: 'Ana', respId: 'u-1' })];
    const cal = makeCal(S);
    aplicarCampo(S, cal, [], 0, 'resp', 'Ana'); expect(S.tarefas[0].respId).toBe('u-1'); // mesmo nome: continua
    aplicarCampo(S, cal, [], 0, 'resp', 'Seu José'); expect(S.tarefas[0].respId).toBeNull();
    expect(S.tarefas[0].resp).toBe('Seu José');
  });
});
