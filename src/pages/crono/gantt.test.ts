import { describe, expect, it } from 'vitest';
import { montarGantt } from './gantt';
import { calcular, makeCal, novaTarefa, novoEstado, type Estado } from '../../lib/schedule';
import { hojeN, iso2n, n2iso } from '../../lib/dates';

/** Cronograma que começa 20 dias antes de hoje, com a data de status em hoje. */
function estado(zoom: Estado['zoom'] = 'd'): Estado {
  const S = novoEstado(); S.zoom = zoom;
  const ini = n2iso(hojeN() - 20); S.meta.inicio = ini; S.meta.statusDate = n2iso(hojeN());
  S.tarefas = [
    novaTarefa({ id: 'feita', nome: 'Feita', dur: 3, pct: 100, iniM: iso2n(ini), resp: 'Ana' }),
    novaTarefa({ id: 'atrasada', nome: 'Atrasada', dur: 3, pct: 30, iniM: iso2n(ini) }),
    novaTarefa({ id: 'futura', nome: 'Futura', dur: 3, pct: 0, iniM: hojeN() + 15 }),
    novaTarefa({ id: 'm1', nome: 'Marco <b>1</b>', dur: 0, marco: true, iniM: hojeN() + 5 }),
  ];
  return S;
}
const gerar = (S: Estado) => { const cal = makeCal(S); return montarGantt(S, calcular(S, cal), cal, 0); };

describe('calendário do cronograma', () => {
  it('marca como atrasada a tarefa que já devia ter terminado, e como concluída a que está em 100%', () => {
    const g = gerar(estado());
    expect(g.body).toMatch(/class="bar done" data-i="0"/);
    expect(g.body).toMatch(/class="bar late" data-i="1"/);
    expect(g.body).not.toMatch(/class="bar late" data-i="2"/); // a futura não está atrasada
  });

  it('no zoom por dia, cada dia mostra a inicial do dia da semana e o número, e hoje fica destacado', () => {
    const g = gerar(estado('d'));
    expect(g.head).toMatch(/<small>[DSTQ]<\/small>\d{1,2}/);
    expect(g.head).toContain(' hoje"');
    expect(g.head).toMatch(/class="d we"/); // fins de semana sombreados
    expect(g.head).toMatch(/title="(segunda|terça|quarta|quinta|sexta)-feira, /);
  });

  it('no zoom por semana, o cabeçalho mostra a semana e destaca a atual', () => {
    const g = gerar(estado('s'));
    expect(g.head).toMatch(/class="d sem( hoje)?"/);
    expect(g.head).toContain('Semana de ');
    expect(g.head).toContain('class="d sem hoje"');
  });

  it('o marco aparece com o nome escapado e a data', () => {
    const g = gerar(estado());
    expect(g.body).toContain('class="ms ');
    expect(g.body).toContain('&lt;b&gt;1&lt;/b&gt;'); // nada de HTML injetado pelo nome
    expect(g.body).not.toContain('<b>1</b>');
  });

  it('devolve a posição de hoje e do início das tarefas para os atalhos', () => {
    const g = gerar(estado());
    expect(g.xHoje).not.toBeNull(); expect(g.xInicio).not.toBeNull();
    expect(g.xHoje!).toBeGreaterThan(g.xInicio!);
    expect(g.altura).toBe(4 * 36);
  });

  it('feriado e fim de semana ficam sem expediente no fundo e no cabeçalho', () => {
    const S = estado(); S.cal.fer = [n2iso(hojeN() + 2)];
    const g = gerar(S);
    expect(g.body).toContain('bg-we');
    expect(g.head).toContain('feriado ou parada');
  });
});
