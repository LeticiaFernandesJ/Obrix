import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Download, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { supabase, supabaseAtivo } from '../lib/supabase';
import { AppProvider } from '../store/AppStore';
import OrgGate from './OrgGate';
import { useInstalar } from '../lib/pwa';
import { Modal } from './ui';
import { erroDeSenha } from '../lib/equipe';

const BASE = import.meta.env.BASE_URL;
const K_LEMBRAR = 'obrix-lembrar';
const K_SESSAO = 'obrix-sessao';

function traduzir(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar (veja a caixa de entrada e o spam).';
  if (m.includes('already registered')) return 'Este e-mail já tem cadastro. Use "Entrar".';
  if (m.includes('password should be') || m.includes('weak password')) return 'Senha fraca. Use pelo menos 8 caracteres, com letras e números.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Aguarde alguns minutos.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sem conexão com o servidor. Verifique a internet.';
  return msg;
}

type Modo = 'entrar' | 'criar' | 'recuperar';
const TEXTOS: Record<Modo, { antes: string; destaque: string; sub: string; botao: string }> = {
  entrar: { antes: 'Entre na ', destaque: 'sua conta', sub: 'Acesse e continue acompanhando suas obras.', botao: 'Entrar' },
  criar: { antes: 'Crie ', destaque: 'sua conta', sub: 'Cadastre-se para guardar suas obras e cronogramas com segurança.', botao: 'Criar conta' },
  recuperar: { antes: 'Recupere ', destaque: 'sua senha', sub: 'Informe seu e-mail e enviaremos um link para redefinir a senha.', botao: 'Enviar link' },
};

