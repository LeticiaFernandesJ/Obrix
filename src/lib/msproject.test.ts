import { describe, expect, it } from 'vitest';
import { exportarMSProject, lerMSProject } from './msproject';
import { calcular, exemplo, makeCal, novaTarefa, novoEstado, predTexto } from './schedule';

const MSP = `\uFEFF<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Name>obra.xml</Name><Title>Galpão &amp; Escritório</Title><StartDate>2026-03-02T08:00:00</StartDate>
  <MinutesPerDay>480</MinutesPerDay>
  <Calendars><Calendar><UID>1</UID><IsBaseCalendar>1</IsBaseCalendar><WeekDays>
    <WeekDay><DayType>1</DayType><DayWorking>0</DayWorking></WeekDay>
    <WeekDay><DayType>2</DayType><DayWorking>1</DayWorking></WeekDay>
    <WeekDay><DayType>7</DayType><DayWorking>1</DayWorking></WeekDay>
  </WeekDays><Exceptions><Exception><TimePeriod><FromDate>2026-04-03T00:00:00</FromDate><ToDate>2026-04-04T23:59:00</ToDate></TimePeriod><DayWorking>0</DayWorking></Exception></Exceptions></Calendar></Calendars>
  <Tasks>
    <Task><UID>0</UID><ID>0</ID><Name>Projeto</Name><OutlineLevel>0</OutlineLevel><Summary>1</Summary></Task>
    <Task><UID>1</UID><ID>1</ID><Name>Fundações</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary><Duration>PT80H0M0S</Duration></Task>
    <Task><UID>2</UID><ID>2</ID><Name>Escavação</Name><OutlineLevel>2</OutlineLevel><Start>2026-03-02T08:00:00</Start><Duration>PT40H0M0S</Duration><PercentComplete>100</PercentComplete></Task>
    <Task><UID>3</UID><ID>3</ID><Name>Sapatas</Name><OutlineLevel>2</OutlineLevel><Start>2026-03-09T08:00:00</Start><Duration>PT24H0M0S</Duration><PercentComplete>40</PercentComplete>
      <PredecessorLink><PredecessorUID>2</PredecessorUID><Type>1</Type><LinkLag>4800</LinkLag></PredecessorLink></Task>
    <Task><UID>4</UID><ID>4</ID><Name>Marco: fundações prontas</Name><OutlineLevel>1</OutlineLevel><Milestone>1</Milestone><Duration>PT0H0M0S</Duration>
      <PredecessorLink><PredecessorUID>3</PredecessorUID><Type>3</Type><LinkLag>0</LinkLag></PredecessorLink></Task>
    <Task><UID>5</UID><ID>5</ID><Name></Name><IsNull>1</IsNull></Task>
  </Tasks>
  <Resources><Resource><UID>1</UID><Name>Equipe A</Name></Resource></Resources>
  <Assignments><Assignment><UID>1</UID><TaskUID>2</TaskUID><ResourceUID>1</ResourceUID></Assignment></Assignments>
</Project>`;

