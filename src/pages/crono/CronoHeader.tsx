import { Fragment, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { useApp } from '../../store/AppStore';
import { Empty } from '../../components/ui';

export function CronoHeader() {
  const { crono, readOnly, podeEditar, db, obraAtual, setObraAtiva } = useApp();
  const m = crono.meta;
  const sd = m.statusDate ? m.statusDate.split('-').reverse().join('/') : '';
  const meta = [m.contrato, m.empresa].filter(Boolean).join(' · ');
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'on' : '');
  return (
    <div className="crono-head">
      <div>
        <div className="eyebrow">Cronograma de obra{!readOnly && obraAtual?.codigo ? ' · ' + obraAtual.codigo : ''}</div>
        <h2>{m.nome || obraAtual?.nome || 'Novo projeto'}</h2>
        <div className="meta">{meta}{meta && sd ? ' · ' : ''}{sd && <>data de status {sd}</>}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {readOnly && <span className="chip ro">somente leitura, visão PMO</span>}
        {!readOnly && !podeEditar && <span className="chip ro">somente consulta</span>}
        {!readOnly && db.obras.length > 0 && (
          <label className="obra-pick" title="Obra do cronograma">
            <Building2 size={15} />
            <select value={obraAtual?.id ?? ''} onChange={(e) => setObraAtiva(Number(e.target.value))}>
              {db.obras.map((o) => <option key={o.id} value={o.id}>{o.codigo ? o.codigo + ' - ' : ''}{o.nome}</option>)}
            </select>
          </label>
        )}
        <div className="seg">
          <NavLink to="/cronograma" className={cls}>Cronograma</NavLink>
          <NavLink to="/painel" className={cls}>Painel PMO</NavLink>
          <NavLink to="/projeto" className={cls}>Projeto</NavLink>
        </div>
      </div>
    </div>
  );
}

/** Cada cronograma pertence a uma obra: sem obra cadastrada, orienta o usuário. */
export function ComObra({ children }: { children: ReactNode }) {
  const { readOnly, obraAtual } = useApp();
  if (readOnly || obraAtual) return <Fragment key={readOnly ? 'ro' : obraAtual!.id}>{children}</Fragment>;
  return (
    <div className="content">
      <div className="card">
        <Empty icon={<Building2 size={30} />}>Cadastre uma obra para criar o cronograma dela.</Empty>
        <div style={{ textAlign: 'center' }}><Link className="btn btn-primary" to="/obras">Ir para Obras</Link></div>
      </div>
    </div>
  );
}
