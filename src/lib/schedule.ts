import { DIA, MES, dow, hojeN, n2iso, n2br, n2brc, parseData } from './dates';

/* =========================== TIPOS =========================== */
export type TipoPred = 'TI' | 'II' | 'TT' | 'IT';
export interface Pred { id: string; tipo: TipoPred; lag: number }
export interface Baseline { i: number | null; f: number | null }
export interface Tarefa {
  id: string; nome: string; nivel: number; dur: number; iniM: number | null;
  pred: Pred[]; peso: number | null; pct: number; rIni: number | null; rFim: number | null;
  resp: string; marco: boolean; fechado: boolean; bl: Baseline | null;
}
export interface Medicao { d: string; p: number }
export type Zoom = 'd' | 's' | 'm' | 'q';
export interface Estado {
  v: 2;
  meta: {
    nome: string; contrato: string; empresa: string; resp: string; pmo: string; obs: string;
    inicio: string; statusDate: string;
  };
  cal: { sab: boolean; dom: boolean; fer: string[] };
  tarefas: Tarefa[];
  medicoes: Medicao[];
  zoom: Zoom;
  baseline: boolean;
}
export interface Calc {
  ini: number | null; fim: number | null; li: number | null; lf: number | null;
  folga: number; crit: boolean; res: boolean; pct: number; peso: number; dur: number;
  erro: string | null;
}
export interface Cal { sab: boolean; dom: boolean; fer: Set<number> }

/* =========================== ESTADO =========================== */
export function makeCal(S: Estado): Cal {
  const fer = new Set<number>();
  (S.cal.fer || []).forEach((f) => { const n = parseData(f); if (n != null) fer.add(n); });
  return { sab: !!S.cal.sab, dom: !!S.cal.dom, fer };
}

export function proxUtilRaw(n: number): number {
  let d = dow(n); let g = 0;
  while ((d === 0 || d === 6) && g < 7) { n++; d = dow(n); g++; }
  return n;
}

export function novoEstado(): Estado {
  return {
    v: 2,
    meta: {
      nome: '', contrato: '', empresa: '', resp: '', pmo: '', obs: '',
      inicio: n2iso(proxUtilRaw(hojeN())), statusDate: n2iso(hojeN()),
    },
    cal: { sab: false, dom: false, fer: [] },
    tarefas: [], medicoes: [], zoom: 's', baseline: false,
  };
}

export function novaTarefa(o?: Partial<Tarefa>): Tarefa {
  return {
    id: 't' + Math.random().toString(36).slice(2, 9),
    nome: '', nivel: 0, dur: 1, iniM: null, pred: [], peso: null, pct: 0,
    rIni: null, rFim: null, resp: '', marco: false, fechado: false, bl: null,
    ...(o || {}),
  };
}

/** Normaliza um objeto vindo de arquivo/link para um Estado completo. */
export function normalizarEstado(obj: Partial<Estado> | null | undefined): Estado {
  const base = novoEstado();
  const o = (obj && typeof obj === 'object' ? obj : {}) as Partial<Estado>;
  const n = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const nn = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const tarefas = (Array.isArray(o.tarefas) ? o.tarefas : []).filter((t) => t && typeof t === 'object').map((t) => {
    const x = novaTarefa(t as Partial<Tarefa>);
    x.nome = String(x.nome ?? ''); x.resp = String(x.resp ?? '');
    x.nivel = Math.max(0, Math.min(8, Math.round(n(x.nivel)))); x.dur = Math.max(0, n(x.dur, 1));
    x.pct = Math.max(0, Math.min(100, n(x.pct))); x.iniM = nn(x.iniM); x.rIni = nn(x.rIni); x.rFim = nn(x.rFim); x.peso = nn(x.peso);
    x.pred = (Array.isArray(x.pred) ? x.pred : []).filter((p) => p && typeof p.id === 'string')
      .map((p) => ({ id: p.id, tipo: (['TI', 'II', 'TT', 'IT'].includes(p.tipo) ? p.tipo : 'TI') as TipoPred, lag: n(p.lag) }));
    return x;
  });
  // evita ids repetidos e nível maior que o permitido pela linha anterior
  const vistos = new Set<string>();
  tarefas.forEach((t, i) => {
    if (vistos.has(t.id)) t.id = 't' + Math.random().toString(36).slice(2, 9);
    vistos.add(t.id);
    t.nivel = i === 0 ? 0 : Math.min(t.nivel, tarefas[i - 1].nivel + 1);
  });
  return {
    ...base, v: 2,
    meta: { ...base.meta, ...(o.meta && typeof o.meta === 'object' ? o.meta : {}) },
    cal: { sab: !!o.cal?.sab, dom: !!o.cal?.dom, fer: Array.isArray(o.cal?.fer) ? o.cal!.fer.map(String) : [] },
    tarefas,
    medicoes: (Array.isArray(o.medicoes) ? o.medicoes : []).filter((m) => m && typeof m.d === 'string').map((m) => ({ d: m.d, p: n(m.p) })),
    zoom: (['d', 's', 'm', 'q'].includes(String(o.zoom)) ? o.zoom : 's') as Zoom,
    baseline: !!o.baseline,
  };
}

