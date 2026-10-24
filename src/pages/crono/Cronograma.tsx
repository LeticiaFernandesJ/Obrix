import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsLeft, ChevronsRight, Diamond, Pencil, Plus, Save, Trash2, BarChart3 } from 'lucide-react';
import { useApp } from '../../store/AppStore';
import {
  type CampoGrade, type Zoom, aplicarCampo, filhos, linhasVisiveis, novaTarefa, pctRealAtual, predTexto,
} from '../../lib/schedule';
import { hojeN, n2br, n2iso, parseData } from '../../lib/dates';
import { fmtN, esc } from '../../lib/schedule';
import { montarGantt } from './gantt';
import { useDialogo } from '../../components/Dialogo';
import { plural } from '../../lib/ac21';
import { CronoHeader } from './CronoHeader';
import { TarefaModal } from './TarefaModal';

interface ColDef { k: string; t: string; sub?: string; w: number; cls: string }
const COLS_BASE: ColDef[] = [
  { k: 'nome', t: 'Nome da tarefa', w: 240, cls: 'cellname' },
  { k: 'dur', t: 'Dur.', sub: 'dias úteis', w: 52, cls: 'num' },
  { k: 'ini', t: 'Início', w: 90, cls: 'dt' },
  { k: 'fim', t: 'Término', w: 90, cls: 'dt' },
  { k: 'pred', t: 'Predec.', sub: 'nº da linha', w: 68, cls: 'num' },
  { k: 'pct', t: '%', sub: 'concl.', w: 48, cls: 'num' },
  { k: 'peso', t: 'Peso', w: 46, cls: 'num' },
  { k: 'resp', t: 'Responsável', w: 104, cls: '' },
];
const COLS_REAL: ColDef[] = [
  { k: 'rIni', t: 'Início', sub: 'real', w: 78, cls: 'dt' },
  { k: 'rFim', t: 'Término', sub: 'real', w: 78, cls: 'dt' },
  { k: 'folga', t: 'Folga', sub: 'dias', w: 56, cls: 'num' },
];

/** Input que só confirma a edição ao sair do campo / Enter (equivale ao evento "change"). */
function Cell({ value, onCommit, readOnly, ...rest }: {
  value: string; onCommit: (v: string) => void; readOnly?: boolean; [k: string]: unknown;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (!readOnly && v !== value) onCommit(v); };
  return (
    <input {...rest} value={v} readOnly={readOnly}
      onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); (rest.onKeyDown as ((e: React.KeyboardEvent) => void) | undefined)?.(e); }} />
  );
}

