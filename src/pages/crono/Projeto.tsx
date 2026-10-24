import { useEffect, useState } from 'react';
import { FileText, CalendarDays, TrendingUp } from 'lucide-react';
import { useApp } from '../../store/AppStore';
import { fmtN } from '../../lib/schedule';
import { n2br, n2iso, parseData } from '../../lib/dates';
import { CronoHeader } from './CronoHeader';

export default function Projeto() {
  const { crono, updateCrono, podeEditarArea, toast } = useApp();
  const readOnly = !podeEditarArea('cronograma');
  const m = crono.meta;
  const [sab, setSab] = useState(crono.cal.sab);
  const [dom, setDom] = useState(crono.cal.dom);
  const [fer, setFer] = useState((crono.cal.fer || []).join('\n'));
  useEffect(() => { setSab(crono.cal.sab); setDom(crono.cal.dom); setFer((crono.cal.fer || []).join('\n')); }, [crono.cal]);

  const setMeta = (k: keyof typeof m, v: string) => updateCrono((S) => { S.meta[k] = v; });
  const aplicar = () => {
    const lista = fer.split(/\n+/).map((s) => s.trim()).filter(Boolean)
      .map((s) => { const n = parseData(s); return n != null ? n2iso(n) : null; }).filter((x): x is string => !!x);
    updateCrono((S) => { S.cal.sab = sab; S.cal.dom = dom; S.cal.fer = lista; });
    setFer(lista.join('\n'));
    toast('Calendário aplicado e datas recalculadas.');
  };

  const f = (id: keyof typeof m, label: string, ph?: string) => (
    <div className="field"><label htmlFor={'proj-' + id}>{label}</label>
      <input id={'proj-' + id} value={m[id]} readOnly={readOnly} placeholder={ph} onChange={(e) => setMeta(id, e.target.value)} /></div>
  );

  return (
    <div className="content">
      <CronoHeader />
      <div className="proj-grid">
        <div className="card">
          <div className="icon-title"><div className="metric-icon mi-blue"><FileText size={17} /></div><h3>Dados do projeto</h3></div>
          {f('nome', 'Nome do projeto / obra')}
          <div className="row2">{f('contrato', 'Contrato')}{f('empresa', 'Empresa contratada')}</div>
          <div className="row2">{f('resp', 'Responsável (encarregado)')}{f('pmo', 'Contato do PMO')}</div>
          <div className="field"><label htmlFor="projeto-1">Observações da semana (vai junto no envio ao PMO)</label>
            <textarea id="projeto-1" style={{ minHeight: 100 }} readOnly={readOnly} value={m.obs} onChange={(e) => setMeta('obs', e.target.value)} /></div>
        </div>
        <div className="card">
          <div className="icon-title"><div className="metric-icon mi-blue"><CalendarDays size={17} /></div><h3>Calendário de trabalho</h3></div>
          <div className="opcoes">
            <label className="opcao"><input type="checkbox" disabled={readOnly} checked={sab} onChange={(e) => setSab(e.target.checked)} /> <span>Trabalha aos sábados</span></label>
            <label className="opcao"><input type="checkbox" disabled={readOnly} checked={dom} onChange={(e) => setDom(e.target.checked)} /> <span>Trabalha aos domingos</span></label>
          </div>
          <div className="field"><label htmlFor="projeto-2">Feriados e paradas</label>
            <div className="dica">Uma data por linha, no formato AAAA-MM-DD ou DD/MM/AAAA.</div>
            <textarea id="projeto-2" style={{ minHeight: 120 }} readOnly={readOnly} value={fer} onChange={(e) => setFer(e.target.value)} /></div>
          {!readOnly && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={aplicar}>Aplicar calendário</button>
              <span style={{ color: 'var(--text3)', fontSize: 12 }}>as datas do cronograma são recalculadas</span>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="icon-title"><div className="metric-icon mi-blue"><TrendingUp size={17} /></div><h3>Histórico de medições (curva S realizada)</h3></div>
        {crono.medicoes.length ? (
          <div className="table-wrap plain"><table>
            <thead><tr><th>Data</th><th className="td-right">Avanço</th><th /></tr></thead>
            <tbody>
              {crono.medicoes.map((md, j) => (
                <tr key={md.d}>
                  <td>{n2br(parseData(md.d))}</td>
                  <td className="td-right" style={{ color: 'var(--blue)', fontWeight: 700 }}>{fmtN(md.p, 1)}%</td>
                  <td className="td-right">{!readOnly && <button className="btn btn-sm" onClick={() => updateCrono((S) => { S.medicoes.splice(j, 1); })}>remover</button>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : <div className="empty">Nenhuma medição registrada. Use “Registrar medição” a cada semana para desenhar a curva realizada.</div>}
        <div className="creditos">
          <span><b>Cronograma de Obra</b> · desenvolvido pelo Engenheiro Joilson de Paula</span>
          <span>Ferramenta livre de licença: sem servidor e sem cadastro.</span>
        </div>
      </div>
    </div>
  );
}
