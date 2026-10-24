import { useState } from 'react';
import {
  Activity, BarChart2, Check, CheckCircle2, ClipboardCheck, ClipboardList, CreditCard, FileSpreadsheet, Pencil, Plus,
  Search, ShoppingBasket, Trash2, X, AlertTriangle,
} from 'lucide-react';
import { useApp } from '../store/AppStore';
import {
  CATS_ITEM, CORES, badgeStatusObra, corPct, exportarExcelObra, fmt, fmtData, fmtNum, nivelPct, pct, pctInt, rotuloNivel,
  totalComprasTodas, totalComprometido, totalCompras, totalPago, type Item, type Obra, type TipoItem,
} from '../lib/ac21';
import { ChartCanvas, Empty, Modal, Progress, brMoneyTick, type TT, CampoDinheiro } from '../components/ui';
import { useDialogo } from '../components/Dialogo';
import { CompraModal } from '../components/CompraModal';
import { badgeCompra } from './Compras';
import { Link } from 'react-router-dom';
import { type Nivel, calcularEVM, curvaFinanceira } from '../lib/evm';
import { fmtN } from '../lib/schedule';
import { n2br } from '../lib/dates';
import type { Compra } from '../lib/ac21';

const corEvm: Record<Nivel, string> = { bom: 'var(--green)', atencao: 'var(--amber)', critico: 'var(--red)', indef: 'var(--text3)' };
const classeEvm: Record<Nivel, string> = { bom: 'badge-ok', atencao: 'badge-warn', critico: 'badge-danger', indef: 'badge-gray' };
const rotuloEvm: Record<Nivel, string> = { bom: 'No ritmo', atencao: 'Atenção', critico: 'Crítico', indef: 'Sem dados' };
type Aba = 'itens' | 'graficos' | 'desempenho' | 'compras';

