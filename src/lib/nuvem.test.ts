import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ConflitoErro, deLinhas, enviarMudancas, paraLinhas, snapVazio, versoesDe } from './nuvem';
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

/** Cliente falso que conhece a versão (updated_at) de cada linha na nuvem. */
function falsoVersionado(nuvem: Record<string, string>) {
  const log: string[] = []; let n = 0;
  const cliente = {
    from: (t: string) => ({
      upsert: (rows: Record<string, unknown>[]) => {
        log.push(`upsert ${t} ${rows.length}`);
        const devolve = () => rows.map((r) => ({ id: r.id, obra_id: r.obra_id, updated_at: 'novo' + ++n }));
        const p = Promise.resolve({ error: null, data: null });
        return Object.assign(p, { select: async () => ({ error: null, data: devolve() }) });
      },
      select: () => {
        const q = { eq: () => q, in: async (_c: string, ids: unknown[]) => ({ error: null, data: ids.filter((i) => nuvem[`${t}|${i}`] !== undefined).map((i) => ({ id: i, updated_at: nuvem[`${t}|${i}`] })) }) };
        return q;
      },
      delete: () => { const q = { eq: () => q, in: async () => ({ error: null }) }; return q; },
    }),
  } as unknown as SupabaseClient;
  return { cliente, log };
}

describe('edição simultânea', () => {
  const montar = async (nuvem: Record<string, string>) => {
    const { cliente, log } = falsoVersionado(nuvem); const snap = snapVazio(); const d = db();
    await enviarMudancas(cliente, 'u', paraLinhas(d, {}), snap); // estado já sincronizado
    log.length = 0;
    const versoes = new Map([['compras|7', 'v1'], ['obras|2', 'v1']]);
    return { cliente, log, snap, d, versoes };
  };

  it('ninguém mexeu: grava e passa a conhecer a nova versão', async () => {
    const { cliente, log, snap, d, versoes } = await montar({ 'compras|7': 'v1', 'obras|2': 'v1' });
    d.compras[0].total = 1800;
    await enviarMudancas(cliente, 'u', paraLinhas(d, {}), snap, undefined, { versoes });
    expect(log).toEqual(['upsert compras 1']);
    expect(versoes.get('compras|7')).toMatch(/^novo/);
  });

  it('outra pessoa mudou a mesma linha: avisa e não grava nada', async () => {
    const { cliente, log, snap, d, versoes } = await montar({ 'compras|7': 'v2', 'obras|2': 'v1' });
    d.compras[0].total = 1800; d.obras[0].nome = 'Outro nome';
    const erro = await enviarMudancas(cliente, 'u', paraLinhas(d, {}), snap, undefined, { versoes }).catch((e) => e);
    expect(erro).toBeInstanceOf(ConflitoErro);
    expect((erro as ConflitoErro).linhas).toEqual(['compras|7']); // só a que mudou lá; a obra não conflita
    expect(log.filter((l) => l.startsWith('upsert'))).toEqual([]);
  });

  it('a pessoa escolhe manter a sua versão: grava mesmo assim', async () => {
    const { cliente, log, snap, d, versoes } = await montar({ 'compras|7': 'v2', 'obras|2': 'v1' });
    d.compras[0].total = 1800;
    await enviarMudancas(cliente, 'u', paraLinhas(d, {}), snap, undefined, { versoes, forcar: true });
    expect(log).toEqual(['upsert compras 1']);
  });

  it('linha apagada por outra pessoa também conta como conflito', async () => {
    const { cliente, snap, d, versoes } = await montar({ 'obras|2': 'v1' }); // a compra 7 sumiu da nuvem
    d.compras[0].total = 1800;
    await expect(enviarMudancas(cliente, 'u', paraLinhas(d, {}), snap, undefined, { versoes })).rejects.toBeInstanceOf(ConflitoErro);
  });

  it('linhas novas e linhas que só eu mexi nunca geram conflito', async () => {
    const { cliente, log, snap, d, versoes } = await montar({ 'compras|7': 'v1', 'obras|2': 'v1' });
    d.compras.push({ ...d.compras[0], id: 99, desc: 'nova' });
    await enviarMudancas(cliente, 'u', paraLinhas(d, {}), snap, undefined, { versoes });
    expect(log).toEqual(['upsert compras 1']);
  });

  it('as versões vêm das linhas cruas da nuvem (só tabelas com updated_at)', () => {
    const v = versoesDe({ obras: [{ id: 2, updated_at: '2026-01-01T00:00:00+00:00' }], itens: [], compras: [{ id: 7 }], historico: [{ id: 1, updated_at: 'x' }], cronogramas: [], tarefas: [], medicoes: [] });
    expect([...v.entries()]).toEqual([['obras|2', '2026-01-01T00:00:00+00:00']]);
  });
});

