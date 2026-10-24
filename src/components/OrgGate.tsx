import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Building2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  type Org, aceitarConvite, conviteGuardado, criarOrg, limparConvite, minhasOrgs, traduzirErro,
} from '../lib/equipe';
import { AppProvider } from '../store/AppStore';
import { useDialogo } from './Dialogo';

const BASE = import.meta.env.BASE_URL;
const kAtiva = (userId: string) => 'obrix-org-ativa:' + userId;
const lerAtiva = (userId: string) => { try { return localStorage.getItem(kAtiva(userId)); } catch { return null; } };
const gravarAtiva = (userId: string, id: string) => { try { localStorage.setItem(kAtiva(userId), id); } catch { /* ok */ } };

function Fundo({ children }: { children: ReactNode }) {
  return (
    <div className="lg-page" style={{ backgroundImage: `url(${BASE}assets/login-bg.jpg)` }}>
      <div className="lg-shade" />
      <div className="lg-inner" style={{ justifyContent: 'center' }}>{children}</div>
    </div>
  );
}

function CriarEmpresa({ onCriada, onSair }: { onCriada: (id: string) => void; onSair: (() => Promise<void>) | null }) {
  const [nome, setNome] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault(); if (!supabase) return;
    if (!nome.trim()) { setErro('Informe o nome da empresa ou da equipe.'); return; }
    setBusy(true); setErro(null);
    try { onCriada(await criarOrg(supabase, nome)); }
    catch (err) { setErro(traduzirErro((err as Error).message)); setBusy(false); }
  };
  return (
    <Fundo>
      <form className="lg-card" onSubmit={enviar}>
        <span className="logo-crop lg-logo"><img src={BASE + 'assets/obrix-logo-recorte.png'} alt="Obrix" /></span>
        <h1>Vamos começar</h1>
        <p className="lg-sub">Dê um nome à sua empresa ou equipe. Depois você poderá convidar outras pessoas para trabalhar nas mesmas obras.</p>
        <div className="lg-field">
          <label htmlFor="org-nome">Nome da empresa ou equipe</label>
          <div className="lg-input"><Building2 size={18} />
            <input id="org-nome" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Construtora Alfa" maxLength={80} />
          </div>
        </div>
        {erro && <div className="alert alert-danger" role="alert">{erro}</div>}
        <button className="lg-btn" disabled={busy}>{busy ? 'Aguarde…' : <>Criar e entrar <ArrowRight size={20} /></>}</button>
        <div className="lg-foot">
          Tem um convite? Abra o link que recebeu.{' '}
          {onSair && <button type="button" className="lg-link" onClick={() => void onSair()}>Sair</button>}
        </div>
      </form>
    </Fundo>
  );
}

/**
 * Depois do login: aceita convite pendente, descobre as organizações da pessoa e abre a escolhida.
 * Quem ainda não tem organização cria a primeira.
 */
export default function OrgGate({ userId, email, onSignOut, children }: {
  userId: string; email: string; onSignOut: (() => Promise<void>) | null; children: ReactNode;
}) {
  const { avisar } = useDialogo();
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [ativaId, setAtivaId] = useState<string | null>(() => lerAtiva(userId));
  const [erro, setErro] = useState<string | null>(null);
  const avisarRef = useRef(avisar); avisarRef.current = avisar;

  const carregar = useCallback(async (primeira: boolean) => {
    const sb = supabase; if (!sb) return;
    try {
      let entrou: string | null = null;
      const token = primeira ? conviteGuardado() : null;
      if (token) {
        try { entrou = await aceitarConvite(sb, token); }
        catch (e) { void avisarRef.current((e as Error).message, 'Convite não aceito'); }
        finally { limparConvite(); }
      }
      const lista = await minhasOrgs(sb, userId);
      setOrgs(lista); setErro(null);
      setAtivaId((atual) => {
        const escolhida = entrou && lista.some((o) => o.id === entrou) ? entrou
          : atual && lista.some((o) => o.id === atual) ? atual : (lista[0]?.id ?? null);
        if (escolhida) gravarAtiva(userId, escolhida);
        return escolhida;
      });
      if (entrou) {
        const o = lista.find((x) => x.id === entrou);
        if (o) void avisarRef.current(`Você agora faz parte de "${o.nome}" como ${o.papel === 'admin' ? 'administrador' : o.papel === 'editor' ? 'editor' : 'leitor'}.`, 'Convite aceito');
      }
    } catch (e) { setErro(traduzirErro((e as Error).message)); setOrgs((o) => o ?? []); }
  }, [userId]);

  useEffect(() => { void carregar(true); }, [carregar]);

  // mudanças na equipe (papel alterado, removido, convite aceito) aparecem sem precisar sair
  useEffect(() => {
    const h = () => { if (document.visibilityState === 'visible') void carregar(false); };
    document.addEventListener('visibilitychange', h);
    const t = window.setInterval(h, 60000);
    return () => { document.removeEventListener('visibilitychange', h); window.clearInterval(t); };
  }, [carregar]);

  const trocar = useCallback((id: string) => { gravarAtiva(userId, id); setAtivaId(id); }, [userId]);

  if (orgs === null) return <Fundo><div className="lg-loading">Carregando…</div></Fundo>;
  if (erro && orgs.length === 0) {
    return (
      <Fundo>
        <div className="lg-card" style={{ textAlign: 'center' }}>
          <h1>Não foi possível carregar</h1>
          <p className="lg-sub">{erro}</p>
          <button className="lg-btn" onClick={() => { setOrgs(null); void carregar(false); }}>Tentar de novo</button>
          {onSignOut && <div className="lg-foot"><button type="button" className="lg-link" onClick={() => void onSignOut()}>Sair</button></div>}
        </div>
      </Fundo>
    );
  }
  const ativa = orgs.find((o) => o.id === ativaId);
  if (!ativa) return <CriarEmpresa onSair={onSignOut} onCriada={(id) => { gravarAtiva(userId, id); setAtivaId(id); void carregar(false); }} />;

  return (
    <AppProvider key={ativa.id} userId={userId} email={email} nome={ativa.meuNome} onSignOut={onSignOut}
      orgId={ativa.id} papel={ativa.papel} permissoes={ativa.permissoes} orgs={orgs} trocarOrg={trocar} recarregarOrgs={() => void carregar(false)}>
      {children}
    </AppProvider>
  );
}