/* =========================== CALENDÁRIO =========================== */
export function ehUtil(cal: Cal, n: number): boolean {
  const d = dow(n);
  if (d === 0 && !cal.dom) return false;
  if (d === 6 && !cal.sab) return false;
  return !cal.fer.has(n);
}
export function proxUtil(cal: Cal, n: number): number { let g = 0; while (!ehUtil(cal, n) && g < 1500) { n++; g++; } return n; }
export function antUtil(cal: Cal, n: number): number { let g = 0; while (!ehUtil(cal, n) && g < 1500) { n--; g++; } return n; }
export function somaUtil(cal: Cal, n: number, k: number): number {
  n = proxUtil(cal, n); let i = 0, g = 0;
  while (i < k && g < 9000) { n++; if (ehUtil(cal, n)) i++; g++; }
  return n;
}
export function subUtil(cal: Cal, n: number, k: number): number {
  n = antUtil(cal, n); let i = 0, g = 0;
  while (i < k && g < 9000) { n--; if (ehUtil(cal, n)) i++; g++; }
  return n;
}
/** dias úteis de a até b, inclusivo */
export function difUtil(cal: Cal, a: number | null, b: number | null): number {
  if (a == null || b == null) return 0;
  if (b < a) return -difUtil(cal, b, a);
  let c = 0; for (let n = a; n <= b; n++) if (ehUtil(cal, n)) c++;
  return c;
}

/* =========================== HIERARQUIA =========================== */
export function ehResumo(T: Tarefa[], i: number): boolean { return i + 1 < T.length && T[i + 1].nivel > T[i].nivel; }
export function filhos(T: Tarefa[], i: number): number[] {
  const out: number[] = [];
  for (let j = i + 1; j < T.length && T[j].nivel > T[i].nivel; j++) out.push(j);
  return out;
}
export function folhas(T: Tarefa[], i: number): number[] { return filhos(T, i).filter((j) => !ehResumo(T, j)); }
function pesoDe(t: Tarefa): number {
  if (t.peso != null && (t.peso as unknown) !== '' && !isNaN(t.peso)) return Math.max(0, +t.peso);
  if (t.marco || +t.dur === 0) return 0;
  return Math.max(0.01, +t.dur || 1);
}
export function linhasVisiveis(T: Tarefa[]): number[] {
  const out: number[] = []; let i = 0;
  while (i < T.length) {
    out.push(i);
    if (T[i].fechado && ehResumo(T, i)) i += filhos(T, i).length + 1;
    else i++;
  }
  return out;
}
export function edt(T: Tarefa[], i: number): string {
  const pilha: number[] = [];
  for (let j = 0; j <= i; j++) {
    const lv = T[j].nivel;
    while (pilha.length > lv + 1) pilha.pop();
    if (pilha.length === lv + 1) pilha[lv]++; else pilha.push(1);
  }
  return pilha.join('.');
}

