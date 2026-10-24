import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, TrendingUp, Gauge, AlertTriangle, Building2 } from 'lucide-react';
import { useApp } from '../store/AppStore';
import {
  CORES, badgeStatusObra, corPct, fmt, nivelPct, pct, pctInt, rotuloNivel, totalComprometido, totalPago,
} from '../lib/ac21';
import { resumoCrono } from '../lib/schedule';
import { ChartCanvas, brMoneyTick, type TT } from '../components/ui';

const K_FILTRO = 'obrix-dash-obra';
const lerFiltro = () => { try { return sessionStorage.getItem(K_FILTRO) || 'todas'; } catch { return 'todas'; } };

export default function Dashboard() {
  const { db, cronos, setObraAtiva } = useApp();
  const [filtro, setFiltro] = useState(lerFiltro);
  // obra apagada ou inexistente: volta para "todas"
  const selecionada = filtro === 'todas' ? null : db.obras.find((o) => String(o.id) === filtro) ?? null;
  const obras = selecionada ? [selecionada] : db.obras;
  const escolher = (v: string) => { setFiltro(v); try { sessionStorage.setItem(K_FILTRO, v); } catch { /* ok */ } };
  const totalAC21 = obras.reduce((s, o) => s + Number(o.ac21), 0);
  const totPg = obras.reduce((s, o) => s + totalPago(db, o), 0);
  const totComp = obras.reduce((s, o) => s + totalComprometido(db, o), 0);
  const saldo = totalAC21 - totPg;
  const pg = pct(totPg, totalAC21), pgComp = pct(totComp, totalAC21);
  const nomes = obras.map((o) => (o.nome.length > 28 ? o.nome.substring(0, 26) + '…' : o.nome));
  const aPagar = Math.max(0, totComp - totPg), livre = Math.max(0, totalAC21 - totComp);
  const cor = (o: (typeof db.obras)[number]) => CORES[db.obras.indexOf(o) % CORES.length];

  return (
    <div className="content">
      {db.obras.length > 1 && (
        <div className="filtro-obra">
          <span className="obra-pick">
            <Building2 size={16} />
            <select aria-label="Filtrar por obra" value={selecionada ? filtro : 'todas'} onChange={(e) => escolher(e.target.value)}>
              <option value="todas">Todas as obras ({db.obras.length})</option>
              {db.obras.map((o) => <option key={o.id} value={String(o.id)}>{o.codigo ? o.codigo + ' - ' : ''}{o.nome}</option>)}
            </select>
          </span>
          {selecionada && <button className="link-btn" onClick={() => escolher('todas')}>Ver todas as obras</button>}
        </div>
      )}
      {obras.map((o) => {
        const comp = pctInt(totalComprometido(db, o), o.ac21);
        if (comp >= 100) return <div key={o.id} className="alert alert-danger"><AlertTriangle size={17} /><span>AC21 <b>{o.codigo}</b> - {o.nome}: custo comprometido <b>ESTOURADO</b> ({comp}% do AC21)</span></div>;
        if (comp >= 90) return <div key={o.id} className="alert alert-warn"><AlertTriangle size={17} /><span>AC21 <b>{o.codigo}</b> - {o.nome}: comprometido atingiu {comp}% do AC21 (atenção!)</span></div>;
        return null;
      })}

      <div className="metrics c4">
        <div className="metric">
          <div className="metric-head"><div className="metric-label">Total AC21 Aprovado</div><div className="metric-icon mi-blue"><CreditCard size={18} /></div></div>
          <div className="metric-value">{fmt(totalAC21)}</div>
          <div className="metric-sub">{selecionada ? selecionada.status : obras.length === 1 ? '1 obra ativa' : `${obras.length} obras ativas`}</div>
        </div>
        <div className="metric">
          <div className="metric-head">
            <div className="metric-label">Comprometido</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div className="metric-hint">{pgComp}% do AC21</div>
              <div className="metric-icon mi-green"><TrendingUp size={18} /></div>
            </div>
          </div>
          <div className="metric-value" style={{ color: corPct(pgComp) }}>{fmt(totComp)}</div>
          <div className="metric-sub">Orçado dos itens + compras (pagas e pendentes)</div>
          <div className="metric-bar"><div className="metric-bar-fill" style={{ width: Math.min(pgComp, 100) + '%', background: corPct(pgComp) }} /></div>
        </div>
        <div className="metric">
          <div className="metric-head"><div className="metric-label">Total Efetivamente Pago</div><div className="metric-icon mi-blue"><CreditCard size={18} /></div></div>
          <div className="metric-value">{fmt(totPg)}</div>
          <div className="metric-sub">{pg}% do AC21 pago</div>
          <div className="metric-bar"><div className="metric-bar-fill" style={{ width: Math.min(pg, 100) + '%', background: corPct(pg) }} /></div>
        </div>
        <div className="metric">
          <div className="metric-head"><div className="metric-label">Saldo (AC21 − Pago)</div><div className="metric-icon mi-amber"><Gauge size={18} /></div></div>
          <div className={'metric-value ' + (saldo < 0 ? 'danger' : '')} style={saldo < 0 ? undefined : { color: 'var(--brand)' }}>{fmt(saldo)}</div>
          <div className={'metric-sub ' + (saldo < 0 ? 'danger' : 'ok')}>{saldo < 0 ? 'Verba estourada' : 'Dentro do limite'}</div>
        </div>
      </div>

      <div className="grid2 wide">
        <div className="card">
          <div className="card-head">
            <div className="card-title">{selecionada ? 'Utilização do AC21' : 'Utilização do AC21 por Obra'}</div>
            <div className="legend-row" style={{ margin: 0 }}>
              <span><i style={{ background: 'rgba(100,120,160,.28)' }} />AC21</span>
              <span><i style={{ background: '#7aa9de' }} />Comprometido</span>
              <span><i style={{ background: '#1565C0' }} />Pago</span>
            </div>
          </div>
          {obras.length === 0 ? (
            <div className="chart-box" style={{ height: 200, display: 'grid', placeItems: 'center' }}>
              <div style={{ border: '1px solid var(--gray-border)', borderRadius: 10, padding: '16px 40px', color: 'var(--text2)', background: 'var(--surface)' }}>Nenhuma obra cadastrada.</div>
            </div>
          ) : (
            <ChartCanvas height={obras.length * 56 + 50} config={{
              type: 'bar',
              data: {
                labels: nomes,
                datasets: [
                  { label: 'AC21', data: obras.map((o) => o.ac21), backgroundColor: 'rgba(100,120,160,0.22)', borderRadius: 4 },
                  { label: 'Comprometido', data: obras.map((o) => totalComprometido(db, o)), backgroundColor: obras.map((o) => cor(o) + '99'), borderRadius: 4 },
                  { label: 'Pago', data: obras.map((o) => totalPago(db, o)), backgroundColor: obras.map((o) => cor(o)), borderRadius: 4 },
                ],
              },
              options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: TT) => ` ${c.dataset.label}: ${fmt(c.raw)}` } } },
                scales: { x: { ticks: { callback: brMoneyTick } }, y: { ticks: { font: { size: 12 } } } },
              },
            }} />
          )}
        </div>
        <div className="card">
          <div className="card-title">{selecionada ? 'Como o AC21 está sendo usado' : 'Distribuição do AC21 entre Obras'}</div>
          {selecionada ? (
            <>
              <div className="legend-row">
                <span><i style={{ background: '#1565C0' }} />Pago - {fmt(totPg)}</span>
                <span><i style={{ background: '#e8761e' }} />A pagar - {fmt(aPagar)}</span>
                <span><i style={{ background: '#1D9E75' }} />Livre - {fmt(livre)}</span>
              </div>
              <ChartCanvas height={240} config={{
                type: 'doughnut',
                data: { labels: ['Pago', 'A pagar (comprometido)', 'Livre'], datasets: [{ data: [totPg, aPagar, livre], backgroundColor: ['#1565C0', '#e8761e', '#1D9E75'], borderWidth: 2, borderColor: 'transparent' }] },
                options: { responsive: true, maintainAspectRatio: false, cutout: '64%',
                  plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: TT) => ` ${['Pago', 'A pagar (comprometido)', 'Livre'][c.dataIndex]}: ${fmt(c.raw)}` } } } },
              }} />
            </>
          ) : (<>
          {obras.length > 0 && (
            <div className="legend-row">
              {obras.map((o) => <span key={o.id}><i style={{ background: cor(o) }} />{o.codigo || o.nome} - {fmt(o.ac21)}</span>)}
            </div>
          )}
          {obras.length === 0 ? (
            <div style={{ position: 'relative', height: 250, display: 'grid', placeItems: 'center' }}>
              <div style={{ width: 230, height: 230, borderRadius: '50%', border: '32px solid var(--gray-light)', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
                <div><div style={{ fontSize: 22, fontWeight: 750 }}>R$ 0,00</div><div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>Nenhuma obra cadastrada.</div></div>
              </div>
            </div>
          ) : (
            <ChartCanvas height={240} config={{
              type: 'doughnut',
              data: { labels: nomes, datasets: [{ data: obras.map((o) => o.ac21), backgroundColor: obras.map((o) => cor(o)), borderWidth: 2, borderColor: 'transparent' }] },
              options: { responsive: true, maintainAspectRatio: false, cutout: '64%',
                plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } }, tooltip: { callbacks: { label: (c: TT) => ` ${nomes[c.dataIndex]}: ${fmt(c.raw)}` } } } },
            }} />
          )}
          </>)}
        </div>
      </div>

      <div className="card">
        <div className="card-title">{selecionada ? 'Resumo da obra' : 'Resumo Consolidado por Obra'}</div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Obra</th><th>Código</th><th>Responsável</th><th className="td-right">AC21</th><th className="td-right">Comprometido</th>
              <th className="td-right">% Comp.</th><th className="td-right">Pago</th><th>Barra</th><th>Físico</th><th>Status</th><th>Situação</th><th className="td-right">Saldo (AC21−Pago)</th>
            </tr></thead>
            <tbody>
              {obras.length === 0 && <tr><td colSpan={12} className="td-empty">Nenhuma obra cadastrada.</td></tr>}
              {obras.map((o) => {
                const pgo = totalPago(db, o), comp = totalComprometido(db, o), sl = o.ac21 - pgo, pComp = pctInt(comp, o.ac21);
                const nv = nivelPct(pComp);
                const fis = resumoCrono(cronos[String(o.id)]);
                return (
                  <tr key={o.id}>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span className="dot" style={{ background: cor(o) }} />
                      <Link to="/detalhe" onClick={() => setObraAtiva(o.id)}>{o.nome}</Link></span></td>
                    <td><code>{o.codigo}</code></td>
                    <td>{o.responsavel || '-'}</td>
                    <td className="td-right">{fmt(o.ac21)}</td>
                    <td className="td-right" style={{ fontWeight: 700, color: corPct(pComp) }}>{fmt(comp)}</td>
                    <td className="td-right" style={{ fontWeight: 700, color: corPct(pComp) }}>{pComp}%</td>
                    <td className="td-right">{fmt(pgo)}</td>
                    <td style={{ minWidth: 130 }}>
                      <div className="progress"><div className="progress-fill" style={{ width: Math.min(pComp, 100) + '%', background: corPct(pComp) }} /></div>
                    </td>
                    <td style={{ minWidth: 90, fontWeight: 600 }}>{fis ? Math.round(fis.pct) + '%' : <span style={{ color: 'var(--text3)', fontWeight: 400 }}>-</span>}</td>
                    <td><span className={'badge badge-' + (nv === 'ok' ? 'ok' : nv)}>{rotuloNivel[nv]}</span></td>
                    <td><span className={'badge ' + badgeStatusObra(o.status)}>{o.status}</span></td>
                    <td className="td-right" style={{ color: sl < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>{fmt(sl)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
