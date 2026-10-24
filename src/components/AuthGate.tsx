import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, Eye, EyeOff, FileText, Lock, Mail, Users } from 'lucide-react';
import { supabase, supabaseAtivo } from '../lib/supabase';
import { AppProvider } from '../store/AppStore';

const BASE = import.meta.env.BASE_URL;
const K_LEMBRAR = 'obrix-lembrar';
const K_SESSAO = 'obrix-sessao';

function traduzir(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar (veja a caixa de entrada e o spam).';
  if (m.includes('already registered')) return 'Este e-mail já tem cadastro. Use "Entrar".';
  if (m.includes('password should be')) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Aguarde alguns minutos.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sem conexão com o servidor. Verifique a internet.';
  return msg;
}

type Modo = 'entrar' | 'criar' | 'recuperar';
const TEXTOS: Record<Modo, { titulo: string; sub: string; botao: string }> = {
  entrar: { titulo: 'Entrar na sua conta', sub: 'Acesse o sistema e gerencie suas obras de forma simples e eficiente.', botao: 'Entrar' },
  criar: { titulo: 'Criar sua conta', sub: 'Cadastre-se para guardar suas obras e cronogramas com segurança.', botao: 'Criar conta' },
  recuperar: { titulo: 'Recuperar senha', sub: 'Informe seu e-mail e enviaremos um link para redefinir a senha.', botao: 'Enviar link' },
};

function Login() {
  const [modo, setModo] = useState<Modo>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [ver, setVer] = useState(false);
  const [lembrar, setLembrar] = useState(() => { try { return localStorage.getItem(K_LEMBRAR) !== '0'; } catch { return true; } });
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const t = TEXTOS[modo];
  const trocar = (m: Modo) => { setModo(m); setMsg(null); };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault(); if (!supabase) return;
    setBusy(true); setMsg(null);
    try {
      if (modo === 'entrar') {
        try { localStorage.setItem(K_LEMBRAR, lembrar ? '1' : '0'); sessionStorage.setItem(K_SESSAO, '1'); } catch { /* ok */ }
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
        if (error) setMsg({ tipo: 'erro', texto: traduzir(error.message) });
      } else if (modo === 'criar') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password: senha, options: { emailRedirectTo: location.origin + BASE },
        });
        if (error) setMsg({ tipo: 'erro', texto: traduzir(error.message) });
        else if (!data.session) setMsg({ tipo: 'ok', texto: 'Cadastro criado! Enviamos um e-mail de confirmação — clique no link e depois volte para entrar.' });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + BASE });
        setMsg(error ? { tipo: 'erro', texto: traduzir(error.message) } : { tipo: 'ok', texto: 'Se o e-mail existir, enviamos um link para redefinir a senha.' });
      }
    } catch (err) { setMsg({ tipo: 'erro', texto: traduzir((err as Error).message) }); }
    setBusy(false);
  };

  return (
    <div className="lg-page" style={{ backgroundImage: `url(${BASE}assets/login-bg.jpg)` }}>
      <div className="lg-shade" />
      <div className="lg-inner">
        <section className="lg-hero" aria-label="Apresentação">
          <span className="lg-eyebrow">OBRIX</span>
          <h2>Gestão de obras<br /><em>mais eficiente.</em></h2>
          <p>Planejamento, execução e <br />controle em um só lugar.</p>
          <ul className="lg-feats">
            <li><span><BarChart3 size={22} /></span>Acompanhe<br />o progresso</li>
            <li><span><Users size={22} /></span>Organize<br />a equipe</li>
            <li><span><FileText size={22} /></span>Tenha o controle<br />em tempo real</li>
          </ul>
        </section>

        <form className="lg-card" onSubmit={enviar}>
          <span className="logo-crop lg-logo"><img src={BASE + 'assets/obrix-logo.jpg'} alt="Obrix — Gestão inteligente de obras" /></span>
          <h1>{t.titulo}</h1>
          <p className="lg-sub">{t.sub}</p>

          <div className="lg-field">
            <label htmlFor="lg-email">E-mail</label>
            <div className="lg-input">
              <Mail size={18} />
              <input id="lg-email" type="email" required autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" />
            </div>
          </div>

          {modo !== 'recuperar' && (
            <div className="lg-field">
              <label htmlFor="lg-senha">Senha</label>
              <div className="lg-input">
                <Lock size={18} />
                <input id="lg-senha" type={ver ? 'text' : 'password'} required minLength={6}
                  autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
                  value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />
                <button type="button" className="lg-eye" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}>
                  {ver ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
              </div>
            </div>
          )}

          {modo === 'entrar' && (
            <div className="lg-row">
              <label className="lg-check"><input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} /> Lembrar de mim</label>
              <button type="button" className="lg-link" onClick={() => trocar('recuperar')}>Esqueci a senha</button>
            </div>
          )}

          {msg && <div className={'alert ' + (msg.tipo === 'erro' ? 'alert-danger' : 'alert-ok')} role="alert">{msg.texto}</div>}

          <button className="lg-btn" disabled={busy}>
            {busy ? 'Aguarde…' : <>{t.botao} <ArrowRight size={20} /></>}
          </button>

          <div className="lg-foot">
            {modo === 'entrar'
              ? <>Não tem uma conta? <button type="button" className="lg-link" onClick={() => trocar('criar')}>Criar conta</button></>
              : <>Já tem conta? <button type="button" className="lg-link" onClick={() => trocar('entrar')}>Entrar</button></>}
          </div>
        </form>
      </div>
      <footer className="lg-copy">OBRIX &nbsp;•&nbsp; GESTÃO INTELIGENTE DE OBRAS</footer>
    </div>
  );
}

/** Ao abrir o sistema (ou entrar), sempre começa na Visão Geral — exceto em links compartilhados (#v / #p). */
function IrParaInicio() {
  const nav = useNavigate();
  useEffect(() => {
    if (!/^#[vp]=/.test(window.location.hash)) nav('/', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** Exige login quando o Supabase está configurado. Link de PMO (#v=…) abre sem login. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [publico] = useState(() => /^#v=/.test(window.location.hash));
  const [sessao, setSessao] = useState<Session | null | undefined>(supabaseAtivo ? undefined : null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      // "Lembrar de mim" desmarcado: a sessão vale só enquanto o navegador ficar aberto
      let esquecer = false;
      try { esquecer = !!data.session && localStorage.getItem(K_LEMBRAR) === '0' && !sessionStorage.getItem(K_SESSAO); } catch { /* ok */ }
      if (esquecer) { await supabase!.auth.signOut(); setSessao(null); } else setSessao(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_ev, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabaseAtivo || publico) return <AppProvider userId={null} email={null} onSignOut={null}><IrParaInicio />{children}</AppProvider>;
  if (sessao === undefined) return <div className="lg-page"><div className="lg-shade" /><div className="lg-loading">Carregando…</div></div>;
  if (!sessao) return <Login />;
  return (
    <AppProvider key={sessao.user.id} userId={sessao.user.id} email={sessao.user.email ?? ''}
      onSignOut={async () => {
        ['obrix-ac21-v1', 'obrix-cronos-v1', 'obrix-owner', 'cronograma-obra-v2'].forEach((k) => localStorage.removeItem(k));
        await supabase!.auth.signOut();
      }}>
      <IrParaInicio />
      {children}
    </AppProvider>
  );
}