/* =========================== MOTOR CPM =========================== */
export function calcular(S: Estado, cal: Cal): Calc[] {
  const T = S.tarefas, n = T.length;
  const ix: Record<string, number> = {}; T.forEach((t, i) => { ix[t.id] = i; });
  const c: Calc[] = T.map((t) => ({
    ini: null, fim: null, li: null, lf: null, folga: 0, crit: false, res: false,
    pct: 0, peso: 0, dur: +t.dur || 0, erro: null,
  }));
  for (let i = 0; i < n; i++) c[i].res = ehResumo(T, i);
  const inicioProj = parseData(S.meta.inicio) ?? hojeN();

  const preds = T.map((t) =>
    (t.pred || []).map((p) => ({ ...p, i: ix[p.id] as number | undefined }))
      .filter((p): p is Pred & { i: number } => p.i != null && p.i >= 0 && !c[p.i].res));
  const visit = new Array(n).fill(0); const ordem: number[] = []; let ciclo = false;
  const go = (i: number) => {
    if (visit[i] === 2) return;
    if (visit[i] === 1) { ciclo = true; return; }
    visit[i] = 1; preds[i].forEach((p) => { if (!c[p.i].res) go(p.i); }); visit[i] = 2; ordem.push(i);
  };
  for (let i = 0; i < n; i++) if (!c[i].res) go(i);
  if (ciclo) c.forEach((x) => { x.erro = 'ciclo'; });

  const mv = (x: number, lag: number) => (lag >= 0 ? somaUtil(cal, x, lag) : subUtil(cal, x, -lag));

  for (const i of ordem) {
    const t = T[i]; const dur = t.marco ? 0 : Math.max(0, +t.dur || 0);
    let es: number | null = t.iniM != null ? proxUtil(cal, t.iniM) : null;
    let ef: number | null = null;
    for (const p of preds[i]) {
      const pc = c[p.i]; if (pc.ini == null || pc.fim == null) continue;
      const lag = +p.lag || 0; const tp = p.tipo || 'TI';
      if (tp === 'TI') { const x = mv(proxUtil(cal, pc.fim + 1), lag); es = es == null || x > es ? x : es; }
      else if (tp === 'II') { const x = mv(pc.ini, lag); es = es == null || x > es ? x : es; }
      else if (tp === 'TT') { const x = mv(pc.fim, lag); ef = ef == null || x > ef ? x : ef; }
      else if (tp === 'IT') { const x = mv(pc.ini, lag); ef = ef == null || x > ef ? x : ef; }
    }
    if (es == null && ef == null) es = t.iniM != null ? proxUtil(cal, t.iniM) : proxUtil(cal, inicioProj);
    if (es == null && ef != null) es = dur <= 1 ? proxUtil(cal, ef) : subUtil(cal, ef, dur - 1);
    let start = es as number;
    let fim = dur <= 1 ? proxUtil(cal, start) : somaUtil(cal, start, dur - 1);
    if (ef != null && ef > fim) { fim = proxUtil(cal, ef); start = dur <= 1 ? fim : subUtil(cal, fim, dur - 1); }
    c[i].ini = proxUtil(cal, start); c[i].fim = fim; c[i].dur = dur;
  }

  const maxN = Math.max(0, ...T.map((t) => t.nivel));
  for (let lv = maxN; lv >= 0; lv--) {
    for (let i = 0; i < n; i++) {
      if (T[i].nivel !== lv || !c[i].res) continue;
      let a: number | null = null, b: number | null = null;
      filhos(T, i).forEach((j) => {
        if (c[j].ini == null || c[j].fim == null) return;
        if (a == null || c[j].ini! < a) a = c[j].ini;
        if (b == null || c[j].fim! > b) b = c[j].fim;
      });
      c[i].ini = a; c[i].fim = b; c[i].dur = a != null && b != null ? difUtil(cal, a, b) : 0;
    }
  }

  for (let i = 0; i < n; i++) if (!c[i].res) c[i].peso = pesoDe(T[i]);
  for (let lv = maxN; lv >= 0; lv--) for (let i = 0; i < n; i++) {
    if (T[i].nivel !== lv || !c[i].res) continue;
    c[i].peso = folhas(T, i).reduce((s, j) => s + c[j].peso, 0);
  }
  for (let i = 0; i < n; i++) if (!c[i].res) c[i].pct = Math.max(0, Math.min(100, +T[i].pct || 0));
  for (let lv = maxN; lv >= 0; lv--) for (let i = 0; i < n; i++) {
    if (T[i].nivel !== lv || !c[i].res) continue;
    const fl = folhas(T, i); const pw = fl.reduce((s, j) => s + c[j].peso, 0);
    c[i].pct = pw > 0 ? fl.reduce((s, j) => s + c[j].peso * c[j].pct, 0) / pw : 0;
  }

  const fimProj = Math.max(...c.filter((x) => x.fim != null).map((x) => x.fim as number), inicioProj);
  const sucs: { i: number; tipo: TipoPred; lag: number }[][] = T.map(() => []);
  for (let i = 0; i < n; i++) preds[i].forEach((p) => {
    if (!c[i].res && !c[p.i].res) sucs[p.i].push({ i, tipo: p.tipo || 'TI', lag: +p.lag || 0 });
  });
  for (let k = ordem.length - 1; k >= 0; k--) {
    const i = ordem[k];
    if (!sucs[i].length) c[i].lf = fimProj;
    else {
      let lf: number | null = null;
      for (const s of sucs[i]) {
        const sc = c[s.i]; if (sc.li == null || sc.lf == null) continue;
        let x: number;
        if (s.tipo === 'TI') x = antUtil(cal, (s.lag >= 0 ? subUtil(cal, sc.li, s.lag) : somaUtil(cal, sc.li, -s.lag)) - 1);
        else if (s.tipo === 'II') x = somaUtil(cal, s.lag >= 0 ? subUtil(cal, sc.li, s.lag) : somaUtil(cal, sc.li, -s.lag), Math.max(0, c[i].dur - 1));
        else if (s.tipo === 'TT') x = s.lag >= 0 ? subUtil(cal, sc.lf, s.lag) : somaUtil(cal, sc.lf, -s.lag);
        else x = somaUtil(cal, s.lag >= 0 ? subUtil(cal, sc.lf, s.lag) : somaUtil(cal, sc.lf, -s.lag), Math.max(0, c[i].dur - 1));
        lf = lf == null || x < lf ? x : lf;
      }
      c[i].lf = lf == null ? fimProj : lf;
    }
    const lf = c[i].lf as number;
    c[i].li = c[i].dur <= 1 ? antUtil(cal, lf) : subUtil(cal, lf, c[i].dur - 1);
    c[i].folga = difUtil(cal, c[i].fim, lf) - 1;
    c[i].crit = c[i].folga <= 0 && (c[i].pct || 0) < 100;
  }
  for (let i = 0; i < n; i++) if (c[i].res) {
    const fl = folhas(T, i);
    c[i].crit = fl.length ? fl.every((j) => c[j].crit) : false;
    c[i].folga = fl.length ? Math.min(...fl.map((j) => c[j].folga)) : 0;
  }
  return c;
}

