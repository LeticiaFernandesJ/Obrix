import { describe, expect, it } from 'vitest';
import { type DB, type Obra, dbVazio, totalComprometido, totalPago } from './ac21';
import {
  LIMITE_TAREFAS, MAX_BACKUPS, aplicarImportacao, empilharBackup, lerArquivo, mesclarTarefas, montarArquivo, textoResumo, trocarCronoDaObra,
} from './importacao';
import { exportarMSProject, lerMSProject } from './msproject';
import { calcular, makeCal, normalizarEstado, novaTarefa, novoEstado, predParse, type Estado } from './schedule';

const obra = (id: number, nome: string, codigo: string, ac21: number): Obra => ({
  id, nome, codigo, local: '', responsavel: '', inicio: '', fim: '', ac21, status: 'Em Andamento', obs: '',
  itens: [{ id: id * 10, desc: 'Cimento', cat: 'x', tipo: 'orcado', orcado: 1000, pago: 400, forn: '', nf: '', data: '', obs: '' }],
});
const cron = (nome: string, tarefas: [string, number, number?][]): Estado => {
  const S = novoEstado(); S.meta.nome = nome; S.meta.inicio = '2026-03-02';
  S.tarefas = tarefas.map(([n, dur, pct]) => novaTarefa({ nome: n, dur, pct: pct ?? 0 }));
  if (S.tarefas.length > 1) S.tarefas[1].pred = predParse(S.tarefas, '1', 1);
  return S;
};
const nomes = (S: Estado) => S.tarefas.map((t) => t.nome);

function mundo() {
  const bento = obra(1, 'Bento Gonçalves', 'BG-1', 100000), ponte = obra(2, 'Ponte Norte', 'PN-2', 50000);
  const db: DB = { ...dbVazio(), obras: [bento, ponte], compras: [{ id: 5, obraId: 1, desc: 'Areia', cat: 'x', forn: '', cnpj: '', nf: '', data: '', qtde: 1, unid: '', unit: 300, total: 300, status: 'Pago', obs: '', venc: '' }] };
  const cronos: Record<string, Estado> = {
    '1': cron('Bento Gonçalves', [['Fundação', 5, 100], ['Estrutura', 10, 20], ['Acabamento', 8]]),
    '2': cron('Ponte Norte', [['Pilares', 12, 50], ['Vigas', 6]]),
  };
  return { db, cronos };
}

