import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CalendarDays, Check, CheckCircle2, Pencil, Wallet } from 'lucide-react';
import { useApp } from '../store/AppStore';
import { ChartCanvas, Empty, brMoneyTick, type TT } from '../components/ui';
import { CompraModal } from '../components/CompraModal';
import { fmt, fmtData, hojeISO, type Compra } from '../lib/ac21';
import { contasAbertas, fluxoMensal, resumoFinanceiro, situacaoConta, textoSituacao, type TipoSituacao } from '../lib/financeiro';

const classeSituacao: Record<TipoSituacao, string> = {
  paga: 'badge-ok', vencida: 'badge-danger', hoje: 'badge-warn', proxima: 'badge-warn', futura: 'badge-blue', sem_venc: 'badge-gray',
};

export default function Financeiro() {
  const { db, salvarCompra, toast, podeEditarArea } = useApp();
  const podeEditar = podeEditarArea('compras');
  const [obra, setObra] = useState('');
  const [edicao, setEdicao] = useState<Compra | null>(null);
  const hoje = hojeISO();

  const compras = useMemo(() => db.compras.filter((c) => !obra || c.obraId === Number(obra)), [db.compras, obra]);
  const r = useMemo(() => resumoFinanceiro(compras, hoje), [compras, hoje]);
  const fluxo = useMemo(() => fluxoMensal(compras, hoje), [compras, hoje]);
  const abertas = useMemo(() => contasAbertas(compras), [compras]);

  const pagar = (c: Compra) => {
    const { id, ...resto } = c;
    salvarCompra({ ...resto, status: 'Pago' }, id);
    toast('Conta marcada como paga.');
  };

  return (
    <div className="content">
      <div className="action-row">
        <div className="form-group" style={{ minWidth: 240 }}>
          <label htmlFor="fin-obra">Obra</label>
          <select id="fin-obra" value={obra} onChange={(e) => setObra(e.target.value)}>
            <option value="">Todas as obras</option>
            {db.obras.map((o) => <option key={o.id} value={o.id}>{o.codigo ? o.codigo + ' - ' : ''}{o.nome}</option>)}
          </select>
        </div>
      </div>

      {r.vencidas.n > 0 && (
        <div className="alert alert-danger"><AlertTriangle size={17} /><span>Você tem <b>{r.vencidas.n === 1 ? '1 conta vencida' : `${r.vencidas.n} contas vencidas`}</b> somando <b>{fmt(r.vencidas.valor)}</b>.</span></div>
      )}

      <div className="metrics c4">
        <div className="metric">
          <div className="metric-head"><div className="metric-label">Vencidas</div><div className="metric-icon mi-red"><AlertTriangle size={18} /></div></div>
          <div className={'metric-value ' + (r.vencidas.n ? 'danger' : '')}>{fmt(r.vencidas.valor)}</div>
          <div className="metric-sub">{r.vencidas.n === 1 ? '1 conta' : `${r.vencidas.n} contas`}</div>
        </div>
        <div className="metric">
          <div className="metric-head"><div className="metric-label">Vencem em 7 dias</div><div className="metric-icon mi-amber"><CalendarClock size={18} /></div></div>
          <div className="metric-value warn">{fmt(r.proximos7.valor)}</div>
          <div className="metric-sub">{r.proximos7.n === 1 ? '1 conta' : `${r.proximos7.n} contas`}, inclui as de hoje</div>
        </div>
        <div className="metric">
          <div className="metric-head"><div className="metric-label">A pagar em 30 dias</div><div className="metric-icon mi-blue"><CalendarDays size={18} /></div></div>
          <div className="metric-value">{fmt(r.proximos30.valor)}</div>
          <div className="metric-sub">Total em aberto: {fmt(r.aPagar.valor)}</div>
        </div>
        <div className="metric">
          <div className="metric-head"><div className="metric-label">Pago neste mês</div><div className="metric-icon mi-green"><CheckCircle2 size={18} /></div></div>
          <div className="metric-value ok">{fmt(r.pagoNoMes.valor)}</div>
          <div className="metric-sub">{r.pagoNoMes.n === 1 ? '1 compra paga' : `${r.pagoNoMes.n} compras pagas`}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div className="card-title">Fluxo de caixa mês a mês</div>
          <div className="legend-row" style={{ margin: 0 }}><span><i style={{ background: '#e0a03a' }} />A pagar (por vencimento)</span><span><i style={{ background: '#1D9E75' }} />Pago</span></div>
        </div>
        <ChartCanvas height={260} config={{
          type: 'bar',
          data: {
            labels: fluxo.map((m) => m.rotulo),
            datasets: [
              { label: 'A pagar', data: fluxo.map((m) => m.aPagar), backgroundColor: '#e0a03a', borderRadius: 5 },
              { label: 'Pago', data: fluxo.map((m) => m.pago), backgroundColor: '#1D9E75', borderRadius: 5 },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: TT) => ` ${c.dataset.label}: ${fmt(c.raw)}` } } },
            scales: { y: { ticks: { callback: brMoneyTick } } },
          },
        }} />
        {r.semVencimento.n > 0 && <div className="note" style={{ marginBottom: 0 }}>{r.semVencimento.n === 1 ? '1 conta em aberto está' : `${r.semVencimento.n} contas em aberto estão`} sem data de vencimento ({fmt(r.semVencimento.valor)}) e não entra{r.semVencimento.n === 1 ? '' : 'm'} no gráfico.</div>}
      </div>

      <div className="card">
        <div className="card-title">Contas a pagar</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Vencimento</th><th>Situação</th><th>Descrição</th><th>Obra</th><th>Fornecedor</th><th>NF</th><th className="td-right">Valor</th><th className="td-center">Ações</th></tr></thead>
            <tbody>
              {abertas.length === 0 && <tr><td colSpan={8}><Empty icon={<Wallet size={28} />}>Nenhuma conta em aberto.</Empty></td></tr>}
              {abertas.map((c) => {
                const s = situacaoConta(c, hoje);
                const o = db.obras.find((x) => x.id === c.obraId);
                return (
                  <tr key={c.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtData(c.venc)}</td>
                    <td><span className={'badge ' + classeSituacao[s.tipo]}>{textoSituacao(s)}</span></td>
                    <td style={{ fontWeight: 500 }}>{c.desc}</td>
                    <td style={{ fontSize: 12 }}>{o ? o.codigo || o.nome : '-'}</td>
                    <td style={{ fontSize: 12 }}>{c.forn}</td>
                    <td style={{ fontSize: 12 }}>{c.nf || '-'}</td>
                    <td className="td-right" style={{ fontWeight: 600 }}>{fmt(c.total)}</td>
                    <td className="td-center">{podeEditar && (
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button className="btn btn-sm btn-success" onClick={() => pagar(c)}><Check size={13} /> Pago</button>
                        <button className="btn btn-sm btn-icon" aria-label="Editar" data-tip="Editar" onClick={() => setEdicao(c)}><Pencil size={14} /></button>
                      </div>
                    )}</td>
                  </tr>
                );
              })}
            </tbody>
            {abertas.length > 0 && <tfoot><tr><td colSpan={6}>TOTAL EM ABERTO</td><td className="td-right">{fmt(abertas.reduce((s, c) => s + Number(c.total || 0), 0))}</td><td /></tr></tfoot>}
          </table>
        </div>
      </div>
      {edicao && <CompraModal compra={edicao} onClose={() => setEdicao(null)} />}
    </div>
  );
}
