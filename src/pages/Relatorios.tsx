import { useRef } from 'react';
import { FolderOpen, Printer, Save, ShoppingBasket, Table2, BarChart3 } from 'lucide-react';
import { useApp } from '../store/AppStore';
import { useDialogo } from '../components/Dialogo';
import { AVISO_ARQUIVO_GRANDE, arquivoGrandeDemais } from '../lib/importacao';
import { hojeISO,
  corPct, exportarExcel, exportarExcelCompras, fmt, nivelPct, pct, pctInt, pctTxt, rotuloNivel, totalComprometido, totalPago,
} from '../lib/ac21';

export default function Relatorios() {
  const { db, exportarTudo, importarDB, registrarHistorico, toast, podeEditarArea } = useApp();
  const podeEditar = (['obras', 'compras', 'cronograma'] as const).every((a) => podeEditarArea(a));
  const { avisar, confirmar } = useDialogo();
  const input = useRef<HTMLInputElement>(null);
  const totalAC21 = db.obras.reduce((s, o) => s + Number(o.ac21), 0);
  const totPg = db.obras.reduce((s, o) => s + totalPago(db, o), 0);
  const totComp = db.obras.reduce((s, o) => s + totalComprometido(db, o), 0);
  const totCompras = db.compras.reduce((s, c) => s + Number(c.total || 0), 0);
  const pc = corPct(pctInt(totComp, totalAC21));

  const salvar = () => {
    const blob = new Blob([JSON.stringify(exportarTudo(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `backup_obrix_${hojeISO()}.json`; a.click();
    registrarHistorico('backup', '💾', 'Backup JSON exportado'); toast('Backup exportado.');
  };
  const carregar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (arquivoGrandeDemais(f)) { e.target.value = ''; void avisar(AVISO_ARQUIVO_GRANDE, 'Não foi possível carregar'); return; }
    const r = new FileReader();
    r.onload = (ev) => {
      void (async () => {
        try {
          const dados = JSON.parse(String(ev.target?.result));
          const n = Array.isArray(dados?.obras) ? dados.obras.length : 0;
          if (!n) throw new Error('arquivo de backup inválido (sem lista de obras)');
          // carregar um backup troca TUDO o que existe hoje: confirma antes
          if (!(await confirmar(`Carregar este backup substitui todas as obras, itens, compras e cronogramas que existem agora pelos do arquivo (${n} ${n === 1 ? 'obra' : 'obras'}).\n\nSe quiser guardar o que existe hoje, cancele e use "Salvar" primeiro.`, { titulo: 'Carregar backup', confirmar: 'Substituir tudo', perigo: true }))) return;
          if (!importarDB(dados)) throw new Error('arquivo de backup inválido');
          toast('Dados carregados com sucesso!');
        } catch (err) { void avisar('Erro ao carregar o arquivo: ' + (err as Error).message, 'Não foi possível carregar'); }
      })();
    };
    r.readAsText(f); e.target.value = '';
  };

  return (
    <div className="content">
      <div className="grid2">
        <div className="card">
          <div className="card-title">Resumo Geral</div>
          <div className="resumo-row"><span>Total AC21 aprovado</span><b style={{ color: 'var(--blue)' }}>{fmt(totalAC21)}</b></div>
          <div className="resumo-row"><span><Table2 size={13} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--text3)' }} />Total comprometido (itens orçados ou pagos + compras)</span><b style={{ color: 'var(--green)' }}>{fmt(totComp)}</b></div>
          <div className="resumo-row"><span>% comprometido do AC21</span><b style={{ color: pc }}>{pctTxt(pct(totComp, totalAC21))}%</b></div>
          <div className="resumo-row"><span>Total efetivamente pago</span><b>{fmt(totPg)}</b></div>
          <div className="resumo-row"><span>Total em compras (todas)</span><b>{fmt(totCompras)}</b></div>
          <div className="resumo-row total"><span>Saldo disponível (AC21 – comprometido)</span><b style={{ color: totalAC21 - totComp < 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(totalAC21 - totComp)}</b></div>
        </div>
        <div className="card">
          <div className="card-title">Ações Rápidas</div>
          <div className="action-stack">
            <button className="btn btn-success" onClick={() => exportarExcel(db)}><BarChart3 size={16} /> Exportar todas as obras (Excel)</button>
            <button className="btn" onClick={() => exportarExcelCompras(db)}><ShoppingBasket size={16} /> Exportar compras (Excel)</button>
            <button className="btn" onClick={salvar}><Save size={16} /> Salvar backup (JSON)</button>
            {podeEditar && <button className="btn" onClick={() => input.current?.click()}><FolderOpen size={16} /> Carregar backup (JSON)</button>}
            <button className="btn" onClick={() => window.print()}><Printer size={16} /> Imprimir relatório</button>
            <input ref={input} type="file" accept=".json" hidden onChange={carregar} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Detalhamento por Obra</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Obra</th><th>Código</th><th>AC21</th><th className="td-right">Comprometido</th><th className="td-right">% AC21</th><th className="td-right">Pago</th><th className="td-right">Saldo (AC21−comp.)</th><th>Status</th></tr></thead>
            <tbody>
              {db.obras.length === 0 && <tr><td colSpan={8} style={{ height: 130 }} /></tr>}
              {db.obras.map((o) => {
                const pgo = totalPago(db, o), comp = totalComprometido(db, o), sl = o.ac21 - comp, pComp = pct(comp, o.ac21);
                const nv = nivelPct(pComp);
                return (
                  <tr key={o.id}>
                    <td>{o.nome}</td><td><code>{o.codigo}</code></td><td>{fmt(o.ac21)}</td>
                    <td className="td-right" style={{ fontWeight: 700, color: corPct(pComp) }}>{fmt(comp)}</td>
                    <td className="td-right" style={{ fontWeight: 700, color: corPct(pComp) }}>{pctTxt(pComp)}%</td>
                    <td className="td-right">{fmt(pgo)}</td>
                    <td className="td-right" style={{ color: sl < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>{fmt(sl)}</td>
                    <td><span className={'badge badge-' + (nv === 'ok' ? 'ok' : nv)}>{rotuloNivel[nv]}</span></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr>
              <td colSpan={2}>TOTAL</td><td>{fmt(totalAC21)}</td>
              <td className="td-right" style={{ color: pc }}>{fmt(totComp)}</td>
              <td className="td-right" style={{ color: pc }}>{pctTxt(pct(totComp, totalAC21))}%</td>
              <td className="td-right">{fmt(totPg)}</td>
              <td className="td-right" style={{ color: totalAC21 - totComp < 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(totalAC21 - totComp)}</td><td />
            </tr></tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
