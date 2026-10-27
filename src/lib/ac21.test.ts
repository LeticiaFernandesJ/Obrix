import { describe, expect, it } from 'vitest';
import {
  type DB, acimaDoOrcado, estourou, fmt, mascaraMoeda, novoId, pct, pctInt, pctTxt, porSituacao, sanitizarDB, situacaoVerba, totalComprometido, totalPago, valorDaMascara,
} from './ac21';

const db: DB = {
  nextId: 10, historico: [],
  obras: [{ id: 1, nome: 'A', codigo: 'A-1', local: '', responsavel: '', inicio: '', fim: '', ac21: 1000, status: 'Em Andamento', obs: '',
    itens: [
      { id: 2, desc: 'i1', cat: 'x', tipo: 'orcado', orcado: 300, pago: 100, forn: '', nf: '', data: '', obs: '' },
      { id: 3, desc: 'i2', cat: 'x', tipo: 'nao_orcado', orcado: 0, pago: 50, forn: '', nf: '', data: '', obs: '' },
    ] }],
  compras: [
    { id: 4, obraId: 1, desc: 'c1', cat: 'x', forn: '', cnpj: '', nf: '', data: '', qtde: 1, unid: '', unit: 200, total: 200, status: 'Pago', obs: '', venc: '' },
    { id: 5, obraId: 1, desc: 'c2', cat: 'x', forn: '', cnpj: '', nf: '', data: '', qtde: 1, unid: '', unit: 80, total: 80, status: 'Pendente', obs: '', venc: '' },
  ],
};

describe('contas do AC21', () => {
  it('comprometido = itens (valor pago se já pago, senão o orçado) + todas as compras', () => {
    // i1 pago 100 (orçado era 300) + i2 não orçado pago 50 + compras 200 e 80
    expect(totalComprometido(db, db.obras[0])).toBe(100 + 50 + 200 + 80);
  });
  it('item pago por mais ou por menos: vale o valor realmente pago; sem pagamento, o orçado', () => {
    const o = (orcado: number, pago: number) => ({ ...db.obras[0], itens: [{ ...db.obras[0].itens[0], orcado, pago }] });
    const vazio = { ...db, compras: [] };
    expect(totalComprometido(vazio, o(500, 0))).toBe(500);
    expect(totalComprometido(vazio, o(500, 1000))).toBe(1000);
    expect(totalComprometido(vazio, o(500, 400))).toBe(400);
    expect(acimaDoOrcado(o(500, 1000))).toEqual({ valor: 500, qtd: 1 });
    expect(acimaDoOrcado(o(500, 400)).qtd).toBe(0);
  });
  it('pago = itens pagos + compras com status Pago', () => {
    expect(totalPago(db, db.obras[0])).toBe(100 + 50 + 200);
  });
  it('percentuais e moeda', () => {
    expect(pct(1, 3)).toBe(33.3); expect(pctInt(1, 3)).toBe(33); expect(pct(5, 0)).toBe(0);
    expect(fmt(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
  });
});

describe('verba e alerta de estouro', () => {
  it('99,74% do AC21 não é 100% nem estourou (caso reportado)', () => {
    expect(pctInt(2915790.59, 2923305)).toBe(99);
    expect(pct(2915790.59, 2923305)).toBe(99.7);
    expect(estourou(2915790.59, 2923305)).toBe(false);
    expect(situacaoVerba(2915790.59, 2923305)).toBe('limite');
  });
  it('arredondamento nunca vira 100% antes da hora', () => {
    expect(pctInt(999.9, 1000)).toBe(99); expect(pct(999.99, 1000)).toBe(99.9);
    expect(pctInt(1000, 1000)).toBe(100); expect(pctInt(1100, 1000)).toBe(110);
  });
  it('situação: ok, limite, esgotada (igual) e estourada (passou)', () => {
    expect(situacaoVerba(500, 1000)).toBe('ok'); expect(situacaoVerba(900, 1000)).toBe('limite');
    expect(situacaoVerba(1000, 1000)).toBe('esgotada'); expect(situacaoVerba(1000.004, 1000)).toBe('esgotada');
    expect(situacaoVerba(1000.01, 1000)).toBe('estourada'); expect(situacaoVerba(5, 0)).toBe('ok');
  });
  it('percentual em texto brasileiro', () => { expect(pctTxt(99.7)).toBe('99,7'); expect(pctTxt(100)).toBe('100'); });
  it('obras ativas e finalizadas', () => {
    const o = (status: string) => ({ status }) as never;
    const lista = [o('Em Andamento'), o('Concluída'), o('Suspensa'), o('Planejamento')];
    expect(porSituacao(lista, 'ativas')).toHaveLength(3);
    expect(porSituacao(lista, 'finalizadas')).toHaveLength(1);
    expect(porSituacao(lista, 'todas')).toHaveLength(4);
  });
});

describe('sanitizarDB', () => {
  it('recusa arquivo sem obras', () => {
    expect(sanitizarDB({ foo: 1 })).toBeNull();
    expect(sanitizarDB(null)).toBeNull();
  });
  it('completa campos que faltam e remove compras órfãs', () => {
    const r = sanitizarDB({ obras: [{ id: 1, nome: 'X', ac21: '10' }], compras: [{ id: 2, obraId: 99, total: 5 }, { id: 3, obraId: 1, total: 7 }] })!;
    expect(r.obras[0].itens).toEqual([]);
    expect(r.obras[0].ac21).toBe(10);
    expect(r.compras.map((c) => c.id)).toEqual([3]);
    expect(r.compras[0].status).toBe('Pendente');
  });
  it('resolve ids repetidos', () => {
    const r = sanitizarDB({ obras: [{ id: 1, nome: 'A', itens: [{ id: 1 }, { id: 1 }] }] })!;
    const ids = [r.obras[0].id, ...r.obras[0].itens.map((i) => i.id)];
    expect(new Set(ids).size).toBe(3);
  });
});

describe('novoId', () => {
  it('nunca repete e sempre cresce', () => {
    const ids = Array.from({ length: 5000 }, () => novoId());
    expect(new Set(ids).size).toBe(5000);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
    expect(Number.isSafeInteger(ids[ids.length - 1])).toBe(true);
  });
});

describe('máscara de dinheiro', () => {
  it('mostra no formato brasileiro', () => {
    expect(mascaraMoeda('1234.5')).toBe('1.234,50');
    expect(mascaraMoeda('500000')).toBe('500.000,00');
    expect(mascaraMoeda('0.05')).toBe('0,05');
    expect(mascaraMoeda('')).toBe('');
    expect(mascaraMoeda('abc')).toBe('');
  });
  it('converte o que foi digitado (os dois últimos números são os centavos)', () => {
    expect(valorDaMascara('1')).toBe('0.01');
    expect(valorDaMascara('123456')).toBe('1234.56');
    expect(valorDaMascara('1.234,56')).toBe('1234.56');
    expect(valorDaMascara('R$ 44558554455')).toBe('445585544.55');
    expect(valorDaMascara('')).toBe('');
    expect(valorDaMascara('abc')).toBe('');
  });
  it('apagar um dígito volta ao valor anterior', () => {
    expect(valorDaMascara('1.234,5')).toBe('123.45'); // apagou o último "6" de 1.234,56
  });
  it('limita o tamanho para não perder precisão', () => {
    expect(Number.isSafeInteger(Math.round(Number(valorDaMascara('9'.repeat(30))) * 100))).toBe(true);
  });
});