/* =========================== PREDECESSORAS =========================== */
export function predTexto(T: Tarefa[], t: Tarefa): string {
  const ix: Record<string, number> = {}; T.forEach((x, i) => { ix[x.id] = i; });
  return (t.pred || []).map((p) => {
    const i = ix[p.id]; if (i == null) return null;
    const tp = (p.tipo || 'TI') === 'TI' ? '' : p.tipo;
    const lg = p.lag ? (p.lag > 0 ? '+' + p.lag : String(p.lag)) : '';
    return (i + 1) + tp + lg;
  }).filter(Boolean).join(';');
}
export function predParse(T: Tarefa[], txt: string, linhaAtual: number): Pred[] {
  const out: Pred[] = [];
  String(txt || '').split(/[;,]/).forEach((pc) => {
    pc = pc.trim(); if (!pc) return;
    const m = /^(\d+)\s*(TI|II|TT|IT|FS|SS|FF|SF)?\s*([+-]\s*\d+)?$/i.exec(pc.replace(/\s/g, ''));
    if (!m) return;
    const linha = +m[1] - 1;
    if (linha < 0 || linha >= T.length || linha === linhaAtual) return;
    const tp = (m[2] || 'TI').toUpperCase();
    const map: Record<string, TipoPred> = { FS: 'TI', SS: 'II', FF: 'TT', SF: 'IT', TI: 'TI', II: 'II', TT: 'TT', IT: 'IT' };
    out.push({ id: T[linha].id, tipo: map[tp], lag: m[3] ? +m[3].replace(/\s/g, '') : 0 });
  });
  return out;
}

/* =========================== EDIÇÃO DE CÉLULA =========================== */
export type CampoGrade = 'nome' | 'resp' | 'dur' | 'ini' | 'fim' | 'pred' | 'pct' | 'peso' | 'rIni' | 'rFim';
/** Aplica a edição diretamente em S (que deve ser uma cópia). `calcAnt` = cálculo do estado anterior. */
export function aplicarCampo(S: Estado, cal: Cal, calcAnt: Calc[], i: number, k: CampoGrade, val: string) {
  const t = S.tarefas[i]; if (!t) return;
  if (k === 'nome' || k === 'resp') t[k] = val;
  else if (k === 'dur') { const v = Math.max(0, parseFloat(String(val).replace(',', '.')) || 0); t.dur = v; t.marco = v === 0; }
  else if (k === 'ini') t.iniM = parseData(val);
  else if (k === 'fim') {
    const n = parseData(val);
    if (n != null) { const ini = calcAnt[i]?.ini; if (ini != null) { t.dur = Math.max(0, difUtil(cal, ini, n)); t.marco = t.dur === 0; } }
  }
  else if (k === 'pred') t.pred = predParse(S.tarefas, val, i);
  else if (k === 'pct') {
    t.pct = Math.max(0, Math.min(100, parseFloat(String(val).replace(',', '.')) || 0));
    if (t.pct > 0 && !t.rIni) { const cc = calcAnt[i]; t.rIni = cc && cc.ini != null ? cc.ini : hojeN(); }
    if (t.pct >= 100 && !t.rFim) t.rFim = parseData(S.meta.statusDate) ?? hojeN();
    if (t.pct < 100) t.rFim = null;
  }
  else if (k === 'peso') { const v = String(val).trim(); t.peso = v === '' ? null : Math.max(0, parseFloat(v.replace(',', '.')) || 0); }
  else if (k === 'rIni' || k === 'rFim') t[k] = parseData(val);
}

