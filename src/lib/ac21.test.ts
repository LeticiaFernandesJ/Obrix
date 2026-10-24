import { describe, expect, it } from 'vitest';
import { type DB, fmt, novoId, pct, pctInt, sanitizarDB, totalComprometido, totalPago } from './ac21';

const db: DB = {
  nextId: 10, historico: [],
  obras: [{ id: 1, nome: 'A', codigo: 'A-1', local: '', responsavel: '', inicio: '', fim: '', ac21: 1000, status: 'Em Andamento', obs: '',
    itens: [
      { id: 2, desc: 'i1', cat: 'x', tipo: 'orcado', orcado: 300, pago: 100, forn: '', nf: '', data: '', obs: '' },
      { id: 3, desc: 'i2', cat: 'x', tipo: 'nao_orcado', orcado: 0, pago: 50, forn: '', nf: '', data: '', obs: '' },
    ] }],
  compras: [
    { id: 4, obraId: 1, desc: 'c1', cat: 'x', forn: '', cnpj: '', nf: '', data: '', qtde: 1, unid: '', unit: 200, total: 200, status: 'Pago', obs: '' },
    { id: 5, obraId: 1, desc: 'c2', cat: 'x', forn: '', cnpj: '', nf: '', data: '', qtde: 1, unid: '', unit: 80, total: 80, status: 'Pendente', obs: '' },
  ],
};

describe('contas do AC21', () => {
  it('comprometido = orçado dos itens + todas as compras', () => {
    expect(totalComprometido(db, db.obras[0])).toBe(300 + 200 + 80);
  });
  it('pago = itens pagos + compras com status Pago', () => {
    expect(totalPago(db, db.obras[0])).toBe(100 + 50 + 200);
  });
  it('percentuais e moeda', () => {
    expect(pct(1, 3)).toBe(33.3); expect(pctInt(1, 3)).toBe(33); expect(pct(5, 0)).toBe(0);
    expect(fmt(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
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
