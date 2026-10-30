import { useRef, useState } from 'react';
import { FileUp, Check } from 'lucide-react';
import { Modal } from './ui';
import { useApp } from '../store/AppStore';
import { CATS_COMPRA, fmt, fmtData, plural, type StatusCompra } from '../lib/ac21';
import { AVISO_ARQUIVO_GRANDE, arquivoGrandeDemais } from '../lib/importacao';
import { type ModoLancamento, type NFe, comprasDaNFe, lerNFe, notaJaLancada } from '../lib/nfe';

interface Arquivo { nome: string; nf?: NFe; erro?: string; usar: boolean; duplicada: boolean }

export function ImportarNFeModal({ obraId, onClose }: { obraId?: number | null; onClose: () => void }) {
  const { db, salvarCompra, toast } = useApp();
  const entrada = useRef<HTMLInputElement>(null);
  const [arqs, setArqs] = useState<Arquivo[]>([]);
  const [obra, setObra] = useState<number>(obraId ?? db.obras[0]?.id ?? 0);
  const [cat, setCat] = useState('Insumos');
  const [status, setStatus] = useState<StatusCompra>('Pendente');
  const [modo, setModo] = useState<ModoLancamento>('nota');

  const ler = async (lista: FileList | null) => {
    if (!lista?.length) return;
    const novos: Arquivo[] = [];
    for (const f of Array.from(lista)) {
      try {
        if (arquivoGrandeDemais(f)) throw new Error(AVISO_ARQUIVO_GRANDE);
        const nf = lerNFe(await f.text());
        const duplicada = notaJaLancada(db, nf) || novos.some((n) => n.nf && n.nf.chave && n.nf.chave === nf.chave);
        novos.push({ nome: f.name, nf, duplicada, usar: !duplicada });
      } catch (e) { novos.push({ nome: f.name, erro: (e as Error).message, usar: false, duplicada: false }); }
    }
    setArqs((a) => [...a, ...novos]);
    if (entrada.current) entrada.current.value = '';
  };

  const marcadas = arqs.filter((a) => a.usar && a.nf);
  const lancar = () => {
    if (!obra) { toast('Cadastre uma obra antes de lançar notas.'); return; }
    let n = 0;
    marcadas.forEach((a) => comprasDaNFe(a.nf!, { obraId: obra, categoria: cat, status, modo }).forEach((c) => { salvarCompra(c, null); n++; }));
    toast(`${plural(marcadas.length, 'nota lançada', 'notas lançadas')} (${plural(n, 'compra', 'compras')}).`);
    onClose();
  };

  return (
    <Modal title="Importar NF-e (XML)" size="lg" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" disabled={!marcadas.length || !obra} onClick={lancar}><Check size={15} /> Lançar {marcadas.length ? plural(marcadas.length, 'nota', 'notas') : 'notas'}</button>
    </>}>
      <p>Escolha os arquivos XML das notas fiscais. O Obrix lê o fornecedor, o número, a data, os itens e as parcelas com vencimento, e lança as compras para você.</p>
      <button className="btn" onClick={() => entrada.current?.click()}><FileUp size={15} /> Escolher arquivos XML</button>
      <input ref={entrada} type="file" accept=".xml,text/xml,application/xml" multiple hidden onChange={(e) => void ler(e.target.files)} />

      {arqs.length > 0 && (
        <div className="table-wrap" style={{ margin: '14px 0' }}>
          <table>
            <thead><tr><th /><th>Fornecedor</th><th>NF</th><th>Emissão</th><th className="td-right">Total</th><th>Parcelas</th></tr></thead>
            <tbody>
              {arqs.map((a, i) => (
                <tr key={i}>
                  <td><input type="checkbox" aria-label={`Lançar ${a.nome}`} disabled={!a.nf} checked={a.usar}
                    onChange={(e) => setArqs((l) => l.map((x, j) => (j === i ? { ...x, usar: e.target.checked } : x)))} /></td>
                  {a.nf ? (<>
                    <td style={{ fontWeight: 500 }}>{a.nf.fornecedor}{a.duplicada && <span className="badge badge-warn" style={{ marginLeft: 8 }}>já lançada</span>}</td>
                    <td>{a.nf.numero}</td><td>{fmtData(a.nf.emissao)}</td>
                    <td className="td-right">{fmt(a.nf.total)}</td>
                    <td style={{ fontSize: 12 }}>{a.nf.parcelas.length ? a.nf.parcelas.map((p) => `${fmtData(p.venc)} · ${fmt(p.valor)}`).join(' | ') : 'sem parcelas'}</td>
                  </>) : (
                    <td colSpan={5} style={{ color: 'var(--red)' }}>{a.nome}: {a.erro}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="form-grid" style={{ marginTop: 6 }}>
        <div className="form-group"><label htmlFor="nfe-obra">Lançar na obra</label>
          <select id="nfe-obra" value={obra} onChange={(e) => setObra(Number(e.target.value))}>
            {db.obras.length === 0 && <option value={0}>Nenhuma obra cadastrada</option>}
            {db.obras.map((o) => <option key={o.id} value={o.id}>{o.codigo ? o.codigo + ' - ' : ''}{o.nome}</option>)}
          </select></div>
        <div className="form-group"><label htmlFor="nfe-cat">Categoria</label>
          <select id="nfe-cat" value={cat} onChange={(e) => setCat(e.target.value)}>{CATS_COMPRA.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="form-group"><label htmlFor="nfe-status">Situação do pagamento</label>
          <select id="nfe-status" value={status} onChange={(e) => setStatus(e.target.value as StatusCompra)}>
            <option value="Pendente">Pendente (a pagar)</option><option value="Pago">Pago</option>
          </select></div>
        <div className="form-group"><label htmlFor="nfe-modo">Como lançar</label>
          <select id="nfe-modo" value={modo} onChange={(e) => setModo(e.target.value as ModoLancamento)}>
            <option value="nota">Uma compra por nota (uma por parcela)</option><option value="itens">Uma compra por item</option>
          </select></div>
      </div>
    </Modal>
  );
}