describe('leitura do MS Project (XML)', () => {
  const p = lerMSProject(MSP);

  it('traz o nome, o início e ignora a tarefa-resumo do projeto e as linhas vazias', () => {
    expect(p.nome).toBe('Galpão & Escritório'); expect(p.inicio).toBe('2026-03-02');
    expect(p.tarefas.map((t) => t.nome)).toEqual(['Fundações', 'Escavação', 'Sapatas', 'Marco: fundações prontas']);
  });

  it('níveis, durações em dias, marco e percentual', () => {
    expect(p.tarefas.map((t) => t.nivel)).toEqual([0, 1, 1, 0]);
    expect(p.tarefas[1].dur).toBe(5); expect(p.tarefas[2].dur).toBe(3);
    expect(p.tarefas[3].marco).toBe(true); expect(p.tarefas[3].dur).toBe(0);
    expect(p.tarefas[1].pct).toBe(100); expect(p.tarefas[2].pct).toBe(40);
  });

  it('predecessoras: tipo e atraso (décimos de minuto) viram dias de trabalho', () => {
    expect(p.tarefas[2].pred).toEqual([{ id: p.tarefas[1].id, tipo: 'TI', lag: 1 }]);
    expect(p.tarefas[3].pred).toEqual([{ id: p.tarefas[2].id, tipo: 'II', lag: 0 }]);
  });

  it('data de início só para tarefa sem predecessora (e que não é fase)', () => {
    expect(p.tarefas[1].iniM).not.toBeNull();
    expect(p.tarefas[2].iniM).toBeNull(); expect(p.tarefas[0].iniM).toBeNull();
  });

  it('responsável vem dos recursos atribuídos', () => {
    expect(p.tarefas[1].resp).toBe('Equipe A'); expect(p.tarefas[2].resp).toBe('');
  });

  it('calendário: sábado trabalha, domingo não, e as exceções viram feriados', () => {
    expect(p.cal).toEqual({ sab: true, dom: false, fer: ['2026-04-03', '2026-04-04'] });
  });

  it('o cronograma importado calcula sem erro', () => {
    const S = novoEstado(); S.meta.inicio = p.inicio; S.tarefas = p.tarefas; if (p.cal) S.cal = p.cal;
    const c = calcular(S, makeCal(S));
    expect(c.every((k) => !k.erro)).toBe(true);
    expect(c[1].dur).toBe(5);
  });

  it('rejeita arquivo que não é do Project', () => {
    expect(() => lerMSProject('<html></html>')).toThrow(/não é um XML do MS Project/);
    expect(() => lerMSProject('<Project><Tasks></Tasks></Project>')).toThrow(/nenhuma tarefa/);
  });

  it('duração em dias e horas quebradas (P1DT4H, minutos por dia diferentes)', () => {
    const x = (dur: string, mpd = 480) => lerMSProject(`<Project><MinutesPerDay>${mpd}</MinutesPerDay><Tasks><Task><UID>1</UID><Name>a</Name><OutlineLevel>1</OutlineLevel><Duration>${dur}</Duration></Task></Tasks></Project>`).tarefas[0].dur;
    expect(x('PT16H0M0S')).toBe(2); expect(x('PT4H0M0S')).toBe(0.5); expect(x('PT90H0M0S', 540)).toBe(10);
  });
});

describe('exportação para o MS Project (XML)', () => {
  const S = exemplo(); S.cal.fer = ['2026-04-03'];
  const c = calcular(S, makeCal(S));
  const xml = exportarMSProject(S, c);

  it('gera um XML do Project com as tarefas, o calendário e os feriados', () => {
    expect(xml.startsWith('<?xml')).toBe(true);
    expect(xml).toContain('xmlns="http://schemas.microsoft.com/project"');
    expect((xml.match(/<Task>/g) || []).length).toBe(S.tarefas.length);
    expect(xml).toContain('<DayWorking>0</DayWorking></Exception>'.replace('</Exception>', ''));
    expect(xml).toContain('2026-04-03T00:00:00');
  });

  it('escapa caracteres especiais nos nomes', () => {
    const E = novoEstado(); E.meta.nome = 'A & B <1>'; E.tarefas = [novaTarefa({ nome: 'Pintura "externa" & <reboco>', dur: 2 })];
    const out = exportarMSProject(E, calcular(E, makeCal(E)));
    expect(out).toContain('Pintura &quot;externa&quot; &amp; &lt;reboco&gt;');
    expect(lerMSProject(out).tarefas[0].nome).toBe('Pintura "externa" & <reboco>');
  });

  it('ida e volta: nomes, níveis, durações, predecessoras, marcos e percentuais se mantêm', () => {
    const p = lerMSProject(xml);
    expect(p.tarefas.length).toBe(S.tarefas.length);
    expect(p.tarefas.map((t) => t.nome)).toEqual(S.tarefas.map((t) => t.nome));
    expect(p.tarefas.map((t) => t.nivel)).toEqual(S.tarefas.map((t) => t.nivel));
    const folha = (i: number) => !(i + 1 < S.tarefas.length && S.tarefas[i + 1].nivel > S.tarefas[i].nivel);
    S.tarefas.forEach((t, i) => {
      if (!folha(i)) return;
      expect(p.tarefas[i].dur).toBe(t.dur); expect(p.tarefas[i].marco).toBe(t.marco);
      expect(Math.round(p.tarefas[i].pct)).toBe(Math.round(t.pct));
    });
    expect(p.tarefas.map((t) => predTexto(p.tarefas, t))).toEqual(S.tarefas.map((t) => predTexto(S.tarefas, t)));
    expect(p.cal?.fer).toEqual(['2026-04-03']);
  });

  it('ida e volta: as datas calculadas continuam as mesmas', () => {
    const p = lerMSProject(xml);
    const R = novoEstado(); R.meta.inicio = S.meta.inicio; R.meta.statusDate = S.meta.statusDate; R.tarefas = p.tarefas; if (p.cal) R.cal = p.cal;
    const c2 = calcular(R, makeCal(R));
    expect(c2.map((k) => [k.ini, k.fim])).toEqual(c.map((k) => [k.ini, k.fim]));
  });
});
