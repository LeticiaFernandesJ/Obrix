import { useRef } from 'react';
import { useApp } from '../../store/AppStore';
import { curvaPrevista, difUtil, diasTxt, fmtN, pctPrevistoEm, pctRealAtual, tendencia } from '../../lib/schedule';
import { hojeN, n2br, n2brc, parseData } from '../../lib/dates';
import { CronoHeader } from './CronoHeader';
import { dicaCurva, exportarCurvaCSV, exportarCurvaPNG, htmlCurvaS } from './curvaS';

function Kpi({ t, v, s, c }: { t: string; v: string; s?: string; c?: string }) {
  return <div className="kpi"><h3>{t}</h3><div className="v">{v}</div><div className={'s ' + (c || '')}>{s}</div></div>;
}

export default function Painel() {
  const { crono, calc, cal, toast } = useApp();
  const tip = useRef<HTMLDivElement>(null);
  const T = crono.tarefas, c = calc;
  const sd = parseData(crono.meta.statusDate) ?? hojeN();
  const cp = curvaPrevista(crono, c, cal);
  const prev = pctPrevistoEm(sd, cp), real = pctRealAtual(c);
  const tend = tendencia(crono, c, cal, cp);
  const desvio = real - prev;
  const fins = c.filter((k) => k.fim != null && !k.res).map((k) => k.fim as number);
  const fimProj = fins.length ? Math.max(...fins) : null;
  const inis = c.filter((k) => k.ini != null && !k.res).map((k) => k.ini as number);
  const iniProj = inis.length ? Math.min(...inis) : null;
  const blFim = T.filter((t) => t.bl && t.bl.f != null).map((t) => t.bl!.f as number);
  const fimBase = blFim.length ? Math.max(...blFim) : null;
  const desl = fimBase != null && fimProj != null ? fimProj - fimBase : null;
  const rows = T.map((t, i) => ({ t, i, k: c[i] }));
  const atrasadas = rows.filter((o) => o.k && !o.k.res && (+o.t.pct || 0) < 100 && o.k.fim != null && o.k.fim < sd);
  const restam = fimProj != null ? Math.max(0, difUtil(cal, sd, fimProj) - 1) : 0;
  const cls = (d: number) => (d >= -0.5 ? 'good' : d >= -5 ? 'warn' : 'bad');
  const concl = rows.filter((o) => o.k && !o.k.res && (+o.t.pct || 0) >= 100).length;
  const totalFolhas = c.filter((k) => !k.res).length;

  const { html: curvaHtml, g } = htmlCurvaS(crono, c, cal);

  const ms = rows.filter((o) => o.t.marco || (+o.t.dur === 0 && o.k && !o.k.res));
  const criticas = rows.filter((o) => o.k && !o.k.res && o.k.crit && (+o.t.pct || 0) < 100);
  const lista = [...atrasadas, ...criticas.filter((o) => !atrasadas.some((a) => a.i === o.i))].slice(0, 14);
  const fases = rows.filter((o) => o.k && o.k.res && o.t.nivel === 0);
  const prox = rows.filter((o) => o.k && !o.k.res && (+o.t.pct || 0) < 100 && o.k.ini != null && o.k.ini <= sd + 21)
    .sort((a, b) => (a.k.ini as number) - (b.k.ini as number)).slice(0, 16);

  const onMove = (e: React.MouseEvent) => {
    const sv = (e.target as HTMLElement).closest('svg.svgS') as SVGSVGElement | null; const el = tip.current;
    if (!sv || !g || !el) return;
    const r = sv.getBoundingClientRect();
    el.innerHTML = dicaCurva(g, ((e.clientX - r.left) * g.W) / r.width);
    el.style.left = Math.min(window.innerWidth - 260, e.clientX + 14) + 'px';
    el.style.top = e.clientY + 16 + 'px'; el.classList.add('on');
  };

  return (
    <div className="content">
      <CronoHeader />
      <div className="kpis">
        <Kpi t="Avanço realizado" v={fmtN(real, 1) + '%'} s={`previsto ${fmtN(prev, 1)}%`} />
        <Kpi t="Desvio de prazo" v={(desvio >= 0 ? '+' : '') + fmtN(desvio, 1) + ' p.p.'}
          s={desvio >= -0.5 ? 'em dia com o previsto' : desvio >= -5 ? 'atenção' : 'atrasado'} c={cls(desvio)} />
        <Kpi t="Término previsto" v={fimProj != null ? n2br(fimProj) : '-'}
          s={desl == null ? (iniProj != null ? 'início ' + n2br(iniProj) : '') : desl === 0 ? 'igual à linha de base' : desl > 0 ? `+${diasTxt(desl)} vs. base` : `${diasTxt(desl)} vs. base`}
          c={desl == null ? '' : desl <= 0 ? 'good' : desl <= 7 ? 'warn' : 'bad'} />
        {tend && tend.fimProj && !tend.concluida && (
          <Kpi t="Término pela tendência" v={n2br(tend.fimProj)}
            s={`IDP ${fmtN(tend.spi, 2)} · ${tend.atraso > 0 ? '+' + diasTxt(tend.atraso) + ' sobre o plano' : tend.atraso < 0 ? diasTxt(tend.atraso) : 'no plano'}`}
            c={tend.atraso <= 0 ? 'good' : tend.atraso <= 7 ? 'warn' : 'bad'} />
        )}
        <Kpi t="Tarefas atrasadas" v={String(atrasadas.length)} s={`${concl} ${concl === 1 ? 'concluída' : 'concluídas'} de ${totalFolhas}`} c={atrasadas.length ? (atrasadas.length > 3 ? 'bad' : 'warn') : 'good'} />
        <Kpi t="Dias úteis restantes" v={String(restam)} s={fimProj != null ? 'até ' + n2br(fimProj) : ''} />
      </div>

      {crono.meta.obs.trim() && (
        <div className="mini-card obs-card"><h3 style={{ fontSize: 12 }}>Observações da semana</h3><div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{crono.meta.obs}</div></div>
      )}

      <div className="grid2 wide" style={{ marginBottom: 14 }}>
        <div className="mini-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <h3 style={{ flex: 1, margin: 0 }}>Curva S: avanço acumulado (%)</h3>
            <div className="acoes-graf">
              <button className="btn" onClick={() => exportarCurvaPNG(crono, c, cal, toast)}>Imagem</button>
              <button className="btn" onClick={() => exportarCurvaCSV(crono, c, cal, toast)}>Tabela</button>
            </div>
          </div>
          <div className="legend">
            <span><i style={{ background: 'var(--series-1)' }} />Previsto</span>
            <span><i style={{ background: 'var(--series-2)' }} />Realizado</span>
            <span><i className="tracejado" />Tendência</span>
            <span><i style={{ background: 'var(--muted)', opacity: 0.5 }} />Data de status</span>
          </div>
          <div onMouseMove={onMove} onMouseLeave={() => tip.current?.classList.remove('on')} dangerouslySetInnerHTML={{ __html: curvaHtml }} />
        </div>
        <div className="mini-card">
          <h3>Marcos</h3>
          {ms.length ? (
            <table className="list"><thead><tr><th>Marco</th><th className="n">Data</th><th className="n">Situação</th></tr></thead><tbody>
              {ms.map((o) => {
                const done = (+o.t.pct || 0) >= 100, atras = !done && o.k.fim != null && (o.k.fim as number) < sd;
                const vari = o.t.bl && o.t.bl.f != null ? (o.k.fim as number) - o.t.bl.f : null;
                const cor = done ? 'var(--good)' : atras ? 'var(--critical)' : vari != null && vari > 0 ? 'var(--warning)' : 'var(--muted)';
                return (
                  <tr key={o.t.id}><td><span className="dot" style={{ background: cor, width: 8, height: 8, marginRight: 6 }} />{o.t.nome || '(sem nome)'}</td>
                    <td className="n">{n2br(o.k.fim)}</td>
                    <td className="n" style={{ color: cor, fontWeight: 600 }}>{done ? 'concluído' : atras ? 'atrasado' : vari ? (vari > 0 ? '+' + vari + 'd' : vari + 'd') : 'no prazo'}</td></tr>
                );
              })}
            </tbody></table>
          ) : <div className="empty">Nenhum marco cadastrado. Use o botão ◆ Marco.</div>}
        </div>
      </div>

      <div className="grid2 wide" style={{ marginBottom: 14 }}>
        <div className="mini-card">
          <h3>Atenção: atrasadas ou críticas</h3>
          {lista.length ? (
            <table className="list"><thead><tr><th>Tarefa</th><th className="n">Término</th><th className="n">%</th><th className="n">Situação</th></tr></thead><tbody>
              {lista.map((o) => {
                const at = (o.k.fim as number) < sd && (+o.t.pct || 0) < 100, dias = at ? difUtil(cal, o.k.fim, sd) - 1 : 0;
                return (
                  <tr key={o.t.id}><td>{o.t.nome || '-'}<br /><span style={{ color: 'var(--muted)' }}>{o.t.resp}</span></td>
                    <td className="n">{n2br(o.k.fim)}</td><td className="n">{Math.round(o.k.pct)}%</td>
                    <td className="n" style={{ color: at ? 'var(--critical)' : 'var(--warning)', fontWeight: 600 }}>{at ? diasTxt(dias) : 'caminho crítico'}</td></tr>
                );
              })}
            </tbody></table>
          ) : <div className="empty">Nada atrasado. 👍</div>}
        </div>
        <div className="mini-card">
          <h3>Avanço por fase</h3>
          {fases.length ? (
            <table className="list"><tbody>
              {fases.map((o) => (
                <tr key={o.t.id}><td style={{ width: '45%' }}><b style={{ fontWeight: 600 }}>{o.t.nome || '-'}</b><br /><span style={{ color: 'var(--muted)' }}>{n2brc(o.k.ini)} – {n2brc(o.k.fim)}</span></td>
                  <td><div className="bar-mini"><i style={{ width: Math.round(o.k.pct) + '%' }} /></div></td>
                  <td className="n" style={{ width: 44 }}>{Math.round(o.k.pct)}%</td></tr>
              ))}
            </tbody></table>
          ) : <div className="empty">Agrupe tarefas em fases (botão ⇥) para ver o avanço por fase.</div>}
        </div>
      </div>

      <div className="mini-card">
        <h3>Em execução / próximas 3 semanas</h3>
        {prox.length ? (
          <table className="list"><thead><tr><th>Tarefa</th><th>Início</th><th>Término</th><th>Dur.</th><th>%</th><th>Responsável</th></tr></thead><tbody>
            {prox.map((o) => (
              <tr key={o.t.id}><td style={{ fontWeight: 600 }}>{o.t.nome || '-'}</td><td>{n2br(o.k.ini)}</td><td>{n2br(o.k.fim)}</td><td>{o.k.dur}d</td>
                <td><span className="pill">{Math.round(o.k.pct)}%</span></td><td>{o.t.resp}</td></tr>
            ))}
          </tbody></table>
        ) : <div className="empty">Sem tarefas previstas para as próximas 3 semanas.</div>}
      </div>

      <div className="creditos">
        <span>Cronograma de Obra · desenvolvido pelo Engenheiro Joilson de Paula</span>
        <span>Painel PMO{crono.meta.nome ? ' · ' + crono.meta.nome : ''}</span>
      </div>
      <div className="tip" ref={tip} />
    </div>
  );
}
