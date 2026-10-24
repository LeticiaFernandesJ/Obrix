import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle2, UserCheck } from 'lucide-react';
import { useApp } from '../store/AppStore';
import { gerarAlertas } from '../lib/alertas';
import { supabase } from '../lib/supabase';
import { type Notificacao, listarNotificacoes, marcarLidas, tempoRelativo } from '../lib/notificacoes';

/**
 * Sino da barra superior: avisos que chegaram para você (ex.: uma tarefa atribuída a você)
 * e alertas do sistema (verba, contas, atrasos).
 */
export function AlertasSino() {
  const { db, cronos, setObraAtiva, orgId, userId } = useApp();
  const nav = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [avisos, setAvisos] = useState<Notificacao[]>([]);
  const raiz = useRef<HTMLDivElement>(null);
  const alertas = useMemo(() => gerarAlertas(db, cronos), [db, cronos]);
  const criticos = alertas.filter((a) => a.nivel === 'critico').length;
  const naoLidos = avisos.filter((a) => !a.lida);
  const total = alertas.length + naoLidos.length;

  const carregar = useCallback(async () => {
    if (!supabase || !orgId || !userId) return;
    try { setAvisos(await listarNotificacoes(supabase, orgId)); } catch (e) { console.error('Falha ao ler notificações', e); }
  }, [orgId, userId]);

  // lê ao abrir, a cada minuto, ao voltar para a aba e na hora em que chega uma nova (tempo real)
  useEffect(() => {
    if (!supabase || !orgId || !userId) return;
    const sb = supabase;
    void carregar();
    const ronda = window.setInterval(() => { if (document.visibilityState === 'visible') void carregar(); }, 60000);
    const volta = () => { if (document.visibilityState === 'visible') void carregar(); };
    document.addEventListener('visibilitychange', volta);
    const canal = sb.channel('notificacoes-' + userId + '-' + orgId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `para_user=eq.${userId}` }, () => { void carregar(); })
      .subscribe();
    return () => { window.clearInterval(ronda); document.removeEventListener('visibilitychange', volta); void sb.removeChannel(canal); };
  }, [orgId, userId, carregar]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', tecla); };
  }, [aberto]);

  const abrir = (obraId: number | null, rota: string) => { if (obraId != null) setObraAtiva(obraId); setAberto(false); nav(rota); };
  const abrirAviso = (a: Notificacao) => {
    if (!a.lida && supabase) {
      setAvisos((l) => l.map((x) => (x.id === a.id ? { ...x, lida: true } : x)));
      void marcarLidas(supabase, [a.id]).catch(() => void carregar());
    }
    abrir(a.obra_id, a.rota);
  };
  const marcarTodas = () => {
    const ids = naoLidos.map((a) => a.id); if (!supabase || !ids.length) return;
    setAvisos((l) => l.map((x) => ({ ...x, lida: true })));
    void marcarLidas(supabase, ids).catch(() => void carregar());
  };
  const rotulo = total === 0 ? 'Notificações e alertas: nenhum' : `Notificações e alertas: ${total}`;

  return (
    <div className="sino" ref={raiz}>
      <button className="btn btn-icon sino-btn" aria-label={rotulo} aria-expanded={aberto} aria-haspopup="dialog" title={rotulo} onClick={() => setAberto((v) => !v)}>
        <Bell size={16} />
        {total > 0 && <span className={'sino-n' + (criticos ? ' crit' : '')}>{total > 9 ? '9+' : total}</span>}
      </button>
      {aberto && (
        <div className="sino-painel" role="dialog" aria-label="Notificações e alertas">
          {avisos.length > 0 && (
            <>
              <div className="sino-topo">Para você{naoLidos.length > 0 && <span> ({naoLidos.length} {naoLidos.length === 1 ? 'nova' : 'novas'})</span>}
                {naoLidos.length > 0 && <button className="link-btn sino-todas" onClick={marcarTodas}>Marcar como lidas</button>}
              </div>
              <ul>
                {avisos.slice(0, 8).map((a) => (
                  <li key={a.id}>
                    <button className={'sino-item' + (a.lida ? '' : ' nova')} onClick={() => abrirAviso(a)}>
                      <i className="sino-icone"><UserCheck size={15} /></i>
                      <span><b>{a.titulo}</b><small>{a.texto}</small><em>{tempoRelativo(a.created_at)}</em></span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
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