export default function Cronograma() {
  const { crono, calc, cal, updateCrono, podeEditarArea, toast } = useApp();
  const readOnly = !podeEditarArea('cronograma');
  const { confirmar } = useDialogo();
  const [sel, setSel] = useState(0);
  const [mostrarReal, setMostrarReal] = useState(false);
  const [tm, setTm] = useState<{ indice: number | null; marco: boolean } | null>(null); // janela da tarefa
  const [larg, setLarg] = useState(778);
  const foco = useRef<{ i: number; k: string } | null>(null);
  const paneL = useRef<HTMLDivElement>(null);
  const paneR = useRef<HTMLDivElement>(null);
  const trava = useRef(false);
  const tip = useRef<HTMLDivElement>(null);

  const T = crono.tarefas;
  const CS = mostrarReal ? COLS_BASE.concat(COLS_REAL) : COLS_BASE;
  const vis = linhasVisiveis(T);
  const sd = parseData(crono.meta.statusDate) ?? hojeN();
  const selOk = Math.min(sel, Math.max(0, T.length - 1));

  const g = montarGantt(crono, calc, cal, selOk);

  /* devolve o foco ao campo editado depois de renderizar */
  useLayoutEffect(() => {
    if (!foco.current) return;
    const { i, k } = foco.current; foco.current = null;
    const el = document.querySelector<HTMLInputElement>(`#gbody [data-i="${i}"][data-k="${k}"]`);
    if (el) { el.focus(); el.select?.(); }
  });

  const sincro = (a: HTMLElement | null, b: HTMLElement | null) => {
    if (trava.current || !a || !b) return;
    trava.current = true; b.scrollTop = a.scrollTop; trava.current = false;
  };

  const edit = (i: number, k: CampoGrade, val: string) =>
    updateCrono((S, c, ca) => aplicarCampo(S, c, ca, i, k, val));

  /* ---- operações de linha ---- */
  const addTarefa = (marco: boolean) => {
    const pos = T.length ? selOk + 1 : 0;
    updateCrono((S) => {
      const t = novaTarefa({ nivel: S.tarefas[selOk] ? S.tarefas[selOk].nivel : 0 });
      if (marco) { t.dur = 0; t.marco = true; t.nome = 'Marco'; }
      S.tarefas.splice(pos, 0, t);
    });
    setSel(pos); foco.current = { i: pos, k: 'nome' };
  };
  const indentar = (d: number) => {
    updateCrono((S) => {
      const t = S.tarefas[selOk]; if (!t) return;
      const antes = S.tarefas[selOk - 1];
      if (d > 0) { if (!antes) return; t.nivel = Math.min(antes.nivel + 1, t.nivel + 1); }
      else t.nivel = Math.max(0, t.nivel - 1);
      filhos(S.tarefas, selOk).forEach((j) => { S.tarefas[j].nivel = Math.max(0, S.tarefas[j].nivel + d); });
    });
  };
  const mover = (d: number) => {
    updateCrono((S) => {
      const Tt = S.tarefas, i = selOk; if (!Tt[i]) return;
      const bloco = 1 + filhos(Tt, i).length;
      if (d < 0) { if (i === 0) return; const tr = Tt.splice(i, bloco); Tt.splice(i - 1, 0, ...tr); }
      else { if (i + bloco >= Tt.length) return; const tr = Tt.splice(i, bloco); Tt.splice(i + 1, 0, ...tr); }
    });
    const bloco = 1 + filhos(T, selOk).length;
    if (d < 0 && selOk > 0) setSel(selOk - 1);
    else if (d > 0 && selOk + bloco < T.length) setSel(selOk + 1);
  };
  const excluir = async () => {
    if (!T[selOk]) return;
    if (!(await confirmar('Excluir a linha selecionada (e suas subtarefas)?', { confirmar: 'Excluir', perigo: true }))) return;
    updateCrono((S) => {
      const bloco = 1 + filhos(S.tarefas, selOk).length;
      const ids = S.tarefas.slice(selOk, selOk + bloco).map((t) => t.id);
      S.tarefas.splice(selOk, bloco);
      S.tarefas.forEach((t) => { t.pred = (t.pred || []).filter((p) => !ids.includes(p.id)); });
    });
    setSel(Math.max(0, selOk - 1));
  };
  const linhaBase = () => {
    updateCrono((S, _c, ca) => { ca.forEach((x, i) => { if (x.ini != null) S.tarefas[i].bl = { i: x.ini, f: x.fim }; }); S.baseline = true; });
    toast('Linha de base salva. O previsto original ficou registrado.');
  };
  const medicao = () => {
    const d = crono.meta.statusDate || n2iso(hojeN()), p = pctRealAtual(calc);
    updateCrono((S) => {
      S.medicoes = (S.medicoes || []).filter((m) => m.d !== d);
      S.medicoes.push({ d, p: +p.toFixed(2) });
      S.medicoes.sort((a, b) => (a.d < b.d ? -1 : 1));
    });
    toast(`Medição registrada: ${fmtN(p, 1)}% em ${n2br(parseData(d))}`);
  };

  const onKey = (e: React.KeyboardEvent, i: number, k: string) => {
    const p = vis.indexOf(i);
    const ir = (passo: number) => {
      const j = vis[p + passo]; if (j == null) return false;
      const alvo = document.querySelector<HTMLInputElement>(`#gbody [data-i="${j}"][data-k="${k}"]`);
      if (alvo) { alvo.focus(); alvo.select?.(); } return true;
    };
    if (e.altKey && ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault(); foco.current = { i, k };
      if (e.key === 'ArrowRight') indentar(1); else if (e.key === 'ArrowLeft') indentar(-1);
      else mover(e.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (p === vis.length - 1 && !readOnly) { setTimeout(() => addTarefa(false), 0); }
      else setTimeout(() => ir(1), 0);
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); ir(1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); ir(-1); }
  };

  /* ---- dica nas barras ---- */
  const onGanttMove = (e: React.MouseEvent) => {
    const el = tip.current; if (!el) return;
    const b = (e.target as HTMLElement).closest<HTMLElement>('.bar,.ms');
    if (!b) { el.classList.remove('on'); return; }
    const i = +(b.dataset.i as string), t = T[i], k = calc[i]; if (!t || !k) return;
    el.innerHTML = `<b>${esc(t.nome || '(sem nome)')}</b><span>${n2br(k.ini)} → ${n2br(k.fim)} · ${k.dur} ${k.dur === 1 ? 'dia útil' : 'dias úteis'}<br>` +
      `avanço ${Math.round(k.pct)}%${k.res ? '' : ` · folga ${k.folga} d${k.crit ? ' · caminho crítico' : ''}`}` +
      `${t.resp ? '<br>resp.: ' + esc(t.resp) : ''}${t.bl && t.bl.i != null ? '<br>base: ' + n2br(t.bl.i) + ' → ' + n2br(t.bl.f) : ''}</span>`;
    el.style.left = Math.min(window.innerWidth - 300, e.clientX + 14) + 'px';
    el.style.top = e.clientY + 16 + 'px'; el.classList.add('on');
  };
  const onGanttClick = (e: React.MouseEvent) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]'); if (!b) return;
    const i = +(b.dataset.i as string); setSel(i);
    document.querySelector<HTMLInputElement>(`#gbody tr[data-i="${i}"] input`)?.focus();
  };

  /* ---- redimensionar painel ---- */
  const arrastar = (e: React.MouseEvent) => {
    e.preventDefault(); document.body.style.cursor = 'col-resize';
    const x0 = e.clientX, w0 = larg;
    const mv = (ev: MouseEvent) => setLarg(Math.max(220, Math.min(1100, w0 + ev.clientX - x0)));
    const up = () => { document.body.style.cursor = ''; window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };

  const ro = readOnly;
  const nLinhas = T.length, nMarcos = T.filter((t, i) => t.marco || (+t.dur === 0 && !calc[i]?.res)).length;
  const zoomNome: Record<Zoom, string> = { d: 'dia', s: 'semana', m: 'mês', q: 'trimestre' };

  return (
    <div className="content full">
      <CronoHeader />

      {!ro && (
        <div className="toolbar">
          <button className="btn" onClick={() => setTm({ indice: null, marco: false })} title="Abrir a janela para preencher a nova tarefa"><Plus size={15} /> Tarefa</button>
          <button className="btn" onClick={() => setTm({ indice: null, marco: true })} title="Inserir marco (duração 0)"><Diamond size={14} /> Marco</button>
          <button className="btn" disabled={!T[selOk]} onClick={() => setTm({ indice: selOk, marco: false })} title="Abrir os dados da linha selecionada (ou dê dois cliques no número da linha)"><Pencil size={14} /> Detalhes</button>
          <div className="sep" />
          <button className="btn btn-icon" title="Diminuir nível (Alt+←)" aria-label="Diminuir nível (Alt+←)" onClick={() => indentar(-1)}><ChevronsLeft size={15} /></button>
          <button className="btn btn-icon" title="Aumentar nível (Alt+→)" aria-label="Aumentar nível (Alt+→)" onClick={() => indentar(1)}><ChevronsRight size={15} /></button>
          <button className="btn btn-icon" title="Mover para cima (Alt+↑)" aria-label="Mover para cima (Alt+↑)" onClick={() => mover(-1)}><ArrowUp size={15} /></button>
          <button className="btn btn-icon" title="Mover para baixo (Alt+↓)" aria-label="Mover para baixo (Alt+↓)" onClick={() => mover(1)}><ArrowDown size={15} /></button>
          <button className="btn btn-icon" title="Excluir linha" aria-label="Excluir linha" onClick={excluir}><Trash2 size={15} /></button>
          <div className="sep" />
          <label>Zoom
            <select value={crono.zoom} onChange={(e) => updateCrono((S) => { S.zoom = e.target.value as Zoom; })}>
              <option value="d">Dia</option><option value="s">Semana</option><option value="m">Mês</option><option value="q">Trimestre</option>
            </select></label>
          <label>Data de status
            <input type="date" aria-label="Data de status" value={crono.meta.statusDate || ''} onChange={(e) => updateCrono((S) => { S.meta.statusDate = e.target.value || n2iso(hojeN()); })} /></label>
          <div className="sep" />
          <button className="btn" title="Congela as datas atuais como previsto" aria-label="Congela as datas atuais como previsto" onClick={linhaBase}><Save size={14} /> Salvar linha de base</button>
          <button className="btn" title="Registra o avanço de hoje na curva S" aria-label="Registra o avanço de hoje na curva S" onClick={medicao}><BarChart3 size={14} /> Registrar medição</button>
          <div className="spacer" />
          <label><input type="checkbox" checked={mostrarReal} onChange={(e) => setMostrarReal(e.target.checked)} /> colunas de realizado</label>
        </div>
      )}

      <div className="crono-card">
        <div className="crono-card-head">
          <h3>Cronograma</h3>
          <span className="sub">{plural(nLinhas, 'linha', 'linhas')} · {plural(nMarcos, 'marco', 'marcos')} · zoom por {zoomNome[crono.zoom]}</span>
          <div className="spacer" />
          <div className="legend" style={{ margin: 0 }}>
            <span><i style={{ background: 'var(--bar-sum)' }} />Fase</span>
            <span><i style={{ background: 'var(--series-3)' }} />Concluída</span>
            <span><i style={{ background: 'var(--bar)' }} />Em execução</span>
            <span><i style={{ background: 'var(--series-2)' }} />Crítica</span>
          </div>
        </div>
        <div className="split-wrap">
          <div className="split" style={{ width: '100%' }}>
            <div className="pane left" ref={paneL} style={{ width: larg }} onScroll={() => sincro(paneL.current, paneR.current)}>
              <table className="grid">
                <thead><tr>
                  <th className="rownum" style={{ minWidth: 34 }}>#</th>
                  {CS.map((c) => (
                    <th key={c.k} style={{ minWidth: c.w, width: c.w }}>{c.t}{c.sub && <><br /><span style={{ fontWeight: 400 }}>{c.sub}</span></>}</th>
                  ))}
                </tr></thead>
                <tbody id="gbody">
                  {T.length === 0 && (
                    <tr><td colSpan={CS.length + 1} className="td-empty" style={{ height: 80 }}>
                      Nenhuma tarefa ainda. Clique em <b>+ Tarefa</b>, use <b>Importar</b> para colar do Excel ou clique em <b>Abrir</b> para carregar um arquivo.</td></tr>
                  )}
                  {vis.map((i) => {
                    const t = T[i], k = calc[i]; if (!k) return null;
                    const res = k.res;
                    return (
                      <tr key={t.id} data-i={i} className={(res ? 'summary ' : '') + (k.crit && !res ? 'crit ' : '') + (i === selOk ? 'sel' : '')}
                        onFocus={() => setSel(i)}>
                        <td className="rownum" onClick={() => setSel(i)} onDoubleClick={() => { if (!ro) setTm({ indice: i, marco: false }); }} title={ro ? undefined : 'Dois cliques abrem os dados da tarefa'}>{i + 1}</td>
                        {CS.map((col) => {
                          const cl = col.cls;
                          const base = { 'data-i': i, 'data-k': col.k, 'aria-label': `${col.t}${col.sub ? ' (' + col.sub + ')' : ''}, linha ${i + 1}`, onKeyDown: (e: React.KeyboardEvent) => onKey(e, i, col.k) };
                          if (col.k === 'nome') {
                            let flag: React.ReactNode = null;
                            if (!res) {
                              if ((+t.pct || 0) >= 100) flag = <span className="flag done">ok</span>;
                              else if (k.fim != null && k.fim < sd) flag = <span className="flag late">atrasada</span>;
                            }
                            return (
                              <td key={col.k} className="cellname"><div className="inner">
                                <span style={{ width: t.nivel * 15, flex: '0 0 auto' }} />
                                {res ? <button className="twist" onClick={() => updateCrono((S) => { S.tarefas[i].fechado = !S.tarefas[i].fechado; })}>{t.fechado ? '▶' : '▼'}</button> : <span className="twist" />}
                                <Cell {...base} value={t.nome} readOnly={ro} placeholder={res ? '' : 'descreva o serviço'} onCommit={(v) => edit(i, 'nome', v)} />
                                {flag}
                              </div></td>
                            );
                          }
                          if (col.k === 'dur') return <td key={col.k} className={cl}><Cell {...base} value={String(res ? k.dur || 0 : t.marco ? 0 : t.dur)} readOnly={ro || res} onCommit={(v) => edit(i, 'dur', v)} /></td>;
                          if (col.k === 'ini' || col.k === 'fim') {
                            const v = col.k === 'ini' ? k.ini : k.fim; const fixa = col.k === 'ini' && t.iniM != null;
                            return <td key={col.k} className={cl}><Cell {...base} value={n2br(v)} readOnly={ro || res} placeholder="dd/mm/aaaa" style={fixa ? { color: 'var(--accent)', fontWeight: 600 } : undefined} onCommit={(x) => edit(i, col.k as CampoGrade, x)} /></td>;
                          }
                          if (col.k === 'pred') return <td key={col.k} className={cl}><Cell {...base} value={res ? '' : predTexto(T, t)} readOnly={ro || res} title="ex.: 5  |  5TI+2  |  4;7II" onCommit={(v) => edit(i, 'pred', v)} /></td>;
                          if (col.k === 'pct') {
                            const p = Math.round(k.pct || 0);
                            return <td key={col.k} className={cl}><div className="pct-wrap"><div className="pct-bar" style={{ width: p + '%' }} /><Cell {...base} value={String(p)} readOnly={ro || res} onCommit={(v) => edit(i, 'pct', v)} /></div></td>;
                          }
                          if (col.k === 'peso') return <td key={col.k} className={cl}><Cell {...base} value={res ? fmtN(k.peso, 1) : String(t.peso ?? '')} readOnly={ro || res} placeholder={res ? '' : String(Math.max(0, +t.dur || 0))} onCommit={(v) => edit(i, 'peso', v)} /></td>;
                          if (col.k === 'folga') return <td key={col.k} className={cl}><input readOnly value={res ? '' : String(k.folga ?? '')} style={k.crit && !res ? { color: 'var(--critical)', fontWeight: 600 } : undefined} /></td>;
                          if (col.k === 'rIni' || col.k === 'rFim') return <td key={col.k} className={cl}><Cell {...base} value={n2br(t[col.k])} readOnly={ro || res} placeholder="dd/mm" onCommit={(v) => edit(i, col.k as CampoGrade, v)} /></td>;
                          return <td key={col.k} className={cl}><Cell {...base} value={t.resp || ''} readOnly={ro || res} onCommit={(v) => edit(i, 'resp', v)} /></td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="dragbar" onMouseDown={arrastar} />
            <div className="pane right" ref={paneR} onScroll={() => sincro(paneR.current, paneL.current)}>
              <div className="tl" style={{ width: g.largura }}>
                <div className="tlhead" style={{ width: g.largura }} dangerouslySetInnerHTML={{ __html: g.head }} />
                <div className="tlbody" style={{ width: g.largura, height: g.altura }}
                  onMouseMove={onGanttMove} onMouseLeave={() => tip.current?.classList.remove('on')} onClick={onGanttClick}
                  dangerouslySetInnerHTML={{ __html: g.body }} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="creditos">
        <span>Cronograma de Obra · desenvolvido pelo Engenheiro <b>Joilson de Paula</b></span>
        <span>{nLinhas} tarefas / fases{crono.baseline ? ' · linha de base salva' : ''}</span>
      </div>
      <div className="tip" ref={tip} />
      {tm && !ro && <TarefaModal indice={tm.indice} marcoInicial={tm.marco} selecionada={selOk} onClose={() => setTm(null)} onSalvo={(l) => setSel(l)} />}
    </div>
  );
}
