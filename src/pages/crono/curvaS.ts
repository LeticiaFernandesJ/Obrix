import { DIA, MES, hojeN, n2br, n2brc, parseData } from '../../lib/dates';
import {
  type Cal, type Calc, type CurvaPrev, type Estado, type Tendencia, baixar, curvaPrevista, esc, fmtN, nomeArquivo, pctPrevistoEm,
  pctRealAtual, realEm, serieReal, tendencia,
} from '../../lib/schedule';

export interface GrafS {
  x0: number; x1: number; L: number; R: number; W: number; H: number; Tp: number; B: number;
  cp: CurvaPrev; real: { n: number; p: number }[]; tend: Tendencia | null;
}
interface Corpo { corpo: string; W: number; H: number; pv: number; rv: number; tend: Tendencia | null }

function desenhar(S: Estado, c: Calc[], cal: Cal): { corpo: string; g: GrafS; pv: number; rv: number } | null {
  const cp = curvaPrevista(S, c, cal), real = serieReal(S, c), tend = tendencia(S, c, cal, cp);
  const sd = parseData(S.meta.statusDate) ?? hojeN();
  if (!cp.dias.length) return null;
  const x0 = cp.dias[0];
  let x1 = Math.max(cp.dias[cp.dias.length - 1], sd, real.length ? real[real.length - 1].n : sd);
  if (tend && tend.fimProj) x1 = Math.max(x1, tend.fimProj);
  const W = 720, H = 290, L = 42, R = 58, Tp = 16, B = 34;
  const px = (n: number) => L + ((n - x0) / Math.max(1, x1 - x0)) * (W - L - R);
  const py = (v: number) => Tp + ((100 - v) / 100) * (H - Tp - B);
  const g: GrafS = { x0, x1, L, R, W, H, Tp, B, cp, real, tend };

  const pts: number[] = []; for (let n = x0; n <= x1; n += 7) pts.push(n);
  if (pts[pts.length - 1] !== x1) pts.push(x1);
  const ultimoPrev = cp.dias[cp.dias.length - 1];
  const ptsP = pts.filter((n) => n <= ultimoPrev);
  const dPrev = ptsP.map((n) => `${px(n)},${py(pctPrevistoEm(n, cp))}`).join(' L');
  const dReal = real.map((r) => `${px(r.n)},${py(r.p)}`).join(' L');
  const dTend = tend && tend.pontos.length > 1 ? tend.pontos.map((r) => `${px(r.n)},${py(r.v)}`).join(' L') : null;

  let gr = '';
  [0, 25, 50, 75, 100].forEach((v) => {
    gr += `<line x1="${L}" y1="${py(v)}" x2="${W - R}" y2="${py(v)}" stroke="var(--grid)" stroke-width="1"/>` +
      `<text x="${L - 8}" y="${py(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}%</text>`;
  });
  let n = x0; const seen = new Set<string>();
  while (n <= x1) {
    const d = new Date(n * DIA), key = d.getUTCFullYear() + '-' + d.getUTCMonth();
    if (!seen.has(key)) {
      seen.add(key);
      const mn = Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / DIA);
      if (mn >= x0) {
        gr += `<line x1="${px(mn)}" y1="${Tp}" x2="${px(mn)}" y2="${H - B}" stroke="var(--grid)" stroke-width="1"/>` +
          `<text x="${px(mn)}" y="${H - B + 16}" text-anchor="middle" font-size="11" fill="var(--muted)">${MES[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}</text>`;
      }
    }
    n += 7;
  }
  const pv = pctPrevistoEm(sd, cp), rv = pctRealAtual(c);
  let mk = `<line x1="${px(sd)}" y1="${Tp}" x2="${px(sd)}" y2="${H - B}" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 4"/>` +
    `<text x="${px(sd)}" y="${Tp - 4}" text-anchor="middle" font-size="10" fill="var(--muted)">${n2brc(sd)}</text>`;
  if (tend && tend.fimProj && !tend.concluida && dTend)
    mk += `<line x1="${px(tend.fimProj)}" y1="${py(100)}" x2="${px(tend.fimProj)}" y2="${H - B}" stroke="var(--series-2)" stroke-width="1" stroke-dasharray="2 3" opacity=".55"/>`;
  const dots = real.map((r) => `<circle cx="${px(r.n)}" cy="${py(r.p)}" r="4.5" fill="var(--series-2)" stroke="var(--surface-1)" stroke-width="2"/>`).join('');
  const lastP = ptsP[ptsP.length - 1], lastR = real[real.length - 1];
  let rot = `<text x="${px(lastP) + 6}" y="${py(pctPrevistoEm(lastP, cp)) - 6}" font-size="11" font-weight="600" fill="var(--series-1)">prev</text>`;
  if (dTend && tend) {
    const t = tend.pontos[tend.pontos.length - 1];
    rot += `<text x="${px(t.n) + 6}" y="${py(t.v) + 4}" font-size="11" font-weight="600" fill="var(--series-2)">tend.</text>`;
  } else if (lastR) {
    rot += `<text x="${px(lastR.n) + 7}" y="${py(lastR.p) + 4}" font-size="11" font-weight="600" fill="var(--series-2)">${Math.round(lastR.p)}%</text>`;
  }
  const corpo = `${gr}
    <path d="M${dPrev}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round"/>
    ${dTend ? `<path d="M${dTend}" fill="none" stroke="var(--series-2)" stroke-width="2" stroke-dasharray="7 5" stroke-linejoin="round" opacity=".85"/>` : ''}
    <path d="M${dReal}" fill="none" stroke="var(--series-2)" stroke-width="2" stroke-linejoin="round"/>
    ${dots}${mk}${rot}
    <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="var(--axis)" stroke-width="1"/>`;
  return { corpo, g, pv, rv };
}

