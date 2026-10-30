import { afterEach, describe, expect, it, vi } from 'vitest';
import { type DB, type Obra, acimaDoOrcado, pagoDaCompra, restanteDaCompra, corPct, dbVazio, nivelPct, fmt, fmtNum, hojeISO, r2, totalComprometido, totalPago, totalItens, pct, pctInt, situacaoVerba } from './ac21';
import { comprasDaNFe, lerNFe } from './nfe';
import { type Estado, calcular, curvaPrevista, makeCal, novaTarefa, novoEstado, pctFis, pctPrevistoEm, pctRealAtual } from './schedule';
import { calcularEVM } from './evm';
import { diasEntre, fluxoMensal, resumoFinanceiro } from './financeiro';
import { n2iso, parseData } from './dates';

afterEach(() => vi.useRealTimers());

describe('dinheiro', () => {
  it('somas em centavos: 0,1 + 0,2 = 0,30 e nunca "-0,00"', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(r2(0.1 + 0.2)).toBe(0.3);
    expect(fmt(-0.0000001)).toBe('R$ 0,00'); expect(fmtNum(-0.004)).toBe('0,00');
    expect(fmt(1234.565).replace(/\s/g, ' ')).toMatch(/^R\$ 1\.234,5[67]$/);
    expect(fmt(null)).toBe('R$ 0,00'); expect(fmt('abc')).toBe('R$ 0,00');
  });
  it('totais da obra somam centavos exatos e o saldo zera de verdade', () => {
    const o: Obra = { id: 1, nome: 'A', codigo: 'A', local: '', responsavel: '', inicio: '', fim: '', ac21: 0.3, status: 'Em Andamento', obs: '',
      itens: [0.1, 0.2].map((v, k) => ({ id: k + 2, desc: 'i', cat: 'x', tipo: 'orcado' as const, orcado: v, pago: v, forn: '', nf: '', data: '', obs: '' })) };
    const db: DB = { ...dbVazio(), obras: [o] };
    expect(totalItens(o)).toBe(0.3); expect(totalPago(db, o)).toBe(0.3); expect(totalComprometido(db, o)).toBe(0.3);
    expect(o.ac21 - totalComprometido(db, o)).toBe(0);
    expect(situacaoVerba(totalComprometido(db, o), o.ac21)).toBe('esgotada');
    expect(pct(totalComprometido(db, o), o.ac21)).toBe(100); // igual ao AC21: 100%, não 99,9
  });
  it('percentuais: 0, 100, acima de 100 e AC21 zerado', () => {
    expect(pct(0, 100)).toBe(0); expect(pct(100, 100)).toBe(100); expect(pct(150, 100)).toBe(150); expect(pct(5, 0)).toBe(0); expect(pctInt(5, -1)).toBe(0);
    expect(pctInt(99.5, 100)).toBe(99); expect(pctInt(0.4, 100)).toBe(0);
  });
});

describe('datas', () => {
  it('hoje usa o relógio local (não o UTC): 23h30 do dia 8 continua sendo dia 8', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 2, 8, 23, 30, 0)); // hora local
    expect(hojeISO()).toBe('2026-03-08');
    vi.setSystemTime(new Date(2026, 11, 31, 0, 5, 0));
    expect(hojeISO()).toBe('2026-12-31');
  });
  it('dias entre datas: virada de mês, ano bissexto e horário de verão não mudam a conta', () => {
    expect(diasEntre('2026-02-28', '2026-03-01')).toBe(1); expect(diasEntre('2028-02-28', '2028-03-01')).toBe(2);
    expect(diasEntre('2026-03-08', '2026-03-08')).toBe(0); expect(diasEntre('2026-03-10', '2026-03-08')).toBe(-2);
    expect(diasEntre('2026-01-01', '2027-01-01')).toBe(365);
  });
});

describe('leitura de datas', () => {
  it('formatos comuns dão o mesmo dia, em qualquer fuso', () => {
    const alvo = parseData('2026-03-05');
    expect(n2iso(alvo as number)).toBe('2026-03-05');
    ['05/03/2026', '5-3-26', '2026-3-5', '2026-03-05T23:30:00-03:00', '2026-03-05 08:00'].forEach((t) => expect(parseData(t), t).toBe(alvo));
    expect(parseData('5 mar 2026')).toBe(alvo); expect(parseData('March 5, 2026')).toBe(alvo);
    expect(parseData('')).toBeNull(); expect(parseData('abc')).toBeNull(); expect(parseData(null)).toBeNull();
  });
});

describe('avanço físico', () => {
  it('só mostra 100% quando está completo', () => {
    expect(pctFis(99.6)).toBe(99); expect(pctFis(99.994)).toBe(99); expect(pctFis(100)).toBe(100); expect(pctFis(49.5)).toBe(50); expect(pctFis(0)).toBe(0);
    expect(pctFis(NaN)).toBe(0);
  });
});

