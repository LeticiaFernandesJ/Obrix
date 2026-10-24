import { useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../store/AppStore';
import { fmtTs } from '../lib/ac21';

export default function Historico() {
  const { db } = useApp();
  const [tipo, setTipo] = useState('');
  const [dt, setDt] = useState('');
  const tipos = [...new Set(db.historico.map((h) => h.tipo))];
  const hist = db.historico.filter((h) => (!tipo || h.tipo === tipo) && (!dt || h.ts.startsWith(dt)));
  return (
    <div className="content">
      <div className="card">
        <div className="card-title">Filtros</div>
        <div className="filter-bar">
          <div className="form-group"><label>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos</option>{tipos.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select></div>
          <div className="form-group"><label>Data</label><input type="date" value={dt} onChange={(e) => setDt(e.target.value)} /></div>
          <button className="btn btn-ghost" onClick={() => { setTipo(''); setDt(''); }}><X size={14} /> Limpar</button>
        </div>
      </div>
      <div className="card">
        <div className="card-title">{hist.length} registro(s) encontrado(s)</div>
        {hist.length === 0 ? <div className="empty">Nenhum registro.</div> : hist.map((h) => (
          <div className="hist-item" key={h.id}>
            <span className="hist-time">{fmtTs(h.ts)}</span>
            <span>{h.icone}</span>
            <span className="hist-text">{h.texto}<span className="hist-user">— {h.user}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}