export function htmlCurvaS(S: Estado, c: Calc[], cal: Cal): { html: string; g: GrafS | null } {
  const r = desenhar(S, c, cal);
  if (!r) return { html: '<div class="empty">Cadastre tarefas com duração para gerar a curva S.</div>', g: null };
  const { corpo, g, pv, rv } = r; const tend = g.tend;
  const alvo = tend && tend.fimProj && !tend.concluida
    ? `<span>Término pela tendência: <b>${n2br(tend.fimProj)}</b>` +
      `<b style="color:${tend.atraso > 0 ? 'var(--critical)' : 'var(--good)'}"> ${tend.atraso > 0 ? '+' + tend.atraso : tend.atraso} dias</b></span>` : '';
  const html = `<svg viewBox="0 0 ${g.W} ${g.H}" style="width:100%;height:auto;display:block" class="svgS">${corpo}</svg>
  <div style="display:flex;gap:18px;margin-top:10px;flex-wrap:wrap;font-size:12px;justify-content:space-between">
    <span>Previsto: <b style="font-variant-numeric:tabular-nums">${fmtN(pv, 1)}%</b></span>
    <span>Realizado: <b style="font-variant-numeric:tabular-nums">${fmtN(rv, 1)}%</b></span>
    <span style="color:${rv + 0.05 >= pv ? 'var(--good)' : 'var(--critical)'};font-weight:600">${rv >= pv ? '+' : ''}${fmtN(rv - pv, 1)} p.p.</span>
    ${alvo}
  </div>`;
  return { html, g };
}

/** Texto do tooltip ao passar o mouse sobre a curva. */
export function dicaCurva(g: GrafS, sx: number): string {
  let n = Math.round(g.x0 + ((sx - g.L) / Math.max(1, g.W - g.L - g.R)) * (g.x1 - g.x0));
  n = Math.max(g.x0, Math.min(g.x1, n));
  const pv = pctPrevistoEm(n, g.cp);
  let rv: number | null = null; g.real.forEach((p) => { if (p.n <= n) rv = p.p; });
  let tv: number | null = null; if (g.tend && g.tend.pontos) g.tend.pontos.forEach((p) => { if (p.n <= n) tv = p.v; });
  return `<b>${n2br(n)}</b><span>Previsto: <b style="color:var(--series-1)">${fmtN(pv, 1)}%</b>` +
    (rv != null ? `<br>Realizado: <b style="color:var(--series-2)">${fmtN(rv, 1)}%</b><br>${rv >= pv ? 'adiantado' : 'atrasado'} ${fmtN(Math.abs((rv as number) - pv), 1)} p.p.` : '') +
    (tv != null && rv == null ? `<br>Tendência: <b style="color:var(--series-2)">${fmtN(tv, 1)}%</b>` : '') + '</span>';
}