/* =========================== CURVA S =========================== */
export interface CurvaPrev { acum: Map<number, number>; dias: number[]; total: number; temBl: boolean }
export function curvaPrevista(S: Estado, c: Calc[], cal: Cal): CurvaPrev {
  const temBl = S.tarefas.some((t) => t.bl && t.bl.i != null);
  const mapa = new Map<number, number>(); let total = 0;
  S.tarefas.forEach((t, i) => {
    const k = c[i]; if (!k || k.res) return;
    const w = k.peso || 0; if (w <= 0) return;
    let a = k.ini, b = k.fim;
    if (temBl && t.bl && t.bl.i != null) { a = t.bl.i; b = t.bl.f; }
    if (a == null || b == null) return;
    total += w;
    const dias: number[] = []; for (let n = a; n <= b; n++) if (ehUtil(cal, n)) dias.push(n);
    if (!dias.length) dias.push(a);
    const q = w / dias.length;
    dias.forEach((n) => mapa.set(n, (mapa.get(n) || 0) + q));
  });
  const dias = [...mapa.keys()].sort((a, b) => a - b);
  let ac = 0; const acum = new Map<number, number>();
  dias.forEach((n) => { ac += mapa.get(n)!; acum.set(n, total > 0 ? (ac / total) * 100 : 0); });
  return { acum, dias, total, temBl };
}
export function pctPrevistoEm(n: number, cp: CurvaPrev): number {
  if (!cp.dias.length || n < cp.dias[0]) return 0;
  let v = 0;
  for (const d of cp.dias) { if (d <= n) v = cp.acum.get(d)!; else break; }
  return v;
}
export function pctRealAtual(c: Calc[]): number {
  let w = 0, p = 0;
  c.forEach((k) => { if (k.res) return; w += k.peso || 0; p += (k.peso || 0) * (k.pct || 0); });
  return w > 0 ? p / w : 0;
}
export function serieReal(S: Estado, c: Calc[]): { n: number; p: number }[] {
  const sd = parseData(S.meta.statusDate) ?? hojeN();
  const m = (S.medicoes || []).map((x) => ({ n: parseData(x.d), p: +x.p })).filter((x): x is { n: number; p: number } => x.n != null);
  m.push({ n: sd, p: pctRealAtual(c) });
  const mp = new Map<number, number>(); m.sort((a, b) => a.n - b.n).forEach((x) => mp.set(x.n, x.p));
  return [...mp.entries()].map(([n, p]) => ({ n, p })).sort((a, b) => a.n - b.n);
}
export interface Tendencia {
  spi: number; fimProj: number; pontos: { n: number; v: number }[]; concluida?: boolean;
  real: number; ini: number; fimPrev: number; es?: number; atraso: number;
}
export function tendencia(S: Estado, c: Calc[], cal: Cal, cp: CurvaPrev): Tendencia | null {
  if (!cp.dias.length) return null;
  const sd = parseData(S.meta.statusDate) ?? hojeN();
  const real = pctRealAtual(c);
  const ini = cp.dias[0], fimPrev = cp.dias[cp.dias.length - 1];
  if (sd <= ini) return null;
  if (real >= 99.95) return { spi: 1, fimProj: sd, pontos: [], concluida: true, real, ini, fimPrev, atraso: 0 };
  if (real <= 0.2) return null;
  let es = ini, idx = 0;
  for (let i = 0; i < cp.dias.length; i++) { if (cp.acum.get(cp.dias[i])! <= real) { es = cp.dias[i]; idx = i; } else break; }
  const prox = cp.dias[idx + 1];
  if (prox != null) {
    const v0 = cp.acum.get(es)!, v1 = cp.acum.get(prox)!;
    if (v1 > v0) es = Math.round(es + ((real - v0) / (v1 - v0)) * (prox - es));
  }
  const decorrido = difUtil(cal, ini, sd), ganho = difUtil(cal, ini, es);
  if (decorrido <= 0) return null;
  const spi = ganho / decorrido;
  if (!(spi > 0.08)) return null;
  const durTotal = difUtil(cal, ini, fimPrev);
  const fimProj = somaUtil(cal, ini, Math.max(0, Math.round(durTotal / spi) - 1));
  const pts = [{ n: sd, v: real }];
  for (let d = ini; d <= fimPrev; d += 7) {
    const v = pctPrevistoEm(d, cp); if (v <= real + 0.01) continue;
    const t = somaUtil(cal, ini, Math.max(0, Math.round(difUtil(cal, ini, d) / spi) - 1));
    if (t > sd) pts.push({ n: t, v: Math.min(100, v) });
  }
  if (!pts.length || pts[pts.length - 1].v < 99.9) pts.push({ n: fimProj, v: 100 });
  return { spi, fimProj, pontos: pts, es, real, ini, fimPrev, atraso: difUtil(cal, fimPrev, fimProj) - 1 };
}
export function realEm(n: number, serie: { n: number; p: number }[]): number | null {
  let v: number | null = null; serie.forEach((p) => { if (p.n <= n) v = p.p; }); return v;
}

