import { iso2n, n2iso } from './dates';
import { type Calc, type Estado, type Pred, type Tarefa, type TipoPred, novaTarefa } from './schedule';
import { blocos, bloco, escaparXml, limparXml, numero, tag } from './xml';

/* =========================== MS PROJECT (XML / MSPDI) ===========================
   Lê e grava o formato XML do Microsoft Project ("Salvar como XML"). O formato binário .mpp
   e o Primavera (.xer) não são suportados: no Project, use Arquivo > Salvar como > XML. */

export interface ProjetoImportado {
  nome: string;
  /** AAAA-MM-DD, vazio se o arquivo não traz */ inicio: string;
  /** só vem preenchido se o arquivo traz o calendário */ cal: { sab: boolean; dom: boolean; fer: string[] } | null;
  tarefas: Tarefa[];
}

const TIPO_DE_MSP: Record<string, TipoPred> = { '0': 'TT', '1': 'TI', '2': 'IT', '3': 'II' };
const TIPO_PARA_MSP: Record<TipoPred, number> = { TT: 0, TI: 1, IT: 2, II: 3 };
const MIN_DIA = 480;

/** "PT40H0M0S" (ou "P1DT4H") em dias de trabalho. */
function duracaoEmDias(txt: string, minPorDia: number): number {
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(txt.trim());
  if (!m) return 0;
  const min = (+(m[1] ?? 0)) * 24 * 60 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0)) + (+(m[4] ?? 0)) / 60;
  return Math.round((min / (minPorDia || MIN_DIA)) * 100) / 100;
}

