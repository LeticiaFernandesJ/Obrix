import { DIA, MES, MESL, dow, hojeN, n2brc, parseData } from '../../lib/dates';
import { type Cal, type Calc, type Estado, ehUtil, esc, linhasVisiveis } from '../../lib/schedule';

export const PX = { d: 26, s: 6.6, m: 2.5, q: 1.0 } as const;

export interface GanttOut { head: string; body: string; largura: number; altura: number }

/** Gera o HTML do cabeçalho e do corpo do Gantt (mesmo desenho do arquivo original). */
export function montarGantt(S: Estado, c: Calc[], cal: Cal, sel: number): GanttOut {
  const PXD: number = PX[S.zoom] || 6.6;
  /* faixa de tempo */
  let a: number | null = null, b: number | null = null;
  c.forEach((x) => {
    if (x.ini != null && (a == null || x.ini < a)) a = x.ini;
    if (x.fim != null && (b == null || x.fim > b)) b = x.fim;
  });
  const hoje = hojeN(); const sd = parseData(S.meta.statusDate);
  [hoje, sd].forEach((v) => { if (v != null) { if (a == null || v < a) a = v; if (b == null || v > b) b = v; } });
  if (a == null) { a = hoje; b = a + 30; }
  const pad = PXD > 15 ? 3 : PXD > 4 ? 7 : 20;
  let T0 = (a as number) - pad; const T1 = (b as number) + pad;
  while (dow(T0) !== 1) T0--;
  const x = (n: number) => (n - T0) * PXD;
  const largura = Math.max(300, (T1 - T0 + 1) * PXD);

  /* cabeçalho */
  let h = '';
  if (S.zoom === 'd' || S.zoom === 's') {
    let n = T0;
    while (n <= T1) {
      const d = new Date(n * DIA), y = d.getUTCFullYear(), m = d.getUTCMonth();
      let e = n; while (e <= T1) { const dd = new Date(e * DIA); if (dd.getUTCMonth() !== m) break; e++; }
      h += `<div class="m" style="left:${x(n)}px;width:${(e - n) * PXD}px">${MESL[m]} ${y}</div>`; n = e;
    }
    if (S.zoom === 'd') {
      for (let k = T0; k <= T1; k++) {
        const we = !ehUtil(cal, k);
        h += `<div class="d${we ? ' we' : ''}" style="left:${x(k)}px;width:${PXD}px">${new Date(k * DIA).getUTCDate()}</div>`;
      }
    } else {
      for (let k = T0; k <= T1; k += 7) h += `<div class="d" style="left:${x(k)}px;width:${7 * PXD}px">${n2brc(k)}</div>`;
    }
  } else {
    let n = T0;
    while (n <= T1) {
      const y = new Date(n * DIA).getUTCFullYear();
      let e = n; while (e <= T1 && new Date(e * DIA).getUTCFullYear() === y) e++;
      h += `<div class="m" style="left:${x(n)}px;width:${(e - n) * PXD}px">${y}</div>`; n = e;
    }
    n = T0;
    while (n <= T1) {
      const d = new Date(n * DIA), m = d.getUTCMonth(), y = d.getUTCFullYear();
      const passo = S.zoom === 'm' ? 1 : 3, m0 = S.zoom === 'm' ? m : Math.floor(m / 3) * 3;
      const ini = Math.round(Date.UTC(y, m0, 1) / DIA), fim = Math.round(Date.UTC(y, m0 + passo, 1) / DIA) - 1;
      const lbl = S.zoom === 'm' ? MES[m0] : 'T' + (m0 / 3 + 1);
      h += `<div class="d" style="left:${x(Math.max(ini, T0))}px;width:${(Math.min(fim, T1) - Math.max(ini, T0) + 1) * PXD}px">${lbl}</div>`;
      n = fim + 1;
    }
  }

  /* corpo */
  const vis = linhasVisiveis(S.tarefas);
  let fundo = '';
  if (S.zoom === 'd' || S.zoom === 's') {
    for (let k = T0; k <= T1; k++) if (!ehUtil(cal, k)) fundo += `<div class="bg-we" style="left:${x(k)}px;width:${PXD}px"></div>`;
  }
  for (let k = T0; k <= T1; k++) {
    if (new Date(k * DIA).getUTCDate() === 1) fundo += `<div class="bg-line" style="left:${x(k)}px"></div>`;
  }

  const pos: Record<number, { L: number; W: number; r: number }> = {};
  let rows = '';
  vis.forEach((i, r) => {
    const t = S.tarefas[i], k = c[i];
    let inner = '';
    if (k && k.ini != null && k.fim != null) {
      const L = x(k.ini), W = Math.max(4, (k.fim - k.ini + 1) * PXD);
      pos[i] = { L, W, r };
      if (t.bl && t.bl.i != null && t.bl.f != null)
        inner += `<div class="blbar" style="left:${x(t.bl.i)}px;width:${Math.max(3, (t.bl.f - t.bl.i + 1) * PXD)}px" title="linha de base"></div>`;
      if (k.res) {
        inner += `<div class="bar sum" data-i="${i}" style="left:${L}px;width:${W}px"></div>`;
      } else if (t.marco || k.dur === 0) {
        inner += `<div class="ms ${k.crit ? 'crit' : ''} ${+t.pct >= 100 ? 'done' : ''}" data-i="${i}" style="left:${L - 6}px"></div>`;
        inner += `<span class="barlbl" style="left:${L + 12}px">${esc(t.nome)}</span>`;
      } else {
        const p = Math.max(0, Math.min(100, +t.pct || 0));
        inner += `<div class="bar ${+t.pct >= 100 ? 'done' : k.crit ? 'crit' : ''}" data-i="${i}" style="left:${L}px;width:${W}px"><div class="prog" style="width:${p}%"></div></div>`;
        if (PXD > 3) inner += `<span class="barlbl" style="left:${L + W + 6}px">${p > 0 ? p + '%' : ''} ${esc(t.resp || '')}</span>`;
      }
    }
    rows += `<div class="tlrow ${i === sel ? 'sel' : ''}" data-i="${i}">${inner}</div>`;
  });

  /* setas de dependência */
  const ix: Record<string, number> = {}; S.tarefas.forEach((t, i) => { ix[t.id] = i; });
  let sv = '';
  vis.forEach((i) => {
    const t = S.tarefas[i], k = c[i]; if (!pos[i]) return;
    (t.pred || []).forEach((p) => {
      const j = ix[p.id]; if (j == null || !pos[j]) return;
      const A = pos[j], B = pos[i], RH = 30;
      const ay = A.r * RH + 15, by = B.r * RH + 15;
      const ax = p.tipo === 'II' || p.tipo === 'IT' ? A.L : A.L + A.W;
      const bx = p.tipo === 'TT' || p.tipo === 'IT' ? B.L + B.W : B.L;
      const cr = k && k.crit && c[j] && c[j].crit ? ' crit' : '';
      const mm = bx - 8;
      const d = bx > ax + 10
        ? `M${ax},${ay} H${Math.max(ax + 6, mm)} V${by} H${bx}`
        : `M${ax},${ay} h6 V${ay + (by > ay ? 16 : -16)} H${bx - 10} V${by} H${bx}`;
      const col = cr ? 'var(--critical)' : 'var(--text3)';
      sv += `<path class="${cr}" d="${d}"/><path d="M${bx},${by} l-5,-3.5 v7 z" style="fill:${col};stroke:none"/>`;
    });
  });

  let marc = '';
  if (hoje >= T0 && hoje <= T1) marc += `<div class="today" style="left:${x(hoje)}px"><b>Hoje</b></div>`;
  if (sd != null && sd !== hoje && sd >= T0 && sd <= T1)
    marc += `<div class="today" style="left:${x(sd)}px;background:var(--text3)"><b style="background:var(--text3)">status</b></div>`;

  const altura = vis.length * 30;
  const body = fundo + rows + marc +
    `<svg class="links" style="width:${largura}px;height:${altura}px">${sv}</svg>`;
  return { head: h, body, largura, altura };
}
