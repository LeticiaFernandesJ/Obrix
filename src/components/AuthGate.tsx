import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseAtivo } from '../lib/supabase';
import { AppProvider } from '../store/AppStore';

const BASE = import.meta.env.BASE_URL;

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

function Login() {
  const [modo, setModo] = useState<'entrar' | 'criar' | 'recuperar'>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault(); if (!supabase) return;
    setBusy(true); setMsg(null);
    try {
      if (modo === 'entrar') {
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
    <div className="login-wrap">
      <form className="login-card" onSubmit={enviar}>
        <span className="logo-crop" style={{ background: '#fcfcfa', borderRadius: 10 }}><img src={BASE + 'assets/obrix-logo.jpg'} alt="Obrix — Gestão inteligente de obras" /></span>
        <h1>{modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Recuperar senha'}</h1>
        <div className="form-group"><label htmlFor="lg-email">E-mail</label>
          <input id="lg-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" /></div>
        {modo !== 'recuperar' && (
          <div className="form-group"><label htmlFor="lg-senha">Senha</label>
            <input id="lg-senha" type="password" required minLength={6} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
              value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="mínimo 6 caracteres" /></div>
        )}
        {msg && <div className={'alert ' + (msg.tipo === 'erro' ? 'alert-danger' : 'alert-ok')}>{msg.texto}</div>}
        <button className="btn btn-primary" disabled={busy} style={{ width: '100%', padding: 11 }}>
          {busy ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Enviar link'}
        </button>
        <div className="login-links">
          {modo !== 'entrar' && <button type="button" className="link-btn" onClick={() => { setModo('entrar'); setMsg(null); }}>Já tenho conta</button>}
          {modo === 'entrar' && <button type="button" className="link-btn" onClick={() => { setModo('criar'); setMsg(null); }}>Criar conta</button>}
          {modo === 'entrar' && <button type="button" className="link-btn" onClick={() => { setModo('recuperar'); setMsg(null); }}>Esqueci a senha</button>}
        </div>
      </form>
    </div>
  );
}

/** Exige login quando o Supabase está configurado. Link de PMO (#v=…) abre sem login. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [publico] = useState(() => /^#v=/.test(window.location.hash));
  const [sessao, setSessao] = useState<Session | null | undefined>(supabaseAtivo ? undefined : null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_ev, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabaseAtivo || publico) return <AppProvider userId={null} email={null} onSignOut={null}>{children}</AppProvider>;
  if (sessao === undefined) return <div className="login-wrap"><div className="login-card" style={{ textAlign: 'center' }}>Carregando…</div></div>;
  if (!sessao) return <Login />;
  return (
    <AppProvider key={sessao.user.id} userId={sessao.user.id} email={sessao.user.email ?? ''}
      onSignOut={async () => {
        ['obrix-ac21-v1', 'obrix-cronos-v1', 'obrix-owner', 'cronograma-obra-v2'].forEach((k) => localStorage.removeItem(k));
        await supabase!.auth.signOut();
      }}>
      {children}
    </AppProvider>
  );
}