export function lerMSProject(xmlBruto: string): ProjetoImportado {
  const xml = limparXml(xmlBruto);
  const proj = /<Project(?:\s[^>]*)?>([\s\S]*)<\/Project>/.exec(xml);
  if (!proj) throw new Error('Este arquivo não é um XML do MS Project (não achei o grupo Project). No Project, use Arquivo > Salvar como > XML.');
  const corpo = proj[1];
  const minPorDia = numero(tag(corpo, 'MinutesPerDay')) || MIN_DIA;

  const brutas = blocos(bloco(corpo, 'Tasks'), 'Task').map((t) => ({
    uid: tag(t, 'UID'), nome: tag(t, 'Name'), nivel: Math.max(1, Math.round(numero(tag(t, 'OutlineLevel')) || 1)) - 1,
    dur: tag(t, 'Duration'), ini: tag(t, 'Start').slice(0, 10), pct: numero(tag(t, 'PercentComplete')),
    marco: tag(t, 'Milestone') === '1', resumo: tag(t, 'Summary') === '1', nulo: tag(t, 'IsNull') === '1',
    links: blocos(t, 'PredecessorLink').map((l) => ({ uid: tag(l, 'PredecessorUID'), tipo: tag(l, 'Type') || '1', lag: numero(tag(l, 'LinkLag')) })),
  })).filter((t) => t.uid !== '0' && !t.nulo && t.nome.trim() !== '');
  if (!brutas.length) throw new Error('O arquivo não tem nenhuma tarefa.');

  /* responsáveis: recursos ligados às tarefas pelas atribuições */
  const recursos = new Map<string, string>();
  blocos(bloco(corpo, 'Resources'), 'Resource').forEach((r) => { const n = tag(r, 'Name'); if (n) recursos.set(tag(r, 'UID'), n); });
  const respDe = new Map<string, string[]>();
  blocos(bloco(corpo, 'Assignments'), 'Assignment').forEach((a) => {
    const nome = recursos.get(tag(a, 'ResourceUID')); const tu = tag(a, 'TaskUID');
    if (nome) respDe.set(tu, [...(respDe.get(tu) ?? []), nome]);
  });

  const idDe = new Map<string, string>();
  const tarefas: Tarefa[] = brutas.map((b) => {
    const t = novaTarefa({ nome: b.nome.trim() });
    idDe.set(b.uid, t.id);
    return t;
  });
  let anterior = -1;
  brutas.forEach((b, i) => {
    const t = tarefas[i];
    t.nivel = Math.min(b.nivel, anterior + 1, 5); anterior = t.nivel;
    const proximoMaisFundo = i + 1 < brutas.length && brutas[i + 1].nivel > b.nivel;
    const resumo = b.resumo || proximoMaisFundo;
    t.marco = !resumo && (b.marco || duracaoEmDias(b.dur, minPorDia) === 0);
    t.dur = resumo ? 1 : t.marco ? 0 : Math.max(0.5, duracaoEmDias(b.dur, minPorDia));
    t.pct = Math.max(0, Math.min(100, b.pct));
    t.resp = (respDe.get(b.uid) ?? []).join(', ');
    t.pred = b.links.map((l): Pred | null => {
      const id = idDe.get(l.uid); if (!id || id === t.id) return null;
      // o atraso vem em décimos de minuto
      const lag = Math.round(l.lag / 10 / minPorDia);
      return { id, tipo: TIPO_DE_MSP[l.tipo] ?? 'TI', lag };
    }).filter((p): p is Pred => p !== null);
    // a data de início só vale para tarefas sem predecessoras (as outras são calculadas)
    if (!t.pred.length && !resumo) t.iniM = iso2n(b.ini);
  });

  /* calendário */
  let cal: ProjetoImportado['cal'] = null;
  const calendarios = blocos(bloco(corpo, 'Calendars'), 'Calendar');
  const principal = calendarios.find((c) => tag(c, 'IsBaseCalendar') === '1') ?? calendarios[0];
  if (principal && /<WeekDay>/.test(principal)) {
    const trabalha = (tipo: string) => blocos(principal, 'WeekDay').some((d) => tag(d, 'DayType') === tipo && tag(d, 'DayWorking') === '1');
    const fer: string[] = [];
    blocos(bloco(principal, 'Exceptions'), 'Exception').forEach((e) => {
      if (tag(e, 'DayWorking') !== '0') return;
      const de = iso2n(tag(e, 'FromDate').slice(0, 10)), ate = iso2n(tag(e, 'ToDate').slice(0, 10));
      if (de == null || ate == null) return;
      for (let n = de; n <= Math.min(ate, de + 366); n++) fer.push(n2iso(n));
    });
    cal = { sab: trabalha('7'), dom: trabalha('1'), fer };
  }

  return { nome: tag(corpo, 'Title') || tag(corpo, 'Name'), inicio: tag(corpo, 'StartDate').slice(0, 10), cal, tarefas };
}

/* =========================== EXPORTAÇÃO =========================== */
const dataHora = (iso: string, hora: string) => `${iso}T${hora}`;
const duracao = (dias: number) => { const min = Math.round(dias * MIN_DIA); return `PT${Math.floor(min / 60)}H${min % 60}M0S`; };

