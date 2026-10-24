import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle2 } from 'lucide-react';
import { useApp } from '../store/AppStore';
import { gerarAlertas } from '../lib/alertas';

/** Sino da barra superior: mostra quantos alertas existem e abre a lista. */
export function AlertasSino() {
  const { db, cronos, setObraAtiva } = useApp();
  const nav = useNavigate();
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const alertas = useMemo(() => gerarAlertas(db, cronos), [db, cronos]);
  const criticos = alertas.filter((a) => a.nivel === 'critico').length;

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', tecla); };
  }, [aberto]);

  const abrir = (obraId: number, rota: string) => { setObraAtiva(obraId); setAberto(false); nav(rota); };
  const rotulo = alertas.length === 0 ? 'Alertas: nenhum' : `Alertas: ${alertas.length}`;

  return (
    <div className="sino" ref={raiz}>
      <button className="btn btn-icon sino-btn" aria-label={rotulo} aria-expanded={aberto} aria-haspopup="dialog" title={rotulo} onClick={() => setAberto((v) => !v)}>
        <Bell size={16} />
        {alertas.length > 0 && <span className={'sino-n' + (criticos ? ' crit' : '')}>{alertas.length > 9 ? '9+' : alertas.length}</span>}
      </button>
      {aberto && (
        <div className="sino-painel" role="dialog" aria-label="Alertas">
          <div className="sino-topo">Alertas{alertas.length > 0 && <span> ({alertas.length})</span>}</div>
          {alertas.length === 0 ? (
            <div className="sino-vazio"><CheckCircle2 size={22} /><span>Tudo em dia. Nenhum alerta no momento.</span></div>
          ) : (
            <ul>
              {alertas.map((a) => (
                <li key={a.id}>
                  <button className="sino-item" onClick={() => abrir(a.obraId, a.rota)}>
                    <i className={'sino-ponto ' + a.nivel} />
                    <span><b>{a.titulo}</b><small>{a.texto}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
