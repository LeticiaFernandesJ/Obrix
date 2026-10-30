import { describe, expect, it } from 'vitest';
import { celulaCsv, normalizarEstado, type Estado } from './schedule';
import { LIMITE_ARQUIVO_MB, arquivoGrandeDemais, lerArquivo } from './importacao';
import { sanitizarDB } from './ac21';

const cru = (o: unknown) => o as Partial<Estado>;

describe('cronograma vindo de arquivo ou link malformado', () => {
  it('textos que não são texto viram texto e nada quebra a tela', () => {
    const e = normalizarEstado(cru({
      meta: { nome: { a: 1 }, obs: 'x'.repeat(10000), inicio: 'ontem', statusDate: '2026-02-30x', contrato: 5, empresa: null, resp: ['a'], pmo: '' },
      tarefas: [{ id: { x: 1 }, nome: ['a', 'b'], resp: { y: 2 }, dur: '3', pred: [{ id: 'z'.repeat(500), tipo: 'XX', lag: 'abc' }] }],
    }));
    expect(typeof e.meta.nome).toBe('string'); expect(e.meta.nome).toBe(''); expect(e.meta.obs.length).toBe(2000);
    expect(e.meta.contrato).toBe('5'); expect(e.meta.empresa).toBe(''); expect(e.meta.resp).toBe('');
    expect(e.meta.inicio).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(e.meta.statusDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const t = e.tarefas[0];
    expect(typeof t.id).toBe('string'); expect(t.id.length).toBeGreaterThan(0); expect(typeof t.nome).toBe('string'); expect(typeof t.resp).toBe('string');
    expect(t.pred[0].id.length).toBe(64); expect(t.pred[0].tipo).toBe('TI'); expect(t.pred[0].lag).toBe(0);
  });
  it('chaves estranhas no cronograma não passam (nem __proto__)', () => {
    const e = normalizarEstado(JSON.parse('{"meta":{"nome":"A","__proto__":{"admin":true},"extra":"lixo"},"tarefas":[],"__proto__":{"x":1}}'));
    expect(Object.keys(e.meta).sort()).toEqual(['contrato', 'empresa', 'inicio', 'nome', 'obs', 'pmo', 'resp', 'statusDate']);
    expect(({} as Record<string, unknown>).admin).toBeUndefined(); expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
  it('listas enormes são cortadas', () => {
    const e = normalizarEstado(cru({
      tarefas: Array.from({ length: 6000 }, (_, i) => ({ id: 't' + i, nome: 'T' + i })),
      cal: { sab: true, dom: false, fer: Array.from({ length: 3000 }, () => '2026-01-01').concat(['não é data']) },
      medicoes: Array.from({ length: 9000 }, () => ({ d: '2026-01-01', p: 150 })),
    }));
    expect(e.tarefas.length).toBe(5000); expect(e.cal.fer.length).toBe(1000); expect(e.medicoes.length).toBe(5000); expect(e.medicoes[0].p).toBe(100);
  });
  it('o arquivo .json do Obrix recusa o que não é cronograma', () => {
    expect(() => lerArquivo({ tarefas: 'x' })).toThrow(); expect(() => lerArquivo([])).toThrow();
  });
});

describe('CSV exportado não vira fórmula no Excel', () => {
  it('texto que começa com = + - @ ganha apóstrofo e aspas são duplicadas', () => {
    expect(celulaCsv('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(celulaCsv('+1+1')).toBe(`"'+1+1"`); expect(celulaCsv('-2')).toBe(`"'-2"`); expect(celulaCsv('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
    expect(celulaCsv('Concretagem da laje')).toBe('"Concretagem da laje"'); expect(celulaCsv('Seu "Zé"')).toBe('"Seu ""Zé"""');
    expect(celulaCsv(null)).toBe('""'); expect(celulaCsv(undefined)).toBe('""');
  });
});

describe('tamanho dos arquivos importados', () => {
  it(`recusa mais de ${LIMITE_ARQUIVO_MB} MB`, () => {
    expect(arquivoGrandeDemais({ size: 1024 })).toBe(false);
    expect(arquivoGrandeDemais({ size: LIMITE_ARQUIVO_MB * 1024 * 1024 })).toBe(false);
    expect(arquivoGrandeDemais({ size: LIMITE_ARQUIVO_MB * 1024 * 1024 + 1 })).toBe(true);
  });
});

describe('backup com dados estranhos', () => {
  it('sanitizarDB converte tudo para o tipo certo e descarta compras de obra que não existe', () => {
    const db = sanitizarDB({
      obras: [{ id: 1, nome: { x: 1 }, ac21: 'abc', status: 'Hacker', itens: [{ id: 2, desc: 5, orcado: '1e999', pago: -3, tipo: 'qualquer' }] }],
      compras: [{ id: 3, obraId: 1, total: 'x', status: 'Pago' }, { id: 4, obraId: 99, total: 10 }],
    })!;
    expect(db.obras[0].ac21).toBe(0); expect(db.obras[0].status).toBe('Em Andamento'); expect(typeof db.obras[0].nome).toBe('string');
    expect(db.obras[0].itens[0].tipo).toBe('orcado'); expect(Number.isFinite(db.obras[0].itens[0].orcado)).toBe(true); expect(db.obras[0].itens[0].pago).toBe(0); // negativo vira zero
    expect(db.compras).toHaveLength(1);
  });
});