export function exportarMSProject(S: Estado, c: Calc[]): string {
  const T = S.tarefas;
  const iso = (n: number | null, padrao: string) => (n == null ? padrao : n2iso(n));
  const inicioProj = S.meta.inicio || n2iso(c.find((k) => k.ini != null)?.ini ?? 0);
  const fimProj = iso(c.reduce<number | null>((m, k) => (k.fim != null && (m == null || k.fim > m) ? k.fim : m), null), inicioProj);
  const idx = new Map<string, number>(); T.forEach((t, i) => idx.set(t.id, i + 1));

  const dia = (tipo: number, trabalha: boolean) => trabalha
    ? `<WeekDay><DayType>${tipo}</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>`
    : `<WeekDay><DayType>${tipo}</DayType><DayWorking>0</DayWorking></WeekDay>`;
  const excecoes = (S.cal.fer || []).filter(Boolean).map((f) =>
    `<Exception><EnteredByOccurrences>0</EnteredByOccurrences><TimePeriod><FromDate>${dataHora(f, '00:00:00')}</FromDate><ToDate>${dataHora(f, '23:59:00')}</ToDate></TimePeriod><DayWorking>0</DayWorking></Exception>`).join('');

  const responsaveis = [...new Set(T.flatMap((t) => (t.resp || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean)))];
  const uidRec = new Map<string, number>(); responsaveis.forEach((r, i) => uidRec.set(r, i + 1));

  const tarefas = T.map((t, i) => {
    const k = c[i] ?? ({} as Calc);
    const resumo = i + 1 < T.length && T[i + 1].nivel > t.nivel;
    const ini = iso(k.ini ?? null, inicioProj), fim = iso(k.fim ?? null, ini);
    const links = (t.pred || []).filter((p) => idx.has(p.id)).map((p) =>
      `<PredecessorLink><PredecessorUID>${idx.get(p.id)}</PredecessorUID><Type>${TIPO_PARA_MSP[p.tipo] ?? 1}</Type><CrossProject>0</CrossProject><LinkLag>${Math.round((p.lag || 0) * MIN_DIA * 10)}</LinkLag><LagFormat>7</LagFormat></PredecessorLink>`).join('');
    return `<Task><UID>${i + 1}</UID><ID>${i + 1}</ID><Name>${escaparXml(t.nome || 'Tarefa ' + (i + 1))}</Name><Type>0</Type><IsNull>0</IsNull>` +
      `<OutlineLevel>${t.nivel + 1}</OutlineLevel><Start>${dataHora(ini, '08:00:00')}</Start><Finish>${dataHora(fim, '17:00:00')}</Finish>` +
      `<Duration>${duracao(resumo ? Math.max(0, k.dur || 0) : t.marco ? 0 : t.dur)}</Duration><DurationFormat>7</DurationFormat>` +
      `<Milestone>${t.marco && !resumo ? 1 : 0}</Milestone><Summary>${resumo ? 1 : 0}</Summary>` +
      `<PercentComplete>${Math.round(Math.max(0, Math.min(100, resumo ? k.pct || 0 : t.pct)))}</PercentComplete>${links}</Task>`;
  }).join('');

  const recursos = responsaveis.map((r) => `<Resource><UID>${uidRec.get(r)}</UID><ID>${uidRec.get(r)}</ID><Name>${escaparXml(r)}</Name><Type>1</Type></Resource>`).join('');
  let n = 0;
  const atribuicoes = T.flatMap((t, i) => (t.resp || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean).map((r) =>
    `<Assignment><UID>${++n}</UID><TaskUID>${i + 1}</TaskUID><ResourceUID>${uidRec.get(r)}</ResourceUID></Assignment>`)).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Project xmlns="http://schemas.microsoft.com/project">` +
    `<Name>${escaparXml((S.meta.nome || 'Cronograma') + '.xml')}</Name><Title>${escaparXml(S.meta.nome || 'Cronograma')}</Title>` +
    `<ScheduleFromStart>1</ScheduleFromStart><StartDate>${dataHora(inicioProj, '08:00:00')}</StartDate><FinishDate>${dataHora(fimProj, '17:00:00')}</FinishDate>` +
    `<CalendarUID>1</CalendarUID><MinutesPerDay>${MIN_DIA}</MinutesPerDay><MinutesPerWeek>${MIN_DIA * 5}</MinutesPerWeek><DaysPerMonth>20</DaysPerMonth>` +
    `<Calendars><Calendar><UID>1</UID><Name>Padrão</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>` +
    [dia(1, !!S.cal.dom), dia(2, true), dia(3, true), dia(4, true), dia(5, true), dia(6, true), dia(7, !!S.cal.sab)].join('') +
    `</WeekDays>${excecoes ? `<Exceptions>${excecoes}</Exceptions>` : ''}</Calendar></Calendars>` +
    `<Tasks>${tarefas}</Tasks>${recursos ? `<Resources>${recursos}</Resources>` : ''}${atribuicoes ? `<Assignments>${atribuicoes}</Assignments>` : ''}</Project>`;
}
