import { useState } from 'react';
import { CheckCircle2, FileUp, Clock, FileSpreadsheet, Pencil, Plus, ShoppingBasket, Trash2, X } from 'lucide-react';
import { useApp } from '../store/AppStore';
import { CATS_COMPRA, exportarExcelCompras, fmt, fmtData, fmtNum, type Compra } from '../lib/ac21';
import { useDialogo } from '../components/Dialogo';
import { CompraModal } from '../components/CompraModal';
import { ImportarNFeModal } from '../components/ImportarNFeModal';
import { Empty } from '../components/ui';

export const badgeCompra = (s: string) => (s === 'Pago' ? 'badge-ok' : s === 'Pendente' ? 'badge-warn' : 'badge-blue');

export default function Compras() {
  const { db, excluirCompra, toast, podeEditarArea } = useApp();
  const podeEditar = podeEditarArea('compras');
  const { confirmar } = useDialogo();
  const [f, setF] = useState({ obra: '', cat: '', status: '', ini: '', fim: '' });
  const [modal, setModal] = useState<{ c: Compra | null } | null>(null);
  const [nfe, setNfe] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const compras = db.compras.filter((c) => {
    if (f.obra && c.obraId !== Number(f.obra)) return false;
    if (f.cat && c.cat !== f.cat) return false;
    if (f.status && c.status !== f.status) return false;
    if (f.ini && c.data && c.data < f.ini) return false;
    if (f.fim && c.data && c.data > f.fim) return false;
    return true;
  });
  const totPago = compras.filter((c) => c.status === 'Pago').reduce((s, c) => s + Number(c.total || 0), 0);
  const totPend = compras.filter((c) => c.status !== 'Pago').reduce((s, c) => s + Number(c.total || 0), 0);

  return (
    <div className="content">
      <div className="action-row">
        {podeEditar && <button className="btn btn-primary" onClick={() => setModal({ c: null })}><Plus size={15} /> Registrar Compra</button>}
        {podeEditar && <button className="btn" onClick={() => setNfe(true)}><FileUp size={15} /> Importar NF-e (XML)</button>}
        <div className="spacer" />
        <button className="btn btn-success" onClick={() => exportarExcelCompras(db)}><FileSpreadsheet size={15} /> Exportar Excel</button>
      </div>

      <div className="metrics c3">
        <div className="metric">
          <div className="metric-head"><div className="metric-label">Total de Compras</div><div className="metric-icon mi-blue"><ShoppingBasket size={18} /></div></div>
          <div className="metric-value">{compras.length}</div>
        </div>
        <div className="metric">
          <div className="metric-head"><div className="metric-label">Total Pago em Compras</div><div className="metric-icon mi-green"><CheckCircle2 size={18} /></div></div>
          <div className="metric-value ok">{fmt(totPago)}</div>
        </div>
        <div className="metric">
          <div className="metric-head"><div className="metric-label">Total Pendente</div><div className="metric-icon mi-amber"><Clock size={18} /></div></div>
          <div className="metric-value warn">{fmt(totPend)}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Filtros</div>
        <div className="filter-bar">
          <div className="form-group"><label htmlFor="compras-1">Obra</label>
            <select id="compras-1" value={f.obra} onChange={(e) => set('obra', e.target.value)}>
              <option value="">Todas</option>{db.obras.map((o) => <option key={o.id} value={o.id}>{o.codigo || o.nome}</option>)}
            </select></div>
          <div className="form-group"><label htmlFor="compras-2">Categoria</label>
            <select id="compras-2" value={f.cat} onChange={(e) => set('cat', e.target.value)}>
              <option value="">Todas</option>{CATS_COMPRA.map((c) => <option key={c}>{c}</option>)}
            </select></div>
          <div className="form-group"><label htmlFor="compras-3">Status</label>
            <select id="compras-3" value={f.status} onChange={(e) => set('status', e.target.value)}>
              <option value="">Todos</option><option value="Pago">Pago</option><option value="Pendente">Pendente</option><option value="Parcial">Parcialmente pago</option>
            </select></div>
          <div className="form-group"><label htmlFor="compras-4">De</label><input id="compras-4" type="date" value={f.ini} onChange={(e) => set('ini', e.target.value)} /></div>
          <div className="form-group"><label htmlFor="compras-5">Até</label><input id="compras-5" type="date" value={f.fim} onChange={(e) => set('fim', e.target.value)} /></div>
          <button className="btn btn-ghost" onClick={() => setF({ obra: '', cat: '', status: '', ini: '', fim: '' })}><X size={14} /> Limpar</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Compras</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Descrição</th><th>Obra</th><th>Categoria</th><th>Fornecedor</th><th>NF</th><th>Data</th><th>Venc.</th>
              <th className="td-right">Qtde</th><th className="td-right">Unit.</th><th className="td-right">Total</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              {compras.length === 0 && <tr><td colSpan={12}><Empty icon={<ShoppingBasket size={28} />}>Nenhuma compra encontrada.</Empty></td></tr>}
              {compras.map((c) => {
                const obra = db.obras.find((o) => o.id === c.obraId);
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.desc}</td>
                    <td style={{ fontSize: 12 }}>{obra ? obra.codigo : '-'}</td>
                    <td><span className="badge badge-gray">{c.cat}</span></td>
                    <td style={{ fontSize: 12 }}>{c.forn}</td>
                    <td style={{ fontSize: 12 }}>{c.nf || '-'}</td>
                    <td style={{ fontSize: 12 }}>{fmtData(c.data)}</td>
                    <td style={{ fontSize: 12 }}>{fmtData(c.venc)}</td>
                    <td className="td-right">{fmtNum(c.qtde)} {c.unid}</td>
                    <td className="td-right">{fmt(c.unit)}</td>
                    <td className="td-right" style={{ fontWeight: 600 }}>{fmt(c.total)}</td>
                    <td><span className={'badge ' + badgeCompra(c.status)}>{c.status}</span></td>
                    <td><div style={{ display: 'flex', gap: 4 }}>{podeEditar && <>
                      <button className="btn btn-sm btn-icon" data-tip="Editar" aria-label="Editar" onClick={() => setModal({ c })}><Pencil size={14} /></button>
                      <button className="btn btn-sm btn-icon btn-danger" data-tip="Excluir" aria-label="Excluir" onClick={async () => {
                        if (await confirmar(`Excluir a compra "${c.desc}"?`, { confirmar: 'Excluir', perigo: true })) { excluirCompra(c.id); toast('Compra excluída.'); }
                      }}><Trash2 size={14} /></button>
                    </>}</div></td>
                  </tr>
                );
              })}
            </tbody>
            {compras.length > 0 && (
              <tfoot><tr><td colSpan={9}>TOTAL</td><td className="td-right">{fmt(compras.reduce((s, c) => s + Number(c.total || 0), 0))}</td><td colSpan={2} /></tr></tfoot>
            )}
          </table>
        </div>
      </div>
      {nfe && <ImportarNFeModal onClose={() => setNfe(false)} />}
      {modal && <CompraModal compra={modal.c} onClose={() => setModal(null)} />}
    </div>
  );
}
