import { useState } from 'react';
import { Check } from 'lucide-react';
import { Modal, CampoDinheiro } from './ui';
import { useApp } from '../store/AppStore';
import { CATS_COMPRA, hojeISO, type Compra, type StatusCompra } from '../lib/ac21';

interface Props { compra: Compra | null; obraId?: number | null; onClose: () => void }

export function CompraModal({ compra, obraId, onClose }: Props) {
  const { db, salvarCompra, toast } = useApp();
  const [f, setF] = useState({
    obraId: compra?.obraId ?? obraId ?? db.obras[0]?.id ?? 0,
    desc: compra?.desc ?? '', cat: compra?.cat ?? 'Insumos', forn: compra?.forn ?? '', cnpj: compra?.cnpj ?? '',
    nf: compra?.nf ?? '', data: compra?.data ?? hojeISO(), venc: compra?.venc ?? '',
    qtde: compra?.qtde ? String(compra.qtde) : '', unid: compra?.unid ?? '',
    unit: compra?.unit ? String(compra.unit) : '', total: compra?.total ? String(compra.total) : '',
    status: (compra?.status ?? 'Pago') as StatusCompra, obs: compra?.obs ?? '',
  });
  const set = (k: keyof typeof f, v: string | number) => setF((x) => ({ ...x, [k]: v }));

  const calcTotal = (qtde: string, unit: string) => {
    const q = parseFloat(qtde) || 0, u = parseFloat(unit) || 0;
    return q && u ? (q * u).toFixed(2) : null;
  };
  const onQtde = (v: string) => setF((x) => ({ ...x, qtde: v, total: calcTotal(v, x.unit) ?? x.total }));
  const onUnit = (v: string) => setF((x) => ({ ...x, unit: v, total: calcTotal(x.qtde, v) ?? x.total }));
  const onTotal = (v: string) => setF((x) => {
    const q = parseFloat(x.qtde) || 0, t = parseFloat(v) || 0;
    return { ...x, total: v, unit: q && t ? (t / q).toFixed(2) : x.unit };
  });

  const salvar = () => {
    if (!f.desc.trim()) { toast('Informe a descrição da compra.'); return; }
    if (!f.forn.trim()) { toast('Informe o fornecedor.'); return; }
    const total = parseFloat(f.total) || 0;
    if (!(total > 0)) { toast('Informe um valor total maior que zero.'); return; }
    if (!f.obraId) { toast('Cadastre uma obra antes de registrar compras.'); return; }
    salvarCompra({
      obraId: Number(f.obraId), desc: f.desc.trim(), cat: f.cat, forn: f.forn.trim(), cnpj: f.cnpj.trim(), nf: f.nf.trim(),
      data: f.data, venc: f.venc, qtde: parseFloat(f.qtde) || 0, unid: f.unid.trim(), unit: parseFloat(f.unit) || 0, total,
      status: f.status, obs: f.obs.trim(),
    }, compra?.id ?? null);
    toast(compra ? 'Compra atualizada.' : 'Compra registrada.');
    onClose();
  };

  return (
    <Modal title={compra ? 'Editar Compra' : 'Registrar Compra'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" onClick={salvar}><Check size={15} /> {compra ? 'Salvar Compra' : 'Registrar Compra'}</button>
    </>}>
      <div className="form-grid">
        <div className="form-group form-full"><label htmlFor="compramodal-1">Descrição da Compra *</label><input id="compramodal-1" value={f.desc} onChange={(e) => set('desc', e.target.value)} placeholder="Ex: 500 blocos cerâmicos 14x19x29" /></div>
        <div className="form-group"><label htmlFor="compramodal-2">Obra *</label>
          <select id="compramodal-2" value={f.obraId} onChange={(e) => set('obraId', Number(e.target.value))}>
            {db.obras.length === 0 && <option value={0}>Nenhuma obra cadastrada</option>}
            {db.obras.map((o) => <option key={o.id} value={o.id}>{o.codigo} - {o.nome}</option>)}
          </select></div>
        <div className="form-group"><label htmlFor="compramodal-3">Categoria</label>
          <select id="compramodal-3" value={f.cat} onChange={(e) => set('cat', e.target.value)}>{CATS_COMPRA.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="form-group"><label htmlFor="compramodal-4">Fornecedor *</label><input id="compramodal-4" value={f.forn} onChange={(e) => set('forn', e.target.value)} placeholder="Nome do fornecedor" /></div>
        <div className="form-group"><label htmlFor="compramodal-5">CNPJ / CPF</label><input id="compramodal-5" value={f.cnpj} onChange={(e) => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00" /></div>
        <div className="form-group"><label htmlFor="compramodal-6">Nº NF</label><input id="compramodal-6" value={f.nf} onChange={(e) => set('nf', e.target.value)} placeholder="Ex: NF-0042" /></div>
        <div className="form-group"><label htmlFor="compramodal-7">Data da Compra *</label><input id="compramodal-7" type="date" value={f.data} onChange={(e) => set('data', e.target.value)} /></div>
        <div className="form-group"><label htmlFor="compramodal-venc">Vencimento</label><input id="compramodal-venc" type="date" value={f.venc} onChange={(e) => set('venc', e.target.value)} /></div>
        <div className="form-group"><label htmlFor="compramodal-8">Qtde</label><input id="compramodal-8" type="number" min="0" step="0.01" value={f.qtde} onChange={(e) => onQtde(e.target.value)} placeholder="1" /></div>
        <div className="form-group"><label htmlFor="compramodal-9">Unidade</label><input id="compramodal-9" value={f.unid} onChange={(e) => set('unid', e.target.value)} placeholder="Ex: un, m², kg, L" /></div>
        <div className="form-group"><label htmlFor="compramodal-10">Valor Unitário (R$)</label><CampoDinheiro id="compramodal-10" value={f.unit} onChange={(v) => onUnit(v)} /></div>
        <div className="form-group"><label htmlFor="compramodal-11">Valor Total (R$) *</label><CampoDinheiro id="compramodal-11" value={f.total} onChange={(v) => onTotal(v)} /></div>
        <div className="form-group"><label htmlFor="compramodal-12">Status</label>
          <select id="compramodal-12" value={f.status} onChange={(e) => set('status', e.target.value)}>
            <option value="Pago">Pago</option><option value="Pendente">Pendente</option><option value="Parcial">Parcialmente pago</option>
          </select></div>
        <div className="form-group form-full"><label htmlFor="compramodal-13">Observações</label><textarea id="compramodal-13" value={f.obs} onChange={(e) => set('obs', e.target.value)} placeholder="Notas sobre esta compra..." /></div>
      </div>
    </Modal>
  );
}