function ItemModal({ obra, item, onClose }: { obra: Obra; item: Item | null; onClose: () => void }) {
  const { salvarItem, toast } = useApp();
  const [f, setF] = useState({
    desc: item?.desc ?? '', cat: item?.cat ?? 'Construtora', tipo: (item?.tipo ?? 'orcado') as TipoItem,
    orcado: item?.orcado ? String(item.orcado) : '', pago: item?.pago ? String(item.pago) : '',
    forn: item?.forn ?? '', nf: item?.nf ?? '', data: item?.data ?? '', obs: item?.obs ?? '',
  });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const salvar = () => {
    if (!f.desc.trim()) { toast('Informe a descrição do item.'); return; }
    if ((parseFloat(f.orcado) || 0) < 0 || (parseFloat(f.pago) || 0) < 0) { toast('Os valores não podem ser negativos.'); return; }
    salvarItem(obra.id, {
      desc: f.desc.trim(), cat: f.cat, tipo: f.tipo, orcado: parseFloat(f.orcado) || 0, pago: parseFloat(f.pago) || 0,
      forn: f.forn.trim(), nf: f.nf.trim(), data: f.data, obs: f.obs.trim(),
    }, item?.id ?? null);
    toast(item ? 'Item atualizado.' : 'Item adicionado.');
    onClose();
  };
  return (
    <Modal title={item ? 'Editar Item' : 'Adicionar Item'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" onClick={salvar}><Check size={15} /> Salvar Item</button>
    </>}>
      <div className="form-grid">
        <div className="form-group form-full"><label htmlFor="detalhe-1">Descrição *</label><input id="detalhe-1" value={f.desc} onChange={(e) => set('desc', e.target.value)} placeholder="Ex: Alvenaria bloco cerâmico 14x19x29" /></div>
        <div className="form-group"><label htmlFor="detalhe-2">Categoria</label><select id="detalhe-2" value={f.cat} onChange={(e) => set('cat', e.target.value)}>{CATS_ITEM.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="form-group"><label htmlFor="detalhe-3">Tipo de Item</label><select id="detalhe-3" value={f.tipo} onChange={(e) => set('tipo', e.target.value)}><option value="orcado">Orçado</option><option value="nao_orcado">Não Orçado</option></select></div>
        <div className="form-group"><label htmlFor="detalhe-4">Valor Orçado (R$)</label><CampoDinheiro id="detalhe-4" value={f.orcado} onChange={(v) => set('orcado', v)} /></div>
        <div className="form-group"><label htmlFor="detalhe-5">Valor Pago (R$)</label><CampoDinheiro id="detalhe-5" value={f.pago} onChange={(v) => set('pago', v)} /></div>
        <div className="form-group"><label htmlFor="detalhe-6">Fornecedor</label><input id="detalhe-6" value={f.forn} onChange={(e) => set('forn', e.target.value)} placeholder="Nome do fornecedor" /></div>
        <div className="form-group"><label htmlFor="detalhe-7">Nº NF / Pedido</label><input id="detalhe-7" value={f.nf} onChange={(e) => set('nf', e.target.value)} placeholder="Ex: NF-2025-0042" /></div>
        <div className="form-group"><label htmlFor="detalhe-8">Data do Pagamento</label><input id="detalhe-8" type="date" value={f.data} onChange={(e) => set('data', e.target.value)} /></div>
        <div className="form-group form-full"><label htmlFor="detalhe-9">Observações</label><textarea id="detalhe-9" value={f.obs} onChange={(e) => set('obs', e.target.value)} placeholder="Notas sobre este item..." /></div>
      </div>
    </Modal>
  );
}

export default function Detalhe() {
  const { db, cronos, obraAtivaId, setObraAtiva, excluirItem, excluirCompra, toast, podeEditar } = useApp();
  const { confirmar } = useDialogo();
  const [aba, setAba] = useState<Aba>('itens');
  const [f, setF] = useState({ cat: '', tipo: '', forn: '', ini: '', fim: '' });
  const [itemModal, setItemModal] = useState<{ item: Item | null } | null>(null);
  const [compraModal, setCompraModal] = useState<{ c: Compra | null } | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const oIdx = Math.max(0, db.obras.findIndex((o) => o.id === obraAtivaId));
  const o = db.obras[oIdx];

  if (!o) {
    return <div className="content"><div className="card"><Empty icon={<ClipboardList size={30} />}>Nenhuma obra cadastrada.</Empty></div></div>;
  }

  const pg = totalPago(db, o), p = pctInt(pg, o.ac21);
  const pgCompras = totalCompras(db, o);
  const comp = totalComprometido(db, o), pComp = pctInt(comp, o.ac21);
  const sl = o.ac21 - pg;
  const comprasObra = db.compras.filter((c) => c.obraId === o.id);
  const nv = nivelPct(p);

  const itens = o.itens.filter((i) => {
    if (f.cat && i.cat !== f.cat) return false;
    if (f.tipo && i.tipo !== f.tipo) return false;
    if (f.forn && !i.forn?.toLowerCase().includes(f.forn.toLowerCase())) return false;
    if (f.ini && i.data && i.data < f.ini) return false;
    if (f.fim && i.data && i.data > f.fim) return false;
    return true;
  });

  const cats = [...new Set(o.itens.map((i) => i.cat))];
  const catData = cats.map((c) => ({
    cat: c,
    orc: o.itens.filter((i) => i.cat === c).reduce((s, i) => s + Number(i.orcado || 0), 0),
    pago: o.itens.filter((i) => i.cat === c).reduce((s, i) => s + Number(i.pago || 0), 0),
    comp: 0,
  }));
  catData.forEach((c) => { c.comp = c.pago; });
  if (totalComprasTodas(db, o) > 0) catData.push({ cat: 'Compras (Mat.)', orc: 0, pago: pgCompras, comp: totalComprasTodas(db, o) });
  const catColors = catData.map((_, i) => CORES[i % CORES.length]);
  const crono = cronos[String(o.id)];
  const evm = aba === 'desempenho' ? calcularEVM(o, db, crono) : null;
  const curvaFin = aba === 'desempenho' && crono && evm ? curvaFinanceira(o, db, crono) : null;

  return (
    <div className="content">
      <div className="card obra-head-card">
        <div className="obra-head">
          <div>
            <div className="obra-title">
              <span className="dot" style={{ background: CORES[oIdx % CORES.length], width: 12, height: 12 }} />
              <h2>{o.nome}</h2>
              <span className={'badge badge-' + (nv === 'ok' ? 'ok' : nv)}>{rotuloNivel[nv]}</span>
              <span className={'badge ' + badgeStatusObra(o.status)}>{o.status}</span>
            </div>
            <div className="sub-line" style={{ marginTop: 6 }}>{o.codigo} · {o.local} · Resp.: {o.responsavel || '-'} · {fmtData(o.inicio)} → {fmtData(o.fim)}</div>
            {o.obs && <div className="sub-line" style={{ marginTop: 4, fontStyle: 'italic', color: 'var(--text3)' }}>{o.obs}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select style={{ width: 'auto', minWidth: 190 }} value={o.id} onChange={(e) => { setObraAtiva(Number(e.target.value)); }}>
              {db.obras.map((ob) => <option key={ob.id} value={ob.id}>{ob.codigo} - {ob.nome}</option>)}
            </select>
            {podeEditar && <button className="btn btn-primary" onClick={() => setItemModal({ item: null })}><Plus size={15} /> Item</button>}
            <button className="btn btn-success" onClick={() => exportarExcelObra(db, o)}><FileSpreadsheet size={15} /> Excel</button>
          </div>
        </div>
      </div>

      {pComp >= 100 ? (
        <div className="alert alert-danger"><AlertTriangle size={17} /><div>Comprometido <strong>ESTOUROU</strong> o AC21 em {fmt(Math.abs(o.ac21 - comp))}! Revise itens e compras.</div></div>
      ) : sl < 0 ? (
        <div className="alert alert-danger"><AlertTriangle size={17} /><div>Valor pago superou o AC21 em {fmt(Math.abs(sl))}.</div></div>
      ) : null}

      <div className="metrics c5">
        <div className="metric">
          <div className="metric-head"><div className="metric-label">AC21 Aprovado</div><div className="metric-icon mi-blue"><CreditCard size={17} /></div></div>
          <div className="metric-value sm" style={{ color: 'var(--blue)' }}>{fmt(o.ac21)}</div>
          <div className="metric-sub">Limite total da obra</div>
        </div>
        <div className="metric">
          <div className="metric-head"><div className="metric-label">Comprometido</div><div className="metric-icon mi-blue"><ClipboardCheck size={17} /></div></div>
          <div className="metric-value sm" style={{ color: corPct(pComp) }}>{fmt(comp)}</div>
          <div className="metric-sub">Orçado dos itens + compras</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: corPct(pComp), marginTop: 3 }}>{pComp}% do AC21</div>
          <div className="metric-bar" style={{ marginTop: 6 }}><div className="metric-bar-fill" style={{ width: Math.min(pComp, 100) + '%', background: corPct(pComp) }} /></div>
        </div>
        <div className="metric">
          <div className="metric-head"><div className="metric-label">Total Efetivamente Pago</div><div className="metric-icon mi-green"><CheckCircle2 size={17} /></div></div>
          <div className="metric-value sm">{fmt(pg)}</div>
          <div className="metric-sub">{pct(pg, o.ac21)}% do AC21 pago</div>
          <div className="metric-bar"><div className="metric-bar-fill" style={{ width: Math.min(p, 100) + '%', background: corPct(p) }} /></div>
        </div>
        <div className="metric">
          <div className="metric-head"><div className="metric-label">Compras em Aberto</div><div className="metric-icon mi-amber"><ShoppingBasket size={17} /></div></div>
          <div className="metric-value sm" style={{ color: 'var(--amber)' }}>{fmt(totalComprasTodas(db, o) - pgCompras)}</div>
          <div className="metric-sub">Pendente / parcial</div>
        </div>
        <div className="metric">
          <div className="metric-head"><div className="metric-label">Saldo (AC21 − Pago)</div><div className="metric-icon mi-green"><CreditCard size={17} /></div></div>
          <div className={'metric-value sm ' + (sl < 0 ? 'danger' : '')}>{fmt(sl)}</div>
          <div className={'metric-sub ' + (sl < 0 ? 'danger' : 'ok')} style={{ fontWeight: 700 }}>{sl >= 0 ? '✓ Disponível' : '⚠ Estourado'}</div>
        </div>
      </div>

      <div className="card consumo">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Consumo do AC21</span>
          <span style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i className="dot" style={{ width: 9, height: 9, background: '#9ec5f4' }} />Comprometido: <strong>{pComp}%</strong> ({fmt(comp)})</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i className="dot" style={{ width: 9, height: 9, background: '#1565C0' }} />Pago: <strong>{p}%</strong> ({fmt(pg)})</span>
          </span>
        </div>
        <div className="consumo-bar">
          <i style={{ width: Math.min(pComp, 100) + '%', background: corPct(pComp) + '55' }} />
          <i style={{ width: Math.min(p, 100) + '%', background: corPct(p) }} />
        </div>
        <div style={{ fontSize: 11, marginTop: 8, color: 'var(--text3)' }}>Barra sólida = efetivamente pago &nbsp;|&nbsp; Barra clara = comprometido total (orçamentos + compras, pagos ou não)</div>
      </div>

      <div className="tabs">
        <button className={'tab-btn' + (aba === 'itens' ? ' active' : '')} onClick={() => setAba('itens')}><ClipboardList size={15} /> Itens ({o.itens.length})</button>
        <button className={'tab-btn' + (aba === 'graficos' ? ' active' : '')} onClick={() => setAba('graficos')}><BarChart2 size={15} /> Gráficos</button>
        <button className={'tab-btn' + (aba === 'desempenho' ? ' active' : '')} onClick={() => setAba('desempenho')}><Activity size={15} /> Desempenho</button>
        <button className={'tab-btn' + (aba === 'compras' ? ' active' : '')} onClick={() => setAba('compras')}><ShoppingBasket size={15} /> Compras ({comprasObra.length})</button>
      </div>

      {aba === 'itens' && (<>
        <div className="card">
          <div className="card-title">Filtros</div>
          <div className="filter-bar">
            <div className="form-group"><label htmlFor="detalhe-10">Categoria</label>
              <select id="detalhe-10" value={f.cat} onChange={(e) => set('cat', e.target.value)}><option value="">Todas</option>{CATS_ITEM.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="form-group"><label htmlFor="detalhe-11">Tipo</label>
              <select id="detalhe-11" value={f.tipo} onChange={(e) => set('tipo', e.target.value)}><option value="">Todos</option><option value="orcado">Orçado</option><option value="nao_orcado">Não Orçado</option></select></div>
            <div className="form-group" style={{ flex: 1.4 }}><label htmlFor="filtro-forn">Fornecedor</label>
              <div className="search"><Search size={14} /><input id="filtro-forn" style={{ width: '100%' }} value={f.forn} onChange={(e) => set('forn', e.target.value)} placeholder="Buscar fornecedor..." /></div></div>
            <div className="form-group"><label htmlFor="detalhe-12">Data início</label><input id="detalhe-12" type="date" value={f.ini} onChange={(e) => set('ini', e.target.value)} /></div>
            <div className="form-group"><label htmlFor="detalhe-13">Data fim</label><input id="detalhe-13" type="date" value={f.fim} onChange={(e) => set('fim', e.target.value)} /></div>
            <button className="btn btn-ghost" onClick={() => setF({ cat: '', tipo: '', forn: '', ini: '', fim: '' })}><X size={14} /> Limpar</button>
          </div>
          {itens.length !== o.itens.length && <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 10 }}>Exibindo {itens.length} de {o.itens.length} itens (filtrado)</div>}
        </div>

        <div className="card">
          <div className="card-title">Itens</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Descrição</th><th>Categoria</th><th>Tipo</th><th className="td-right">Orçado</th><th className="td-right">Pago</th><th className="td-right">Saldo Item</th>
                <th>Fornecedor</th><th>NF</th><th>Data</th><th className="td-center">Ações</th></tr></thead>
              <tbody>
                {itens.length === 0 && <tr><td colSpan={10} className="td-empty">Nenhum item encontrado com os filtros atuais.</td></tr>}
                {itens.map((it) => {
                  const diff = Number(it.orcado || 0) - Number(it.pago || 0);
                  return (
                    <tr key={it.id}>
                      <td style={{ fontWeight: 500, maxWidth: 220 }}><span data-tip={it.obs || it.desc}>{it.desc}</span></td>
                      <td><span className="badge badge-gray">{it.cat}</span></td>
                      <td>{it.tipo === 'nao_orcado' ? <span className="badge badge-novo">Não Orçado</span> : <span className="badge badge-blue">Orçado</span>}</td>
                      <td className="td-right">{fmt(it.orcado)}</td>
                      <td className="td-right" style={{ fontWeight: 600 }}>{fmt(it.pago)}</td>
                      <td className="td-right" style={{ color: diff < 0 ? 'var(--red)' : diff > 0 ? 'var(--green)' : 'var(--text3)' }}>
                        {diff !== 0 ? (diff < 0 ? '−' + fmt(Math.abs(diff)) : '+' + fmt(diff)) : '-'}</td>
                      <td style={{ fontSize: 12 }}>{it.forn || '-'}</td>
                      <td style={{ fontSize: 12 }}>{it.nf || '-'}</td>
                      <td style={{ fontSize: 12 }}>{fmtData(it.data)}</td>
                      <td className="td-center"><div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>{podeEditar && <>
                        <button className="btn btn-sm btn-icon" data-tip="Editar" aria-label="Editar" onClick={() => setItemModal({ item: it })}><Pencil size={14} /></button>
                        <button className="btn btn-sm btn-icon btn-danger" data-tip="Excluir" aria-label="Excluir" onClick={async () => { if (await confirmar(`Remover o item "${it.desc}"?`, { confirmar: 'Remover', perigo: true })) { excluirItem(o.id, it.id); toast('Item removido.'); } }}><Trash2 size={14} /></button>
                      </>}</div></td>
                    </tr>
                  );
                })}
              </tbody>
              {itens.length > 0 && (
                <tfoot><tr><td colSpan={3}>TOTAL</td>
                  <td className="td-right">{fmt(itens.reduce((s, i) => s + Number(i.orcado || 0), 0))}</td>
                  <td className="td-right">{fmt(itens.reduce((s, i) => s + Number(i.pago || 0), 0))}</td><td colSpan={5} /></tr></tfoot>
              )}
            </table>
          </div>
        </div>
      </>)}

      {aba === 'graficos' && (<>
        {catData.length === 0 ? <div className="card"><Empty icon={<BarChart2 size={30} />}>Adicione itens ou compras para ver os gráficos.</Empty></div> : (
          <div className="grid2">
            <div className="card">
              <div className="card-title">Orçado vs Pago por Categoria</div>
              <ChartCanvas height={Math.max(catData.length * 55 + 60, 180)} config={{
                type: 'bar',
                data: { labels: catData.map((c) => c.cat), datasets: [
                  { label: 'Orçado', data: catData.map((c) => c.orc), backgroundColor: 'rgba(21,101,192,0.22)', borderColor: '#1565C0', borderWidth: 1, borderRadius: 3 },
                  { label: 'Comprometido', data: catData.map((c) => c.comp), backgroundColor: catColors.map((c) => c + '55'), borderRadius: 3 },
                  { label: 'Pago', data: catData.map((c) => c.pago), backgroundColor: catColors, borderRadius: 3 },
                ] },
                options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: true, position: 'top', labels: { font: { size: 12 }, boxWidth: 14 } }, tooltip: { callbacks: { label: (c: TT) => ` ${c.dataset.label}: ${fmt(c.raw)}` } } },
                  scales: { x: { ticks: { callback: brMoneyTick } }, y: { ticks: { font: { size: 12 } } } } },
              }} />
            </div>
            <div className="card">
              <div className="card-title">Composição dos Pagamentos</div>
              <ChartCanvas height={220} config={{
                type: 'doughnut',
                data: { labels: catData.map((c) => c.cat), datasets: [{ data: catData.map((c) => c.pago), backgroundColor: catColors, borderWidth: 2, borderColor: 'transparent' }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 12 }, boxWidth: 14 } }, tooltip: { callbacks: { label: (c: TT) => ` ${fmt(c.raw)}` } } } },
              }} />
            </div>
          </div>
        )}
        <div className="card">
          <div className="card-title">Resumo por Categoria</div>
          {catData.length === 0 && <div style={{ color: 'var(--text3)' }}>Sem categorias ainda.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {catData.map((c, i) => {
              const cp = pctInt(c.pago, c.orc || c.pago);
              return (
                <div key={c.cat}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5, gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600 }}>{c.cat}</span>
                    <span style={{ color: 'var(--text2)' }}>Pago {fmt(c.pago)} / Orçado {fmt(c.orc)} ({cp}%)</span>
                  </div>
                  <Progress value={cp} color={CORES[i % CORES.length]} />
                </div>
              );
            })}
          </div>
        </div>
      </>)}


      {aba === 'desempenho' && (evm ? (<>
        <div className="metrics c4">
          <div className="metric">
            <div className="metric-head"><div className="metric-label">Prazo (IDP)</div><span className={'badge ' + classeEvm[evm.nivelPrazo]}>{rotuloEvm[evm.nivelPrazo]}</span></div>
            <div className="metric-value" style={{ color: corEvm[evm.nivelPrazo] }}>{evm.idp == null ? '-' : fmtN(evm.idp, 2)}</div>
            <div className="metric-sub">{evm.idp == null ? 'Ainda não havia nada planejado na data de status.' : `A obra fez ${fmtN(evm.idp * 100, 0)}% do que devia até agora.`}</div>
          </div>
          <div className="metric">
            <div className="metric-head"><div className="metric-label">Custo (IDC)</div><span className={'badge ' + classeEvm[evm.nivelCusto]}>{rotuloEvm[evm.nivelCusto]}</span></div>
            <div className="metric-value" style={{ color: corEvm[evm.nivelCusto] }}>{evm.idc == null ? '-' : fmtN(evm.idc, 2)}</div>
            <div className="metric-sub">{evm.idc == null ? 'Ainda não há pagamentos para comparar.' : `Cada R$ 1,00 pago rendeu R$ ${fmtN(evm.idc, 2)} de obra feita.`}</div>
          </div>
          <div className="metric">
            <div className="metric-head"><div className="metric-label">Custo previsto no término</div></div>
            <div className="metric-value sm">{evm.eac == null ? '-' : fmt(evm.eac)}</div>
            <div className={'metric-sub ' + (evm.vac != null && evm.vac < 0 ? 'danger' : 'ok')}>{evm.vac == null ? 'Gastou sem avançar: não dá para estimar.' : evm.vac >= 0 ? `Sobra de ${fmt(evm.vac)} sobre o AC21` : `Estoura o AC21 em ${fmt(-evm.vac)}`}</div>
          </div>
          <div className="metric">
            <div className="metric-head"><div className="metric-label">Falta pagar para concluir</div></div>
            <div className="metric-value sm">{evm.etc == null ? '-' : fmt(Math.max(0, evm.etc))}</div>
            <div className="metric-sub">Estimativa para concluir ({fmtN(100 - evm.pctReal, 1)}% da obra)</div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><div className="card-title">Planejado x agregado x custo real</div>
            <div className="legend-row" style={{ margin: 0 }}>
              <span><i style={{ background: '#2a78d6' }} />Planejado</span><span><i style={{ background: '#1D9E75' }} />Valor agregado</span><span><i style={{ background: '#e8761e' }} />Custo real</span>
            </div></div>
          {curvaFin && (
            <ChartCanvas height={300} config={{
              type: 'line',
              data: { labels: curvaFin.rotulos, datasets: [
                { label: 'Planejado', data: curvaFin.planejado, borderColor: '#2a78d6', backgroundColor: '#2a78d6', pointRadius: 0, tension: 0.25, borderWidth: 2 },
                { label: 'Valor agregado', data: curvaFin.agregado, borderColor: '#1D9E75', backgroundColor: '#1D9E75', pointRadius: 3, tension: 0.2, borderWidth: 2 },
                { label: 'Custo real', data: curvaFin.custo, borderColor: '#e8761e', backgroundColor: '#e8761e', pointRadius: 3, tension: 0.2, borderWidth: 2 },
              ] },
              options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: TT) => ` ${c.dataset.label}: ${fmt(c.raw)}` } } },
                scales: { y: { ticks: { callback: brMoneyTick } }, x: { ticks: { maxTicksLimit: 10 } } } },
            }} />
          )}
          {curvaFin && curvaFin.semData > 0 && <div className="note" style={{ marginBottom: 0 }}>{fmt(curvaFin.semData)} em pagamentos sem data entram na data de status. Preencha a data dos itens e compras para o custo real aparecer no tempo certo.</div>}
        </div>

        <div className="card">
          <div className="card-title">Como ler</div>
          <div className="resumo-row"><span>Orçamento no término (AC21 aprovado)</span><b>{fmt(evm.bac)}</b></div>
          <div className="resumo-row"><span>Valor planejado até a data de status ({fmtN(evm.pctPrevisto, 1)}% da obra)</span><b>{fmt(evm.vp)}</b></div>
          <div className="resumo-row"><span>Valor agregado, o que foi realmente feito ({fmtN(evm.pctReal, 1)}% da obra)</span><b>{fmt(evm.va)}</b></div>
          <div className="resumo-row"><span>Custo real, o que já foi pago</span><b>{fmt(evm.cr)}</b></div>
          <div className="resumo-row"><span>Variação de prazo (agregado menos planejado)</span><b style={{ color: evm.vprazo < 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(evm.vprazo)}</b></div>
          <div className="resumo-row"><span>Variação de custo (agregado menos custo real)</span><b style={{ color: evm.vcusto < 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(evm.vcusto)}</b></div>
          <p style={{ color: 'var(--text3)', fontSize: 12.5, marginTop: 12 }}>
            IDP e IDC acima de 1 significam adiantado e abaixo do custo; abaixo de 0,95 pede atenção e abaixo de 0,85 é crítico. O avanço vem do cronograma (data de status {n2br(evm.dataStatus)}) e o custo vem dos valores pagos nos itens e nas compras.
          </p>
        </div>
      </>) : (
        <div className="card"><Empty icon={<Activity size={30} />}>Para calcular o desempenho, a obra precisa de cronograma com tarefas e de AC21 aprovado.</Empty>
          <div style={{ textAlign: 'center' }}><Link className="btn btn-primary" to="/cronograma" onClick={() => setObraAtiva(o.id)}>Abrir o cronograma</Link></div></div>
      ))}

      {aba === 'compras' && (<>
        {podeEditar && <div className="action-row"><button className="btn btn-primary" onClick={() => setCompraModal({ c: null })}><Plus size={15} /> Registrar Compra</button></div>}
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Descrição</th><th>Categoria</th><th>Fornecedor</th><th>NF</th><th>Data</th><th>Venc.</th><th className="td-right">Qtde</th><th className="td-right">Unit.</th><th className="td-right">Total</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>
                {comprasObra.length === 0 && <tr><td colSpan={11} className="td-empty">Nenhuma compra registrada para esta obra.</td></tr>}
                {comprasObra.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.desc}</td>
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
                      <button className="btn btn-sm btn-icon" onClick={() => setCompraModal({ c })}><Pencil size={14} /></button>
                      <button className="btn btn-sm btn-icon btn-danger" onClick={async () => { if (await confirmar(`Excluir a compra "${c.desc}"?`, { confirmar: 'Excluir', perigo: true })) { excluirCompra(c.id); toast('Compra excluída.'); } }}><Trash2 size={14} /></button>
                    </>}</div></td>
                  </tr>
                ))}
              </tbody>
              {comprasObra.length > 0 && (
                <tfoot>
                  <tr><td colSpan={8}>TOTAL COMPRAS</td><td className="td-right">{fmt(totalComprasTodas(db, o))}</td><td colSpan={2} /></tr>
                  <tr style={{ color: 'var(--badge-ok-fg)' }}><td colSpan={8}>TOTAL PAGO EM COMPRAS (status Pago)</td><td className="td-right">{fmt(pgCompras)}</td><td colSpan={2} /></tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </>)}

      {itemModal && <ItemModal obra={o} item={itemModal.item} onClose={() => setItemModal(null)} />}
      {compraModal && <CompraModal compra={compraModal.c} obraId={o.id} onClose={() => setCompraModal(null)} />}
    </div>
  );
}