describe('NF-e: rateio de frete, impostos e desconto nos itens', () => {
  const nota = (vNF: string) => `<nfeProc><NFe><infNFe Id="NFe${'1'.repeat(44)}"><ide><nNF>9</nNF><serie>1</serie><dhEmi>2026-03-01T10:00:00-03:00</dhEmi></ide>
    <emit><CNPJ>12345678000190</CNPJ><xNome>Forn</xNome></emit>
    <det nItem="1"><prod><xProd>A</xProd><uCom>UN</uCom><qCom>10</qCom><vUnCom>10</vUnCom><vProd>100.00</vProd></prod></det>
    <det nItem="2"><prod><xProd>B</xProd><uCom>UN</uCom><qCom>3</qCom><vUnCom>100</vUnCom><vProd>300.00</vProd></prod></det>
    <total><ICMSTot><vProd>400.00</vProd><vNF>${vNF}</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;
  const op = { obraId: 1, categoria: 'Insumos', status: 'Pendente' as const };
  it('a soma dos itens bate com o total da nota (frete de 40 e centavos que não dividem certo)', () => {
    const c = comprasDaNFe(lerNFe(nota('440.01')), { ...op, modo: 'itens' });
    expect(r2(c.reduce((s, x) => s + x.total, 0))).toBe(440.01);
    expect(c[0].total).toBeCloseTo(110, 1); expect(c[1].total).toBeCloseTo(330.01, 1);
  });
  it('desconto (nota menor que os produtos) também é rateado', () => {
    const c = comprasDaNFe(lerNFe(nota('380.00')), { ...op, modo: 'itens' });
    expect(r2(c.reduce((s, x) => s + x.total, 0))).toBe(380);
  });
  it('sem diferença nada muda; modo nota usa o total da nota', () => {
    const c = comprasDaNFe(lerNFe(nota('400.00')), { ...op, modo: 'itens' });
    expect(c.map((x) => x.total)).toEqual([100, 300]); expect(c[0].unit).toBe(10);
    expect(comprasDaNFe(lerNFe(nota('440.01')), { ...op, modo: 'nota' })[0].total).toBe(440.01);
  });
});

/* ---- propriedades do cronograma, com cronogramas sorteados (sorteio fixo: o teste é repetível) ---- */
function sorteador(semente: number) { let s = semente >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function sortear(sem: number): Estado {
  const r = sorteador(sem); const S = novoEstado(); S.meta.inicio = '2026-03-02'; S.meta.statusDate = '2026-04-15';
  S.cal.sab = r() < 0.3; S.cal.fer = r() < 0.5 ? ['2026-03-10', '2026-04-03'] : [];
  const n = 3 + Math.floor(r() * 12);
  for (let i = 0; i < n; i++) {
    const t = novaTarefa({ nome: 'T' + i, dur: 1 + Math.floor(r() * 9), pct: Math.floor(r() * 101), nivel: 0 });
    if (i > 0 && r() < 0.7) { const k = Math.floor(r() * i); t.pred = [{ id: S.tarefas[k].id, tipo: 'TI', lag: Math.floor(r() * 3) }]; }
    if (i > 0 && r() < 0.2) t.nivel = 1;
    S.tarefas.push(t);
  }
  return S;
}

describe('cronograma: propriedades em 300 cronogramas sorteados', () => {
  it('datas coerentes, folga nunca negativa, caminho crítico e resumos', () => {
    for (let k = 1; k <= 300; k++) {
      const S = sortear(k); const cal = makeCal(S); const c = calcular(S, cal);
      const ix = new Map(S.tarefas.map((t, i) => [t.id, i]));
      let temCritica = false;
      S.tarefas.forEach((t, i) => {
        const x = c[i];
        if (x.res) return;
        expect(x.ini, `cron ${k} tarefa ${i}`).not.toBeNull(); expect(x.fim as number).toBeGreaterThanOrEqual(x.ini as number);
        t.pred.forEach((p) => { const pi = ix.get(p.id) as number; if (!c[pi].res) expect(x.ini as number, `cron ${k} t${i} após t${pi}`).toBeGreaterThan(c[pi].fim as number); });
        expect(x.folga, `cron ${k} folga t${i}`).toBeGreaterThanOrEqual(0);
        if (x.folga === 0) temCritica = true;
      });
      expect(temCritica, `cron ${k} sem caminho crítico`).toBe(true);
      // resumo: do menor início ao maior término dos filhos, avanço entre o menor e o maior dos filhos
      S.tarefas.forEach((_, i) => {
        if (!c[i].res) return;
        let j = i + 1; const f: number[] = []; while (j < S.tarefas.length && S.tarefas[j].nivel > S.tarefas[i].nivel) { f.push(j); j++; }
        const fo = f.filter((q) => !c[q].res);
        expect(c[i].ini).toBe(Math.min(...f.map((q) => c[q].ini as number)));
        expect(c[i].fim).toBe(Math.max(...f.map((q) => c[q].fim as number)));
        expect(c[i].pct).toBeGreaterThanOrEqual(Math.min(...fo.map((q) => c[q].pct)) - 1e-9);
        expect(c[i].pct).toBeLessThanOrEqual(Math.max(...fo.map((q) => c[q].pct)) + 1e-9);
      });
      // curva S prevista: não decresce, começa em 0 e termina em 100
      const cp = curvaPrevista(S, c, cal);
      if (cp.dias.length) {
        let ant = 0; cp.dias.forEach((d) => { const v = cp.acum.get(d) as number; expect(v).toBeGreaterThanOrEqual(ant - 1e-9); ant = v; });
        expect(ant).toBeCloseTo(100, 6); expect(pctPrevistoEm(cp.dias[0] - 1, cp)).toBe(0);
      }
      const real = pctRealAtual(c); expect(real).toBeGreaterThanOrEqual(0); expect(real).toBeLessThanOrEqual(100);
    }
  });
});

describe('cronograma com todos os tipos de ligação e atrasos negativos', () => {
  it('nunca gera NaN nem término antes do início', () => {
    const tipos = ['TI', 'II', 'TT', 'IT'] as const;
    for (let k = 1; k <= 200; k++) {
      const r = sorteador(k * 7919); const S = novoEstado(); S.meta.inicio = '2026-03-02';
      const n = 3 + Math.floor(r() * 10);
      for (let i = 0; i < n; i++) {
        const t = novaTarefa({ nome: 'T' + i, dur: Math.floor(r() * 8), pct: Math.floor(r() * 101), marco: false });
        if (i > 0 && r() < 0.8) t.pred = [{ id: S.tarefas[Math.floor(r() * i)].id, tipo: tipos[Math.floor(r() * 4)], lag: Math.floor(r() * 7) - 3 }];
        if (r() < 0.2) t.iniM = 20500 + Math.floor(r() * 30);
        S.tarefas.push(t);
      }
      const c = calcular(S, makeCal(S));
      c.forEach((x, i) => {
        if (x.res) return;
        expect(Number.isFinite(x.ini), `cron ${k} t${i} ini`).toBe(true); expect(Number.isFinite(x.fim), `cron ${k} t${i} fim`).toBe(true);
        expect(x.fim as number).toBeGreaterThanOrEqual(x.ini as number); expect(Number.isFinite(x.folga)).toBe(true);
      });
    }
  });
});

describe('desempenho (EVM) com números conferidos à mão', () => {
  it('50% planejado, 25% feito, R$ 300 pagos de AC21 1000: IDP 0,5, IDC 0,83, EAC 1200', () => {
    const S = novoEstado(); S.meta.inicio = '2026-03-02'; S.meta.statusDate = '2026-03-06'; // segunda a sexta
    S.tarefas = [novaTarefa({ nome: 'A', dur: 5, pct: 25 }), novaTarefa({ nome: 'B', dur: 5, pct: 25 })];
    S.tarefas[1].pred = [{ id: S.tarefas[0].id, tipo: 'TI', lag: 0 }];
    const obra: Obra = { id: 1, nome: 'O', codigo: 'O', local: '', responsavel: '', inicio: '', fim: '', ac21: 1000, status: 'Em Andamento', obs: '',
      itens: [{ id: 2, desc: 'i', cat: 'x', tipo: 'orcado', orcado: 500, pago: 300, forn: '', nf: '', data: '', obs: '' }] };
    const e = calcularEVM(obra, { ...dbVazio(), obras: [obra] }, S)!;
    expect(e.pctPrevisto).toBeCloseTo(50, 5); expect(e.pctReal).toBeCloseTo(25, 5);
    expect(e.vp).toBe(500); expect(e.va).toBe(250); expect(e.cr).toBe(300);
    expect(e.idp).toBeCloseTo(0.5, 6); expect(e.idc).toBeCloseTo(250 / 300, 6);
    expect(e.eac).toBe(1200); expect(e.etc).toBe(900); expect(e.vac).toBe(-200); expect(e.vprazo).toBe(-250); expect(e.vcusto).toBe(-50);
    expect(e.nivelPrazo).toBe('critico');
  });
});

describe('cenário completo conferido à mão (AC21 R$ 100.000)', () => {
  const it0 = (id: number, tipo: 'orcado' | 'nao_orcado', orcado: number, pago: number) => ({ id, desc: 'i' + id, cat: 'x', tipo, orcado, pago, forn: '', nf: '', data: '', obs: '' });
  const cp = (id: number, total: number, status: 'Pago' | 'Pendente' | 'Parcial', valorPago = 0) => ({ id, obraId: 1, desc: 'c', cat: 'x', forn: '', cnpj: '', nf: '', data: '', qtde: 1, unid: '', unit: total, total, status, obs: '', venc: '', valorPago });
  const obra: Obra = { id: 1, nome: 'O', codigo: 'O', local: '', responsavel: '', inicio: '', fim: '', ac21: 100000, status: 'Em Andamento', obs: '',
    itens: [it0(2, 'orcado', 30000, 0), it0(3, 'orcado', 20000, 25000), { ...it0(4, 'orcado', 10000, 8000), quitado: true }, it0(5, 'nao_orcado', 0, 5000)] };
  const db: DB = { ...dbVazio(), obras: [obra], compras: [cp(6, 7000, 'Pago'), cp(7, 3000, 'Pendente'), cp(8, 4000, 'Parcial', 1000)] };
  it('comprometido, pago, saldos e "a pagar" fecham entre si', () => {
    // itens: 30.000 (ainda não pago, vale o orçado) + 25.000 (pago a mais) + 8.000 (quitado por menos) + 5.000 (não orçado) = 68.000; compras: 14.000
    expect(totalComprometido(db, obra)).toBe(82000);
    expect(totalPago(db, obra)).toBe(46000); // itens 38.000 + compra paga 7.000 + 1.000 já pagos da compra parcial
    expect(obra.ac21 - totalComprometido(db, obra)).toBe(18000);
    expect(obra.ac21 - totalPago(db, obra)).toBe(54000);
    expect(totalComprometido(db, obra) - totalPago(db, obra)).toBe(36000); // a pagar = 30.000 do item + 3.000 + 3.000 que faltam da compra parcial
    expect(acimaDoOrcado(obra)).toEqual({ valor: 5000, qtd: 1 });
  });
});

describe('pagamento parcial', () => {
  const base = { obraId: 1, desc: 'c', cat: 'x', forn: '', cnpj: '', nf: '', data: '2026-03-10', qtde: 1, unid: '', unit: 0, obs: '', venc: '2026-04-10' };
  it('compra parcial: pago e restante fecham com o total e nunca passam dele', () => {
    const c = (status: 'Pago' | 'Pendente' | 'Parcial', valorPago?: number) => ({ id: 1, ...base, total: 1000, status, valorPago });
    expect([pagoDaCompra(c('Pago')), restanteDaCompra(c('Pago'))]).toEqual([1000, 0]);
    expect([pagoDaCompra(c('Pendente', 300)), restanteDaCompra(c('Pendente', 300))]).toEqual([0, 1000]); // o valor só vale em "Parcial"
    expect([pagoDaCompra(c('Parcial', 400)), restanteDaCompra(c('Parcial', 400))]).toEqual([400, 600]);
    expect([pagoDaCompra(c('Parcial', 5000)), restanteDaCompra(c('Parcial', 5000))]).toEqual([1000, 0]);
    expect([pagoDaCompra(c('Parcial')), restanteDaCompra(c('Parcial'))]).toEqual([0, 1000]);
  });
  it('financeiro: a pagar conta só o restante e o pago do mês conta o que já saiu', () => {
    const lista = [{ id: 1, ...base, total: 1000, status: 'Parcial' as const, valorPago: 400 }, { id: 2, ...base, total: 500, status: 'Pendente' as const }, { id: 3, ...base, total: 200, status: 'Pago' as const }];
    const r = resumoFinanceiro(lista, '2026-03-20');
    expect(r.aPagar).toEqual({ n: 2, valor: 1100 }); expect(r.pagoNoMes).toEqual({ n: 2, valor: 600 });
    const f = fluxoMensal(lista, '2026-03-20').find((x) => x.mes === '2026-04')!; expect(f.aPagar).toBe(1100);
    expect(fluxoMensal(lista, '2026-03-20').find((x) => x.mes === '2026-03')!.pago).toBe(600);
  });
});

describe('faixas de status iguais às do alerta de verba', () => {
  it('verde até 89%, amarelo de 90% a 99%, vermelho a partir de 100%', () => {
    expect([89, 90, 99, 100, 120].map((p) => nivelPct(p))).toEqual(['ok', 'warn', 'warn', 'danger', 'danger']);
    expect([89, 90, 99, 100].map((p) => corPct(p))).toEqual(['var(--green)', 'var(--amber)', 'var(--amber)', 'var(--red)']);
    expect(nivelPct(pctInt(2915790.59, 2923305))).toBe('warn'); // o caso do alerta falso: 99,74%
  });
});