describe('importação isolada por obra', () => {
  it('importar na obra Bento Gonçalves não toca na Ponte Norte nem nos valores financeiros', () => {
    const { db, cronos } = mundo();
    const dbAntes = JSON.stringify(db), ponteAntes = JSON.stringify(cronos['2']);
    const financeiroAntes = [totalPago(db, db.obras[0]), totalComprometido(db, db.obras[0]), totalPago(db, db.obras[1])];
    const vindas = cron('x', [['Fundação', 6, 100], ['Estrutura', 12, 40], ['Cobertura', 4]]).tarefas;
    const r = aplicarImportacao(cronos['1'], vindas, 'atualizar');
    const novos = trocarCronoDaObra(cronos, 1, r.estado, db.obras.map((o) => o.id));

    expect(nomes(novos['1'])).toEqual(['Fundação', 'Estrutura', 'Cobertura', 'Acabamento']);
    expect(novos['2']).toBe(cronos['2']); // mesma referência: nem foi copiada
    expect(JSON.stringify(novos['2'])).toBe(ponteAntes);
    expect(JSON.stringify(db)).toBe(dbAntes);
    expect([totalPago(db, db.obras[0]), totalComprometido(db, db.obras[0]), totalPago(db, db.obras[1])]).toEqual(financeiroAntes);
  });

  it('atualizar não duplica: reimportar o mesmo arquivo deixa tudo igual', () => {
    const { cronos } = mundo();
    const vindas = cron('x', [['Fundação', 6, 100], ['Estrutura', 12, 40], ['Cobertura', 4]]).tarefas;
    const a = aplicarImportacao(cronos['1'], vindas, 'atualizar');
    const b = aplicarImportacao(a.estado, vindas, 'atualizar');
    expect(nomes(b.estado)).toEqual(nomes(a.estado));
    expect(b.estado.tarefas.length).toBe(4);
    expect(b.resumo).toMatchObject({ atualizadas: 3, novas: 0, mantidas: 1 });
    expect(a.resumo).toMatchObject({ atualizadas: 2, novas: 1, mantidas: 1 });
  });

  it('atualizar preserva id, linha de base, responsável da equipe e não zera o avanço', () => {
    const { cronos } = mundo();
    const S = cronos['1']; S.tarefas[1].bl = { i: 10, f: 20 }; S.tarefas[1].respId = 'user-1'; S.tarefas[1].resp = 'Ana';
    const idEstrutura = S.tarefas[1].id;
    const vindas = [novaTarefa({ nome: 'Estrutura', dur: 15, pct: 0 })];
    const t = aplicarImportacao(S, vindas, 'atualizar').estado.tarefas.find((x) => x.nome === 'Estrutura')!;
    expect(t.id).toBe(idEstrutura); expect(t.dur).toBe(15);
    expect(t.bl).toEqual({ i: 10, f: 20 }); expect(t.respId).toBe('user-1'); expect(t.resp).toBe('Ana');
    expect(t.pct).toBe(20);
  });

  it('mesmo nome repetido: casa na ordem, sem juntar tudo numa tarefa', () => {
    const atual = cron('a', [['Pintura', 2], ['Pintura', 3], ['Limpeza', 1]]).tarefas;
    const vindas = [novaTarefa({ nome: 'Pintura', dur: 5 }), novaTarefa({ nome: 'Pintura', dur: 6 })];
    const r = mesclarTarefas(atual, vindas, false);
    expect(r.tarefas.map((t) => [t.nome, t.dur])).toEqual([['Pintura', 5], ['Pintura', 6], ['Limpeza', 1]]);
    expect(new Set(r.tarefas.map((t) => t.id)).size).toBe(3);
  });

  it('predecessoras do arquivo são religadas aos ids da obra', () => {
    const { cronos } = mundo();
    const vindas = [novaTarefa({ nome: 'Fundação', dur: 5 }), novaTarefa({ nome: 'Estrutura', dur: 10 }), novaTarefa({ nome: 'Cobertura', dur: 4 })];
    vindas[2].pred = [{ id: vindas[1].id, tipo: 'TI', lag: 0 }];
    const r = aplicarImportacao(cronos['1'], vindas, 'atualizar').estado;
    const cob = r.tarefas.find((t) => t.nome === 'Cobertura')!, est = r.tarefas.find((t) => t.nome === 'Estrutura')!;
    expect(cob.pred).toEqual([{ id: est.id, tipo: 'TI', lag: 0 }]);
    const ids = new Set(r.tarefas.map((t) => t.id));
    r.tarefas.forEach((t) => t.pred.forEach((p) => expect(ids.has(p.id)).toBe(true)));
  });

  it('acrescentar e substituir', () => {
    const { cronos } = mundo();
    const vindas = cron('x', [['Novo A', 2], ['Novo B', 3]]).tarefas;
    const ac = aplicarImportacao(cronos['1'], vindas, 'acrescentar').estado;
    expect(nomes(ac)).toEqual(['Fundação', 'Estrutura', 'Acabamento', 'Novo A', 'Novo B']);
    expect(aplicarImportacao(cronos['1'], vindas, 'acrescentar').estado.tarefas.length).toBe(5);
    const sub = aplicarImportacao(cronos['1'], vindas, 'substituir', { extra: { inicio: '2026-05-04' } });
    expect(nomes(sub.estado)).toEqual(['Novo A', 'Novo B']);
    expect(sub.estado.meta.inicio).toBe('2026-05-04');
    expect(sub.resumo.removidas).toBe(3);
  });

  it('o cronograma original não é alterado pelo cálculo (a troca só acontece ao aplicar)', () => {
    const { cronos } = mundo();
    const antes = JSON.stringify(cronos['1']);
    aplicarImportacao(cronos['1'], cron('x', [['Fundação', 99]]).tarefas, 'atualizar');
    aplicarImportacao(cronos['1'], cron('x', [['Z', 1]]).tarefas, 'substituir');
    expect(JSON.stringify(cronos['1'])).toBe(antes);
  });
});

describe('validação: nada é aplicado se o arquivo não servir', () => {
  it('arquivo sem tarefas, grande demais ou obra que não existe', () => {
    const { db, cronos } = mundo();
    expect(() => aplicarImportacao(cronos['1'], [], 'atualizar')).toThrow(/nenhuma tarefa/);
    const demais = Array.from({ length: LIMITE_TAREFAS + 1 }, (_, i) => novaTarefa({ nome: 'T' + i }));
    expect(() => aplicarImportacao(cronos['1'], demais, 'substituir')).toThrow(/limite/);
    expect(() => trocarCronoDaObra(cronos, 99, novoEstado(), db.obras.map((o) => o.id))).toThrow(/não existe/);
  });
  it('arquivo que não é cronograma', () => {
    expect(() => lerArquivo('texto')).toThrow(); expect(() => lerArquivo({ foo: 1 })).toThrow(); expect(() => lerArquivo(null)).toThrow();
  });
});

