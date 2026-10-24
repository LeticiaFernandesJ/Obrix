import { useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3, Building2, ClipboardList, ShoppingBasket, Clock3, FileText, CalendarRange, LayoutDashboard, FolderKanban,
  Menu, Download, Save, FileSpreadsheet,
} from 'lucide-react';
import { useApp } from '../store/AppStore';
import { useDialogo } from './Dialogo';
import { useInstalar } from '../lib/pwa';
import { exportarExcel } from '../lib/ac21';
import { CronoActions } from '../pages/crono/CronoActions';

const BASE = import.meta.env.BASE_URL;

const NAV = [
  { sec: 'Principal', items: [
    { to: '/', label: 'Visão Geral', icon: BarChart3, end: true },
    { to: '/obras', label: 'Obras', icon: Building2 },
    { to: '/detalhe', label: 'Detalhes da Obra', icon: ClipboardList },
  ] },
  { sec: 'Controle', items: [
    { to: '/compras', label: 'Compras', icon: ShoppingBasket },
    { to: '/historico', label: 'Histórico', icon: Clock3 },
    { to: '/relatorios', label: 'Relatórios', icon: FileText },
  ] },
  { sec: 'Cronograma de obra', items: [
    { to: '/cronograma', label: 'Cronograma', icon: CalendarRange },
    { to: '/painel', label: 'Painel PMO', icon: LayoutDashboard },
    { to: '/projeto', label: 'Projeto', icon: FolderKanban },
  ] },
];

const TITULOS: Record<string, [string, string]> = {
  '/': ['Visão Geral', 'Gestão de Verbas por Obra'],
  '/obras': ['Obras', 'Gestão de Verbas por Obra'],
  '/detalhe': ['Detalhes da Obra', 'Gestão de Verbas por Obra'],
  '/compras': ['Compras', ''],
  '/historico': ['Histórico de Alterações', ''],
  '/relatorios': ['Relatórios', ''],
  '/cronograma': ['Cronograma de Obra', 'Controle de cronograma para obras'],
  '/painel': ['Painel PMO', 'Cronograma de Obra'],
  '/projeto': ['Projeto', 'Cronograma de Obra'],
};
const CRONO = ['/cronograma', '/painel', '/projeto'];

export function LogoObrix() {
  return (
    <span className="logo-card" aria-label="Obrix - Gestão inteligente de obras">
      <span className="logo-crop"><img src={BASE + 'assets/obrix-logo.jpg'} alt="Obrix" /></span>
    </span>
  );
}

function AC21Actions() {
  const { db, exportarTudo, importarDB, registrarHistorico, toast } = useApp();
  const { avisar } = useDialogo();
  const input = useRef<HTMLInputElement>(null);
  const salvar = () => {
    const blob = new Blob([JSON.stringify(exportarTudo(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `backup_obrix_${new Date().toISOString().split('T')[0]}.json`; a.click();
    registrarHistorico('backup', '💾', 'Backup JSON exportado');
    toast('Backup exportado.');
  };
  const carregar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const ok = importarDB(JSON.parse(String(ev.target?.result)));
        if (!ok) throw new Error('arquivo de backup inválido (sem lista de obras)');
        toast('Dados carregados com sucesso!');
      } catch (err) { void avisar('Erro ao carregar o arquivo: ' + (err as Error).message, 'Não foi possível carregar'); }
    };
    r.readAsText(f); e.target.value = '';
  };
  return (
    <>
      <button className="btn btn-success" onClick={() => exportarExcel(db)}><FileSpreadsheet size={15} /> Exportar Excel</button>
      <button className="btn" onClick={salvar}><Save size={15} /> Salvar</button>
      <button className="btn" onClick={() => input.current?.click()}><Download size={15} /> Carregar</button>
      <input ref={input} type="file" accept=".json" hidden onChange={carregar} />
    </>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  const { toastMsg, readOnly, usuario, sair, nuvem, recarregarNuvem, tentarSincronizar } = useApp();
  const [aberto, setAberto] = useState(false);
  const { podeInstalar, instalarNoIos, instalar } = useInstalar();
  useEffect(() => setAberto(false), [pathname]);
  const path = pathname.replace(/\/+$/, '') || '/';
  const [titulo, sub] = TITULOS[path] || ['Obrix', ''];
  const crono = CRONO.includes(path);
  if (readOnly && !crono) return <Navigate to="/painel" replace />;

  return (
    <div className="shell">
      {aberto && <div className="side-backdrop" onClick={() => setAberto(false)} aria-hidden="true" />}
      <aside className={'sidebar' + (aberto ? ' open' : '')}>
        <div className="brand-box">
          <LogoObrix />
          <div className="brand-tag">Controle AC21 · Cronograma</div>
        </div>
        <nav className="nav">
          {(readOnly ? NAV.slice(2) : NAV).map((g) => (
            <div key={g.sec}>
              <div className="nav-section">{g.sec}</div>
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
                  <it.icon size={17} /> {it.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        {(podeInstalar || instalarNoIos) && !readOnly && (
          <div className="install-box">
            {podeInstalar
              ? <button className="btn btn-sm" onClick={() => void instalar()}><Download size={14} /> Instalar aplicativo</button>
              : <span>Para instalar: toque em Compartilhar e em <b>Adicionar à Tela de Início</b>.</span>}
          </div>
        )}
        {usuario ? (
          <div className="user-box">
            <span className="email" title={usuario}>{usuario}</span>
            <span className="sync">
              <i className={'sync-dot' + (nuvem === 'salvando' || nuvem === 'carregando' ? ' busy' : nuvem === 'erro' ? ' err' : '')} />
              {nuvem === 'salvo' && <>Salvo na nuvem <button onClick={recarregarNuvem}>atualizar</button></>}
              {nuvem === 'salvando' && 'Salvando…'}
              {nuvem === 'carregando' && 'Carregando…'}
              {nuvem === 'erro' && <>Erro ao sincronizar <button onClick={tentarSincronizar}>tentar de novo</button></>}
            </span>
            {sair && <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,.08)', color: '#fff', borderColor: 'rgba(255,255,255,.18)' }} onClick={() => void sair()}>Sair</button>}
          </div>
        ) : (
          <div className="sidebar-footer"><i /> {readOnly ? 'Somente leitura' : 'Offline · dados no navegador'}</div>
        )}
      </aside>
      <div className="main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-icon menu-toggle" onClick={() => setAberto((v) => !v)} aria-label="Menu"><Menu size={18} /></button>
            <div>
              <div className="topbar-title">{titulo}</div>
              {sub && <div className="topbar-sub">{sub}</div>}
            </div>
          </div>
          <div className="topbar-actions">{crono ? <CronoActions /> : <AC21Actions />}</div>
        </header>
        <Outlet />
      </div>
      <div className={'toast' + (toastMsg ? ' on' : '')}>{toastMsg}</div>
    </div>
  );
}
