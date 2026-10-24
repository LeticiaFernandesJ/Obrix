import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deLinhas, enviarMudancas, paraLinhas, snapVazio } from './nuvem';
import { calcular, exemplo, makeCal, pctRealAtual } from './schedule';
import type { DB } from './ac21';

const E = exemplo();
const db = (): DB => ({
  nextId: 20, historico: [{ id: 15, ts: '2026-01-02T10:00:00.000Z', tipo: 'obra_criada', icone: 'x', texto: 'ok', user: 'Gerente' }],
  obras: [{ id: 2, nome: 'Obra A', codigo: 'A-1', local: 'POA', responsavel: 'Ana', inicio: '2026-01-10', fim: '', ac21: 500000, status: 'Em Andamento', obs: '',
    itens: [{ id: 3, desc: 'Alv', cat: 'Construtora', tipo: 'orcado', orcado: 1000.5, pago: 400, forn: 'F', nf: '', data: '', obs: '' }] }],
  compras: [{ id: 7, obraId: 2, desc: 'Blocos', cat: 'Insumos', forn: 'C', cnpj: '', nf: '', data: '2026-05-02', qtde: 500, unid: 'un', unit: 3, total: 1500, status: 'Pago', obs: '', venc: '' }],
});

/** Cliente Supabase falso que só registra as chamadas. */
function falso() {
  const log: string[] = [];
  const cliente = {
    from: (t: string) => ({
      upsert: async (rows: unknown[]) => { log.push(`upsert ${t} ${rows.length}`); return { error: null }; },
      delete: () => {
        const q = {
          eq: () => q,
          in: async (c: string, v: unknown[]) => { log.push(`delete ${t} ${c}=${v.join(',')}`); return { error: null }; },
        };
        return q;
      },
    }),
  } as unknown as SupabaseClient;
  return { cliente, log };
}

describe('mapeamento app ↔ tabelas', () => {
  it('ida e volta sem perder nada', () => {
    const L = paraLinhas(db(), { '2': E, legacy: E });
    expect(L.cronogramas).toHaveLength(1); // "legacy" não vai para o banco
    expect(L.tarefas).toHaveLength(20);
    const volta = deLinhas(JSON.parse(JSON.stringify(L)));
    expect(volta.db.obras[0]).toEqual(db().obras[0]);
    expect(volta.db.compras[0]).toEqual(db().compras[0]);
    const a = volta.cronos['2'];
    expect(a.tarefas.map((t) => t.pred)).toEqual(E.tarefas.map((t) => t.pred));
    expect(a.tarefas.map((t) => t.bl)).toEqual(E.tarefas.map((t) => t.bl));
    expect(a.medicoes).toEqual(E.medicoes);
    expect(pctRealAtual(calcular(a, makeCal(a)))).toBeCloseTo(pctRealAtual(calcular(E, makeCal(E))), 6);
  });
});

describe('envio incremental', () => {
  it('só envia o que mudou', async () => {
    const { cliente, log } = falso(); const snap = snapVazio(); const d = db();
    await enviarMudancas(cliente, 'u', paraLinhas(d, { '2': E }), snap);
    expect(log[0]).toBe('upsert obras 1'); // pais antes dos filhos
    expect(log.some((l) => l.startsWith('upsert tarefas 20'))).toBe(true);
    log.length = 0;
    await enviarMudancas(cliente, 'u', paraLinhas(d, { '2': E }), snap);
    expect(log).toEqual([]);
    d.obras[0].itens[0].pago = 999; d.compras = [];
    await enviarMudancas(cliente, 'u', paraLinhas(d, { '2': E }), snap);
    expect(log).toEqual(['delete compras id=7', 'upsert itens 1']);
  });
  it('acesso parcial: só grava as tabelas permitidas e deixa as outras como estavam', async () => {
    const { cliente, log } = falso(); const snap = snapVazio(); const d = db();
    await enviarMudancas(cliente, 'u', paraLinhas(d, { '2': E }), snap);
    log.length = 0;
    d.compras[0].total = 2000; d.obras[0].nome = 'Outro nome'; d.historico = [];
    await enviarMudancas(cliente, 'u', paraLinhas(d, { '2': E }), snap, new Set(['compras'] as const));
    expect(log).toEqual(['upsert compras 1']);
    // o que não foi permitido continua pendente: com permissão total, vai agora
    log.length = 0;
    await enviarMudancas(cliente, 'u', paraLinhas(d, { '2': E }), snap);
    expect(log).toEqual(['upsert obras 1']); // apagar histórico nunca é enviado
  });
  it('histórico só acrescenta: linhas novas vão, alterar ou apagar não', async () => {
    const { cliente, log } = falso(); const snap = snapVazio(); const d = db();
    await enviarMudancas(cliente, 'u', paraLinhas(d, { '2': E }), snap);
    log.length = 0;
    d.historico[0].texto = 'adulterado';
    await enviarMudancas(cliente, 'u', paraLinhas(d, { '2': E }), snap);
    expect(log).toEqual([]);
    d.historico.unshift({ id: 16, ts: '2026-01-03T10:00:00.000Z', tipo: 'compra', icone: 'x', texto: 'nova', user: 'Gerente' });
    d.historico = d.historico.slice(0, 1);
    await enviarMudancas(cliente, 'u', paraLinhas(d, { '2': E }), snap);
    expect(log).toEqual(['upsert historico 1']);
  });
  it('apaga filhos antes do pai', async () => {
    const { cliente, log } = falso(); const snap = snapVazio(); const d = db();
    await enviarMudancas(cliente, 'u', paraLinhas(d, { '2': E }), snap);
    log.length = 0;
    await enviarMudancas(cliente, 'u', paraLinhas({ ...d, obras: [], compras: [] }, {}), snap);
    const ordem = log.map((l) => l.split(' ')[1]);
    expect(ordem.indexOf('tarefas')).toBeLessThan(ordem.indexOf('cronogramas'));
    expect(ordem.indexOf('cronogramas')).toBeLessThan(ordem.indexOf('obras'));
  });
});