function BotaoBaixarApp() {
  const { podeInstalar, instalado, instalarNoIos, instalar } = useInstalar();
  const [ajuda, setAjuda] = useState(false);
  if (instalado) return null;
  return (
    <>
      <button type="button" className="lg-app" onClick={() => (podeInstalar ? void instalar() : setAjuda(true))}>
        <Download size={22} /> Baixar app
      </button>
      {ajuda && (
        <Modal title="Instalar o Obrix" onClose={() => setAjuda(false)} footer={<button className="btn btn-primary" onClick={() => setAjuda(false)}>Entendi</button>}>
          {instalarNoIos ? (
            <p>No iPhone/iPad: toque em <b>Compartilhar</b> (o quadrado com a seta) e depois em <b>Adicionar à Tela de Início</b>.</p>
          ) : (
            <>
              <p>No <b>Chrome ou Edge</b>: clique no ícone de instalar na barra de endereço, ou abra o menu <b>⋮</b> e escolha <b>Instalar Obrix</b> (no celular: <b>Adicionar à tela inicial</b>).</p>
              <p style={{ fontSize: 12.5 }}>Se a opção não aparecer, abra o endereço do sistema em https e atualize a página.</p>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

function Login() {
  const [modo, setModo] = useState<Modo>('entrar');
  const [nome, setNome] = useState('');
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
        const fraca = erroDeSenha(senha);
        if (fraca) { setMsg({ tipo: 'erro', texto: fraca }); setBusy(false); return; }
        const nomeLimpo = nome.trim().split(/\s+/).join(' ');
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password: senha,
          options: { emailRedirectTo: location.origin + BASE, data: { nome: nomeLimpo, full_name: nomeLimpo } },
        });
        if (error) setMsg({ tipo: 'erro', texto: traduzir(error.message) });
        else if (!data.session) setMsg({ tipo: 'ok', texto: 'Cadastro criado! Enviamos um e-mail de confirmação. Clique no link e depois volte para entrar.' });
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
          <span className="lg-eyebrow">Gestão de obras</span>
          <h2>Mais <em>eficiente.</em></h2>
          <p>Organize suas obras, acompanhe o progresso e construa melhores resultados.</p>
          <BotaoBaixarApp />
        </section>

        <form className="lg-card" onSubmit={enviar}>
          <span className="logo-crop lg-logo"><img src={BASE + 'assets/obrix-logo.jpg'} alt="Obrix - Gestão inteligente de obras" /></span>
          <h1>{t.antes}<em>{t.destaque}</em></h1>
          <p className="lg-sub">{t.sub}</p>

          {modo === 'criar' && (
            <div className="lg-field">
              <label htmlFor="lg-nome">Nome completo</label>
              <div className="lg-input">
                <User size={18} />
                <input id="lg-nome" type="text" required minLength={3} autoComplete="name" value={nome}
                  onChange={(e) => setNome(e.target.value)} placeholder="Seu nome completo" />
              </div>
            </div>
          )}

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
                <input id="lg-senha" type={ver ? 'text' : 'password'} required minLength={modo === 'criar' ? 8 : undefined}
                  autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
                  value={senha} onChange={(e) => setSenha(e.target.value)} placeholder={modo === 'criar' ? 'Mínimo 8, com letras e números' : 'Sua senha'} />
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

/** Tela exibida quando a pessoa chega pelo link de "Esqueci a senha". */
function NovaSenha({ onFim }: { onFim: () => void }) {
  const [senha, setSenha] = useState('');
  const [conf, setConf] = useState('');
  const [ver, setVer] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault(); if (!supabase) return;
    const fraca = erroDeSenha(senha);
    if (fraca) { setMsg(fraca); return; }
    if (senha !== conf) { setMsg('As senhas não conferem.'); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setBusy(false);
    if (error) setMsg(traduzir(error.message)); else onFim();
  };
  return (
    <div className="lg-page" style={{ backgroundImage: `url(${BASE}assets/login-bg.jpg)` }}>
      <div className="lg-shade" />
      <div className="lg-inner" style={{ justifyContent: 'center' }}>
        <form className="lg-card" onSubmit={salvar}>
          <span className="logo-crop lg-logo"><img src={BASE + 'assets/obrix-logo.jpg'} alt="Obrix" /></span>
          <h1>Criar nova senha</h1>
          <p className="lg-sub">Escolha uma nova senha para acessar sua conta.</p>
          <div className="lg-field"><label htmlFor="ns-1">Nova senha</label>
            <div className="lg-input"><Lock size={18} />
              <input id="ns-1" type={ver ? 'text' : 'password'} required minLength={8} autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />
              <button type="button" className="lg-eye" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}>{ver ? <Eye size={18} /> : <EyeOff size={18} />}</button>
            </div></div>
          <div className="lg-field"><label htmlFor="ns-2">Repita a senha</label>
            <div className="lg-input"><Lock size={18} />
              <input id="ns-2" type={ver ? 'text' : 'password'} required minLength={8} autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} placeholder="Repita a nova senha" />
            </div></div>
          {msg && <div className="alert alert-danger" role="alert">{msg}</div>}
          <button className="lg-btn" disabled={busy}>{busy ? 'Aguarde…' : <>Salvar nova senha <ArrowRight size={20} /></>}</button>
        </form>
      </div>
    </div>
  );
}

const K_INICIO = 'obrix-inicio-feito';

/**
 * Ao abrir o sistema ou entrar, começa na Visão Geral (exceto em links compartilhados, #v / #p).
 * Atualizar a página (F5) mantém a tela em que a pessoa está: a marca fica na aba e some ao sair ou fechar a aba.
 */
function IrParaInicio() {
  const nav = useNavigate();
  useEffect(() => {
    let jaEntrou = false;
    try { jaEntrou = sessionStorage.getItem(K_INICIO) === '1'; sessionStorage.setItem(K_INICIO, '1'); } catch { /* sem armazenamento: vai para o início */ }
    if (jaEntrou || /^#[vp]=/.test(window.location.hash)) return;
    nav('/', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/**
 * Sem internet e com o token vencido, o Supabase não consegue renovar a sessão. Se este aparelho já
 * tinha entrado antes, deixamos abrir com os dados guardados (as alterações sobem quando a rede voltar).
 */
function sessaoOffline(): Session | null {
  if (typeof navigator !== 'undefined' && navigator.onLine) return null;
  try {
    const k = Object.keys(localStorage).find((x) => /^sb-.+-auth-token$/.test(x));
    const u = k ? (JSON.parse(localStorage.getItem(k) || 'null') as { user?: Session['user'] } | null)?.user : null;
    return u?.id ? ({ user: u, access_token: '', refresh_token: '', expires_in: 0, token_type: 'bearer' } as Session) : null;
  } catch { return null; }
}

/** Apaga do navegador os dados em cache (usado ao sair, para não deixar nada em computador compartilhado). */
function limparDadosLocais() {
  try { sessionStorage.removeItem(K_INICIO); } catch { /* ok */ }
  try {
    Object.keys(localStorage)
      .filter((k) => /^(obrix-ac21-v1|obrix-cronos-v1|obrix-org-ativa|obrix-owner|cronograma-obra-v2)/.test(k))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* ok */ }
}

/** Exige login quando o Supabase está configurado. Link de PMO (#v=…) abre sem login. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [publico] = useState(() => /^#v=/.test(window.location.hash));
  const [sessao, setSessao] = useState<Session | null | undefined>(supabaseAtivo ? undefined : null);
  const [recuperando, setRecuperando] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      // "Lembrar de mim" desmarcado: a sessão vale só enquanto o navegador ficar aberto
      let esquecer = false;
      try { esquecer = !!data.session && localStorage.getItem(K_LEMBRAR) === '0' && !sessionStorage.getItem(K_SESSAO); } catch { /* ok */ }
      if (esquecer) { await supabase!.auth.signOut(); setSessao(null); }
      else setSessao(data.session ?? sessaoOffline());
    });
    const { data } = supabase.auth.onAuthStateChange((ev, s) => {
      if (ev === 'PASSWORD_RECOVERY') setRecuperando(true);
      if (!s && ev === 'SIGNED_OUT') { try { sessionStorage.removeItem(K_INICIO); } catch { /* ok */ } }
      setSessao(s ?? (ev === 'TOKEN_REFRESHED' || ev === 'INITIAL_SESSION' ? sessaoOffline() : null));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabaseAtivo || publico) return <AppProvider userId={null} email={null} onSignOut={null}><IrParaInicio />{children}</AppProvider>;
  if (sessao === undefined) return <div className="lg-page"><div className="lg-shade" /><div className="lg-loading">Carregando…</div></div>;
  if (!sessao) return <Login />;
  if (recuperando) return <NovaSenha onFim={() => setRecuperando(false)} />;
  return (
    <OrgGate key={sessao.user.id} userId={sessao.user.id} email={sessao.user.email ?? ''}
      onSignOut={async () => {
        limparDadosLocais();
        await supabase!.auth.signOut();
      }}>
      <IrParaInicio />
      {children}
    </OrgGate>
  );
}