/* =========================== FORMATAÇÃO =========================== */
/** "1 dia" / "3 dias" (aceita negativos: "-1 dia"). */
export const diasTxt = (n: number) => `${n} ${Math.abs(n) === 1 ? "dia" : "dias"}`;
export function fmtN(v: number | null | undefined, d = 0): string {
  return v == null || isNaN(v) ? '' : (+v).toFixed(d).replace('.', ',');
}
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string));
}

/* =========================== ARQUIVOS / LINK =========================== */
function b64u(bytes: Uint8Array): string {
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH) as unknown as number[]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '=';
  const bin = atob(str); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
/** Limites ao abrir um link: protegem o navegador de um link malicioso (descompressão enorme). */
export const LIMITE_LINK_TEXTO = 3_000_000;
export const LIMITE_LINK_BYTES = 8 * 1024 * 1024;

/** `validadeDias`: depois disso o link não abre mais (0 ou vazio = sem validade). */
export async function empacotar(obj: unknown, validadeDias = 0): Promise<string> {
  const dado = validadeDias > 0 && obj && typeof obj === 'object' ? { ...(obj as object), _exp: Date.now() + validadeDias * 86400000 } : obj;
  const bytes = new TextEncoder().encode(JSON.stringify(dado));
  if (typeof CompressionStream !== 'undefined') {
    try {
      const cs = new CompressionStream('deflate-raw');
      const w = cs.writable.getWriter(); w.write(bytes); w.close();
      const buf = await new Response(cs.readable).arrayBuffer();
      return 'z' + b64u(new Uint8Array(buf));
    } catch { /* cai para json simples */ }
  }
  return 'j' + b64u(bytes);
}
export async function desempacotar(str: string): Promise<Estado> {
  if (str.length > LIMITE_LINK_TEXTO) throw new Error('O link é grande demais para abrir com segurança. Peça o arquivo .json.');
  const tipo = str[0]; const dados = unb64u(str.slice(1));
  let bytes: Uint8Array = dados;
  if (tipo === 'z') {
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter(); void w.write(dados as unknown as BufferSource).catch(() => undefined); void w.close().catch(() => undefined);
    const leitor = ds.readable.getReader(); const partes: Uint8Array[] = []; let total = 0;
    for (;;) {
      const { done, value } = await leitor.read(); if (done) break;
      total += value.length;
      if (total > LIMITE_LINK_BYTES) { await leitor.cancel(); throw new Error('O link é grande demais para abrir com segurança. Peça o arquivo .json.'); }
      partes.push(value);
    }
    bytes = new Uint8Array(total); let pos = 0; partes.forEach((p) => { bytes.set(p, pos); pos += p.length; });
  } else if (bytes.length > LIMITE_LINK_BYTES) throw new Error('O link é grande demais para abrir com segurança. Peça o arquivo .json.');
  const obj = JSON.parse(new TextDecoder().decode(bytes)) as Estado & { _exp?: number };
  if (typeof obj._exp === 'number' && obj._exp < Date.now()) throw new Error('Este link expirou. Peça um link novo a quem enviou.');
  return obj;
}
export function baixar(nome: string, conteudo: BlobPart, tipo = 'application/json;charset=utf-8') {
  const b = new Blob([conteudo], { type: tipo });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
}
export function nomeArquivo(S: Estado, ext: string): string {
  const n = (S.meta.nome || 'cronograma').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\- ]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
  return `${n || 'cronograma'}-${n2iso(parseData(S.meta.statusDate) ?? hojeN())}.${ext}`;
}