export function exportarCurvaPNG(S: Estado, c: Calc[], cal: Cal, avisar: (m: string) => void) {
  const r = desenhar(S, c, cal);
  if (!r) { avisar('Nada para exportar ainda.'); return; }
  const cs = getComputedStyle(document.documentElement);
  const cor = (v: string) => (cs.getPropertyValue(v) || '').trim() || '#000';
  const { corpo, g, pv, rv } = r; const tend = g.tend;
  const W = g.W, HT = 64, HB = 34, H = g.H + HT + HB;
  const sd = parseData(S.meta.statusDate) ?? hojeN();
  const leg = (x: number, txt: string, cl: string, tr?: boolean) =>
    `<line x1="${x}" y1="${H - 16}" x2="${x + 22}" y2="${H - 16}" stroke="${cl}" stroke-width="2.5"${tr ? ' stroke-dasharray="6 4"' : ''}/>` +
    `<text x="${x + 28}" y="${H - 12}" font-size="12" fill="${cor('--text-secondary')}">${txt}</text>`;
  let sub = `data de status ${n2br(sd)}  ·  previsto ${fmtN(pv, 1)}%  ·  realizado ${fmtN(rv, 1)}%`;
  if (tend && tend.fimProj && !tend.concluida) sub += `  ·  tendência de término ${n2br(tend.fimProj)}`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 2}" height="${H * 2}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${cor('--surface-1')}"/>
    <text x="14" y="26" font-family="sans-serif" font-size="16" font-weight="700" fill="${cor('--text-primary')}">${esc((S.meta.nome || 'Cronograma') + ' — Curva S')}</text>
    <text x="14" y="46" font-family="sans-serif" font-size="12" fill="${cor('--muted')}">${esc(sub)}</text>
    <g transform="translate(0,${HT})" font-family="sans-serif">${corpo}</g>
    ${leg(14, 'Previsto', cor('--series-1'))}${leg(120, 'Realizado', cor('--series-2'))}
    ${tend && !tend.concluida ? leg(232, 'Tendência', cor('--series-2'), true) : ''}
  </svg>`;
  ['--surface-1', '--grid', '--muted', '--axis', '--series-1', '--series-2', '--text-primary', '--text-secondary', '--critical', '--good']
    .forEach((v) => { svg = svg.split('var(' + v + ')').join(cor(v)); });
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2;
    const ctx = cv.getContext('2d')!; ctx.fillStyle = cor('--surface-1'); ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    cv.toBlob((b) => {
      if (!b) { avisar('Não consegui gerar a imagem.'); return; }
      baixar(nomeArquivo(S, 'png').replace(/\.png$/, '-curva-s.png'), b, 'image/png');
      avisar('Imagem da curva S baixada.');
    }, 'image/png');
  };
  img.onerror = () => avisar('Não consegui gerar a imagem neste navegador.');
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function exportarCurvaCSV(S: Estado, c: Calc[], cal: Cal, avisar: (m: string) => void) {
  const cp = curvaPrevista(S, c, cal);
  if (!cp.dias.length) { avisar('Nada para exportar ainda.'); return; }
  const serie = serieReal(S, c), tend = tendencia(S, c, cal, cp), sd = parseData(S.meta.statusDate) ?? hojeN();
  const tEm = (n: number) => {
    if (!tend || tend.pontos.length < 2) return '';
    const P = tend.pontos;
    if (n < P[0].n || n > P[P.length - 1].n) return '';
    for (let i = 0; i < P.length - 1; i++) {
      if (n >= P[i].n && n <= P[i + 1].n) {
        const dx = P[i + 1].n - P[i].n;
        return fmtN(dx === 0 ? P[i + 1].v : P[i].v + ((P[i + 1].v - P[i].v) * (n - P[i].n)) / dx, 2);
      }
    }
    return '';
  };
  let x1 = cp.dias[cp.dias.length - 1]; if (tend && tend.fimProj) x1 = Math.max(x1, tend.fimProj);
  const datas: number[] = []; for (let n = cp.dias[0]; n <= x1; n += 7) datas.push(n);
  if (!datas.includes(sd) && sd >= cp.dias[0] && sd <= x1) { datas.push(sd); datas.sort((a, b) => a - b); }
  const L = ['Semana;Data;Previsto acumulado (%);Realizado acumulado (%);Tendencia (%);Observacao'];
  let s = 1;
  datas.forEach((n) => {
    const rv = realEm(n, serie);
    L.push([s++, n2br(n), fmtN(pctPrevistoEm(n, cp), 2), n <= sd && rv != null ? fmtN(rv, 2) : '', tEm(n), n === sd ? 'data de status' : ''].join(';'));
  });
  L.push('');
  L.push(`Data de status;${n2br(sd)}`);
  L.push(`Previsto na data de status (%);${fmtN(pctPrevistoEm(sd, cp), 2)}`);
  L.push(`Realizado (%);${fmtN(pctRealAtual(c), 2)}`);
  if (tend && !tend.concluida) {
    L.push(`Indice de desempenho de prazo (IDP);${fmtN(tend.spi, 3)}`);
    L.push(`Termino previsto (linha de base/plano);${n2br(cp.dias[cp.dias.length - 1])}`);
    L.push(`Termino pela tendencia;${n2br(tend.fimProj)}`);
    L.push(`Desvio (dias uteis);${tend.atraso}`);
  }
  baixar(nomeArquivo(S, 'csv').replace(/\.csv$/, '-curva-s.csv'), '﻿' + L.join('\r\n'), 'text/csv;charset=utf-8');
  avisar('Tabela da curva S baixada.');
}

export type { Corpo };