describe('exportação por obra e reimportação', () => {
  it('o arquivo traz só a obra selecionada, com a identificação dela, e volta igual', () => {
    const { cronos } = mundo();
    const arq = montarArquivo({ id: 1, nome: 'Bento Gonçalves', codigo: 'BG-1' }, cronos['1']);
    const texto = JSON.stringify(arq);
    expect(texto).not.toContain('Ponte Norte'); expect(texto).not.toContain('Pilares');
    const { estado, obra } = lerArquivo(JSON.parse(texto));
    expect(obra).toEqual({ id: 1, nome: 'Bento Gonçalves', codigo: 'BG-1' });
    expect(nomes(estado)).toEqual(nomes(cronos['1']));
    // reimportar o próprio arquivo na mesma obra: nada muda e nada duplica
    const r = aplicarImportacao(cronos['1'], estado.tarefas, 'atualizar', { mesmaObra: true });
    expect(r.estado.tarefas.map((t) => t.id)).toEqual(cronos['1'].tarefas.map((t) => t.id));
    expect(r.resumo).toMatchObject({ atualizadas: 3, novas: 0, mantidas: 0 });
  });
  it('arquivo antigo (só o cronograma) continua abrindo', () => {
    const { cronos } = mundo();
    const { estado, obra } = lerArquivo(JSON.parse(JSON.stringify(cronos['2'])));
    expect(obra).toBeNull(); expect(nomes(estado)).toEqual(['Pilares', 'Vigas']);
  });
  it('sem obra selecionada o arquivo é só o cronograma', () => {
    const S = novoEstado(); expect(montarArquivo(null, S)).toBe(S);
  });
});

describe('MS Project por obra', () => {
  it('exporta uma obra, importa em outra e na mesma sem duplicar', () => {
    const { cronos } = mundo();
    const xmlBento = exportarMSProject(cronos['1'], calcular(cronos['1'], makeCal(cronos['1'])));
    expect(xmlBento).not.toContain('Pilares');
    const p = lerMSProject(xmlBento);
    // outra obra (Ponte): atualizar só acrescenta o que não existe lá
    const naPonte = aplicarImportacao(cronos['2'], p.tarefas, 'atualizar').estado;
    expect(naPonte.tarefas.length).toBe(2 + 3);
    // a mesma obra, duas vezes: não cresce
    const um = aplicarImportacao(cronos['1'], p.tarefas, 'atualizar').estado;
    const dois = aplicarImportacao(um, lerMSProject(xmlBento).tarefas, 'atualizar').estado;
    expect(um.tarefas.length).toBe(3); expect(dois.tarefas.length).toBe(3);
    expect(nomes(dois)).toEqual(['Fundação', 'Estrutura', 'Acabamento']);
    expect(dois.tarefas.map((t) => t.id)).toEqual(cronos['1'].tarefas.map((t) => t.id));
  });
});

describe('cópia de segurança', () => {
  it('guarda as mais novas primeiro, no máximo MAX_BACKUPS, e ignora cronograma vazio', () => {
    const e = cron('a', [['A', 1]]);
    let l = empilharBackup([], { ts: '0', motivo: 'm', estado: novoEstado() });
    expect(l).toEqual([]);
    for (let i = 1; i <= MAX_BACKUPS + 2; i++) l = empilharBackup(l, { ts: String(i), motivo: 'm', estado: e });
    expect(l.length).toBe(MAX_BACKUPS); expect(l[0].ts).toBe(String(MAX_BACKUPS + 2));
  });
  it('a cópia restaura exatamente o que havia antes da importação', () => {
    const { cronos } = mundo();
    const antes = normalizarEstado(JSON.parse(JSON.stringify(cronos['1'])));
    const bkp = empilharBackup([], { ts: 't', motivo: 'm', estado: cronos['1'] })[0];
    const depois = aplicarImportacao(cronos['1'], cron('x', [['Outro', 3]]).tarefas, 'substituir').estado;
    expect(nomes(depois)).toEqual(['Outro']);
    expect(JSON.stringify(normalizarEstado(bkp.estado))).toBe(JSON.stringify(antes));
  });
  it('resumo em texto', () => { expect(textoResumo({ atualizadas: 1, novas: 2, mantidas: 0, removidas: 3 })).toBe('1 atualizada, 2 novas, 3 removidas'); });
});