export function exportarCSV(S: Estado, c: Calc[]) {
  const sep = ';';
  const cab = ['Nº', 'EDT', 'Tarefa', 'Duração', 'Início', 'Término', 'Predecessoras', 'Peso', '% Concluído', 'Responsável', 'Início real', 'Término real', 'Folga'];
  const linhas = [cab.join(sep)];
  S.tarefas.forEach((t, i) => {
    const k = c[i] || ({} as Calc);
    linhas.push([i + 1, edt(S.tarefas, i), '"' + String(t.nome || '').replace(/"/g, '""') + '"', k.dur || 0, n2br(k.ini), n2br(k.fim),
      predTexto(S.tarefas, t), fmtN(k.peso, 2), Math.round(k.pct || 0), '"' + String(t.resp || '') + '"',
      n2br(t.rIni), n2br(t.rFim), k.res ? '' : (k.folga ?? '')].join(sep));
  });
  linhas.push('');
  linhas.push('Cronograma de Obra - desenvolvido pelo Engenheiro Joilson de Paula');
  baixar(nomeArquivo(S, 'csv'), '﻿' + linhas.join('\r\n'), 'text/csv;charset=utf-8');
}

/** Importa texto colado do Excel/CSV. Retorna as novas tarefas (já com predecessoras resolvidas) acrescentadas a `S`. */
export function importarTexto(S: Estado, cal: Cal, txt: string): number {
  const linhas = txt.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  if (!linhas.length) return 0;
  const sep = (linhas[0].match(/\t/g) || []).length ? '\t'
    : ((linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ',');
  const parse = (l: string) => {
    const out: string[] = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === sep && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out.map((s) => s.trim());
  };
  let dados = linhas.map(parse);
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const cab = dados[0].map(norm);
  const acha = (...alvos: string[]) => cab.findIndex((h) => alvos.some((a) => h.includes(a)));
  let map = {
    nome: acha('tarefa', 'nome', 'atividade', 'servico', 'descricao'), dur: acha('dur'),
    ini: acha('inicio', 'comec', 'start'), fim: acha('termino', 'fim', 'conclus', 'finish', 'end'),
    pred: acha('predec', 'depend'), pct: acha('%', 'concl', 'avanc', 'progres'),
    peso: acha('peso', 'incid'), resp: acha('respons', 'equipe', 'encarreg'), edt: acha('edt', 'item', 'wbs', 'nivel', 'estrutura'),
  };
  const temCab = map.nome >= 0 || map.dur >= 0 || map.ini >= 0;
  if (temCab) dados = dados.slice(1);
  else map = { nome: 0, dur: 1, ini: 2, fim: 3, pred: 4, pct: 5, peso: -1, resp: -1, edt: -1 };
  const novas: (Tarefa & { _pred?: string; _fim?: string })[] = [];
  dados.forEach((cel) => {
    const nome = (map.nome >= 0 ? cel[map.nome] : cel[0]) || '';
    if (!nome.trim()) return;
    let nivel = 0;
    if (map.edt >= 0 && cel[map.edt]) nivel = Math.max(0, (String(cel[map.edt]).match(/\./g) || []).length);
    else { const m = /^(\s+)/.exec(map.nome >= 0 ? cel[map.nome] : cel[0]); if (m) nivel = Math.min(4, Math.floor(m[1].length / 2)); }
    const t: Tarefa & { _pred?: string; _fim?: string } = novaTarefa({ nome: nome.trim(), nivel });
    if (map.dur >= 0 && cel[map.dur] != null) {
      const d = parseFloat(String(cel[map.dur]).replace(',', '.').replace(/[^\d.-]/g, ''));
      if (!isNaN(d)) { t.dur = Math.max(0, d); t.marco = t.dur === 0; }
    }
    if (map.ini >= 0) { const n = parseData(cel[map.ini]); if (n != null) t.iniM = n; }
    if (map.pct >= 0) {
      const p = parseFloat(String(cel[map.pct]).replace('%', '').replace(',', '.'));
      if (!isNaN(p)) t.pct = Math.max(0, Math.min(100, p <= 1 && String(cel[map.pct]).includes('0.') ? p * 100 : p));
    }
    if (map.peso >= 0) { const p = parseFloat(String(cel[map.peso]).replace(',', '.')); if (!isNaN(p)) t.peso = p; }
    if (map.resp >= 0) t.resp = cel[map.resp] || '';
    t._pred = map.pred >= 0 ? cel[map.pred] : '';
    t._fim = map.fim >= 0 ? cel[map.fim] : '';
    novas.push(t);
  });
  if (!novas.length) return 0;
  const base = S.tarefas.length;
  S.tarefas = S.tarefas.concat(novas);
  novas.forEach((t, j) => {
    if (t._pred) t.pred = predParse(S.tarefas, t._pred.replace(/(\d+)/g, (m) => String(+m + base)), base + j);
    if (t.dur === 1 && t._fim) {
      const f = parseData(t._fim), i0 = t.iniM;
      if (f != null && i0 != null) { t.dur = Math.max(0, difUtil(cal, i0, f)); t.marco = t.dur === 0; }
    }
    delete t._pred; delete t._fim;
  });
  return novas.length;
}

/* =========================== EXEMPLO =========================== */
export function exemplo(): Estado {
  const E = novoEstado();
  E.meta = {
    nome: 'Galpão Industrial - Bloco B', contrato: 'CT-2026/041', empresa: 'Construtora Alfa Ltda.',
    resp: 'João Encarregado', pmo: 'pmo@empresa.com.br',
    obs: 'Chuva forte na semana 2 atrasou a montagem dos pilares. Reforço de equipe a partir de segunda para recuperar o prazo.',
    inicio: n2iso(proxUtilRaw(hojeN() - 52)), statusDate: n2iso(hojeN()),
  };
  const def: [string, number, number, string | null][] = [
    ['Serviços preliminares', 0, 0, null], ['Mobilização e canteiro', 1, 5, ''], ['Locação da obra', 1, 2, '2'],
    ['Fundações', 0, 0, null], ['Escavação', 1, 8, '3'], ['Sapatas e blocos', 1, 12, '5'], ['Impermeabilização', 1, 4, '6'],
    ['Marco: fundações concluídas', 1, 0, '7'], ['Estrutura', 0, 0, null], ['Montagem de pilares metálicos', 1, 15, '8'],
    ['Vigas e travamentos', 1, 12, '10II+5'], ['Cobertura metálica', 1, 10, '11'], ['Fechamentos e acabamentos', 0, 0, null],
    ['Alvenaria e fechamento lateral', 1, 18, '12'], ['Instalações elétricas', 1, 14, '14II+5'], ['Piso industrial', 1, 10, '14'],
    ['Pintura', 1, 8, '16'], ['Entrega', 0, 0, null], ['Comissionamento e testes', 1, 5, '17'], ['Marco: entrega da obra', 1, 0, '19'],
  ];
  const resp = ['', 'Equipe civil', 'Topografia', '', 'Terraplenagem', 'Equipe civil', 'Impermeab.', '',
    '', 'Montadora', 'Montadora', 'Montadora', '', 'Alvenaria', 'Elétrica', 'Piso', 'Pintura', '', 'Equipe civil', ''];
  E.tarefas = def.map((d, i) => novaTarefa({ nome: d[0], nivel: d[1], dur: d[2], marco: d[2] === 0 && d[1] === 1, resp: resp[i] || '' }));
  def.forEach((d, i) => { if (d[3]) E.tarefas[i].pred = predParse(E.tarefas, d[3], i); });
  const cal = makeCal(E);
  let c = calcular(E, cal);
  const sd = hojeN();
  E.tarefas.forEach((t, i) => {
    const k = c[i]; if (k.res) return;
    let p = 0;
    if (k.fim != null && k.fim < sd) p = 100;
    else if (k.ini != null && k.ini <= sd) p = Math.round((difUtil(cal, k.ini, sd) / Math.max(1, k.dur)) * 100 * 0.62);
    if (t.marco) p = k.fim != null && k.fim < sd ? 100 : 0;
    t.pct = Math.max(0, Math.min(100, p));
  });
  c = calcular(E, cal);
  E.tarefas.forEach((t, i) => { if (c[i].ini != null) t.bl = { i: c[i].ini, f: c[i].fim }; });
  E.baseline = true;
  const cpx = curvaPrevista(E, c, cal);
  E.medicoes = [-35, -28, -21, -14, -7].map((k) => ({ d: n2iso(sd + k), p: +(pctPrevistoEm(sd + k, cpx) * 0.9).toFixed(2) }))
    .filter((m) => m.p > 0.2);
  return JSON.parse(JSON.stringify(E));
}

export { DIA, MES, n2brc };

/** Resumo do avanço físico de um cronograma (para exibir no controle AC21). */
export function resumoCrono(S: Estado | undefined): { pct: number; fim: number | null; tarefas: number } | null {
  if (!S || !S.tarefas.length) return null;
  const c = calcular(S, makeCal(S));
  const folhas = c.filter((k) => !k.res);
  const fins = folhas.map((k) => k.fim).filter((v): v is number => v != null);
  return { pct: pctRealAtual(c), fim: fins.length ? Math.max(...fins) : null, tarefas: folhas.length };
}
