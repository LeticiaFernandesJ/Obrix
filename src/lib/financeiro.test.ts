import { describe, expect, it } from 'vitest';
import type { Compra } from './ac21';
import { contasAbertas, diasEntre, fluxoMensal, resumoFinanceiro, situacaoConta, textoSituacao } from './financeiro';

const HOJE = '2026-10-15';
let n = 0;
const compra = (o: Partial<Compra>): Compra => ({
  id: ++n, obraId: 1, desc: 'c', cat: 'x', forn: 'f', cnpj: '', nf: '', data: '2026-10-01', qtde: 1, unid: '', unit: 0, total: 100,
  status: 'Pendente', obs: '', venc: '', ...o,
});

describe('situação da conta', () => {
  it('classifica pelo vencimento', () => {
    expect(situacaoConta(compra({ status: 'Pago', venc: '2020-01-01' }), HOJE).tipo).toBe('paga');
    expect(situacaoConta(compra({}), HOJE).tipo).toBe('sem_venc');
    expect(situacaoConta(compra({ venc: '2026-10-10' }), HOJE)).toEqual({ tipo: 'vencida', dias: 5 });
    expect(situacaoConta(compra({ venc: '2026-10-15' }), HOJE).tipo).toBe('hoje');
    expect(situacaoConta(compra({ venc: '2026-10-22' }), HOJE)).toEqual({ tipo: 'proxima', dias: 7 });
    expect(situacaoConta(compra({ venc: '2026-10-23' }), HOJE)).toEqual({ tipo: 'futura', dias: 8 });
  });
  it('conta dias corretamente na virada de mês e de ano', () => {
    expect(diasEntre('2026-12-30', '2027-01-02')).toBe(3);
    expect(diasEntre('2026-02-27', '2026-03-01')).toBe(2);
  });
  it('escreve a situação em português, no singular e no plural', () => {
    expect(textoSituacao({ tipo: 'vencida', dias: 1 })).toBe('Venceu há 1 dia');
    expect(textoSituacao({ tipo: 'vencida', dias: 4 })).toBe('Venceu há 4 dias');
    expect(textoSituacao({ tipo: 'proxima', dias: 1 })).toBe('Vence amanhã');
    expect(textoSituacao({ tipo: 'futura', dias: 12 })).toBe('Vence em 12 dias');
    expect(textoSituacao({ tipo: 'hoje', dias: 0 })).toBe('Vence hoje');
  });
});

describe('resumo financeiro', () => {
  const lista = [
    compra({ total: 100, venc: '2026-10-10' }),                 // vencida
    compra({ total: 200, venc: '2026-10-15' }),                 // hoje
    compra({ total: 300, venc: '2026-10-20' }),                 // próxima (5 dias)
    compra({ total: 400, venc: '2026-11-10' }),                 // 26 dias
    compra({ total: 500, venc: '2026-12-31' }),                 // futura além de 30
    compra({ total: 50 }),                                      // sem vencimento
    compra({ total: 999, status: 'Pago', data: '2026-10-03' }), // paga neste mês
    compra({ total: 111, status: 'Pago', data: '2026-09-03' }), // paga em outro mês
    compra({ total: 70, status: 'Parcial', venc: '2026-10-16' }), // parcial conta como a pagar
  ];
  const r = resumoFinanceiro(lista, HOJE);
  it('soma cada faixa', () => {
    expect(r.vencidas).toEqual({ n: 1, valor: 100 });
    expect(r.hoje).toEqual({ n: 1, valor: 200 });
    expect(r.proximos7).toEqual({ n: 3, valor: 570 });        // hoje + 5 dias + amanhã (parcial)
    expect(r.proximos30).toEqual({ n: 4 + 0, valor: 200 + 300 + 400 + 70 });
    expect(r.semVencimento).toEqual({ n: 1, valor: 50 });
    expect(r.pagoNoMes).toEqual({ n: 1, valor: 999 });
  });
  it('o total a pagar inclui tudo que não foi pago', () => {
    expect(r.aPagar.valor).toBe(100 + 200 + 300 + 400 + 500 + 50 + 70);
    expect(r.aPagar.n).toBe(7);
  });
});

describe('fluxo mensal', () => {
  it('cobre 2 meses para trás e 5 para frente, atravessando o ano', () => {
    const f = fluxoMensal([], HOJE);
    expect(f.map((x) => x.mes)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
    expect(f[0].rotulo).toBe('ago/26'); expect(f[5].rotulo).toBe('jan/27');
  });
  it('separa o que vence do que foi pago, por mês', () => {
    const f = fluxoMensal([
      compra({ total: 100, venc: '2026-11-05' }), compra({ total: 50, venc: '2026-11-25' }),
      compra({ total: 70, status: 'Pago', data: '2026-09-12' }), compra({ total: 30, venc: '2030-01-01' }), compra({ total: 5 }),
    ], HOJE);
    const por = Object.fromEntries(f.map((x) => [x.mes, x]));
    expect(por['2026-11'].aPagar).toBe(150);
    expect(por['2026-09'].pago).toBe(70);
    expect(f.reduce((s, x) => s + x.aPagar, 0)).toBe(150); // fora da janela ou sem vencimento não entra
  });
});

describe('ordem das contas abertas', () => {
  it('vencimento mais antigo primeiro e sem vencimento no fim', () => {
    const l = contasAbertas([compra({ venc: '2026-12-01', desc: 'c' }), compra({ desc: 'sem' }), compra({ venc: '2026-10-01', desc: 'a' }), compra({ status: 'Pago', desc: 'paga' })]);
    expect(l.map((c) => c.desc)).toEqual(['a', 'c', 'sem']);
  });
});