describe('responsável da equipe no banco', () => {
  it('vai e volta pelas linhas das tarefas', () => {
    const S = { ...E, tarefas: E.tarefas.map((t, i) => (i === 0 ? { ...t, resp: 'Ana', respId: 'user-1' } : t)) };
    const L = paraLinhas(db(), { '2': S });
    expect(L.tarefas[0].responsavel_id).toBe('user-1'); expect(L.tarefas[1].responsavel_id).toBeNull();
    const volta = deLinhas(JSON.parse(JSON.stringify(L))).cronos['2'];
    expect(volta.tarefas[0].respId).toBe('user-1'); expect(volta.tarefas[0].resp).toBe('Ana'); expect(volta.tarefas[1].respId).toBeNull();
  });

  it('banco ainda sem a coluna responsavel_id: grava as tarefas sem ela, em vez de travar a sincronização', async () => {
    const chamadas: { t: string; temColuna: boolean }[] = [];
    const cliente = {
      from: (t: string) => ({
        upsert: async (rows: Record<string, unknown>[]) => {
          const temColuna = rows.some((r) => 'responsavel_id' in r);
          chamadas.push({ t, temColuna });
          return t === 'tarefas' && temColuna ? { error: { message: 'column "responsavel_id" of relation "tarefas" does not exist' } } : { error: null };
        },
      }),
    } as unknown as SupabaseClient;
    await enviarMudancas(cliente, 'u', paraLinhas(db(), { '2': E }), snapVazio());
    const tarefas = chamadas.filter((c) => c.t === 'tarefas');
    expect(tarefas).toEqual([{ t: 'tarefas', temColuna: true }, { t: 'tarefas', temColuna: false }]);
  });
});

describe('pagamento parcial na nuvem', () => {
  it('quitado e valor pago vão e voltam pelas linhas', () => {
    const d = db(); d.obras[0].itens[0].quitado = true; d.compras[0].status = 'Parcial'; d.compras[0].valorPago = 700;
    const L = paraLinhas(d, {});
    expect(L.itens[0].quitado).toBe(true); expect(L.compras[0].valor_pago).toBe(700);
    const volta = deLinhas(JSON.parse(JSON.stringify(L)));
    expect(volta.db.obras[0].itens[0].quitado).toBe(true); expect(volta.db.compras[0].valorPago).toBe(700);
    expect(paraLinhas(db(), {}).itens[0].quitado).toBe(false); expect(paraLinhas(db(), {}).compras[0].valor_pago).toBe(0);
  });
  it('banco ainda sem as colunas novas: grava o resto em vez de travar a sincronização', async () => {
    const chamadas: { t: string; col: boolean }[] = [];
    const cliente = {
      from: (t: string) => ({
        upsert: async (rows: Record<string, unknown>[]) => {
          const col = rows.some((r) => 'quitado' in r || 'valor_pago' in r); chamadas.push({ t, col });
          return col ? { error: { message: `column "${t === 'itens' ? 'quitado' : 'valor_pago'}" of relation "${t}" does not exist` } } : { error: null };
        },
      }),
    } as unknown as SupabaseClient;
    await enviarMudancas(cliente, 'u', paraLinhas(db(), {}), snapVazio());
    expect(chamadas.filter((c) => c.t === 'itens')).toEqual([{ t: 'itens', col: true }, { t: 'itens', col: false }]);
    expect(chamadas.filter((c) => c.t === 'compras')).toEqual([{ t: 'compras', col: true }, { t: 'compras', col: false }]);
  });
});

describe('cronograma por obra na nuvem', () => {
  it('mudar o cronograma de uma obra só envia as linhas dela; a outra não é tocada', async () => {
    const { cliente, log } = falso(); const snap = snapVazio();
    const d = db(); d.obras.push({ ...d.obras[0], id: 3, nome: 'Obra B', codigo: 'B-1', itens: [] });
    const A = exemplo(), B = exemplo();
    await enviarMudancas(cliente, 'u', paraLinhas(d, { '2': A, '3': B }), snap);
    // as duas obras usam os mesmos ids de tarefa, e mesmo assim são linhas diferentes (a chave inclui a obra)
    const nA = A.tarefas.length;
    log.length = 0;
    const A2 = JSON.parse(JSON.stringify(A)); A2.tarefas[0].nome = 'Mudou só na A'; A2.tarefas.pop();
    await enviarMudancas(cliente, 'u', paraLinhas(d, { '2': A2, '3': B }), snap);
    expect(log).toEqual(['delete tarefas id=' + A.tarefas[nA - 1].id, 'upsert tarefas 1']);
    const L = paraLinhas(d, { '2': A2, '3': B });
    expect(L.tarefas.filter((t) => Number(t.obra_id) === 3)).toHaveLength(B.tarefas.length);
    expect(deLinhas(L).cronos['3'].tarefas.map((t) => t.nome)).toEqual(B.tarefas.map((t) => t.nome));
  });
});
