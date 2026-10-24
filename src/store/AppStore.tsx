import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  type Compra, type DB, type Historico, type Item, type Obra, dbVazio, fmt, sanitizarDB,
} from '../lib/ac21';
import {
  type Calc, type Cal, type Estado, calcular, desempacotar, makeCal, normalizarEstado, novoEstado,
} from '../lib/schedule';
import { supabase } from '../lib/supabase';

const K_DB = 'obrix-ac21-v1';
const K_CRONO = 'cronograma-obra-v2'; // legado (cronograma único)
const K_CRONOS = 'obrix-cronos-v1';
const K_TEMA = 'obrix-tema';
const K_OWNER = 'obrix-owner';

export type StatusNuvem = 'local' | 'carregando' | 'salvando' | 'salvo' | 'erro' | 'conflito';

interface Ctx {
  db: DB;
  obraAtivaId: number | null;
  obraAtual: Obra | null;
  cronos: Record<string, Estado>;
  exportarTudo: () => unknown;
  setObraAtiva: (id: number | null) => void;
  salvarObra: (dados: Omit<Obra, 'id' | 'itens'>, id: number | null) => void;
  excluirObra: (id: number) => void;
  salvarItem: (obraId: number, item: Omit<Item, 'id'>, id: number | null) => void;
  excluirItem: (obraId: number, id: number) => void;
  salvarCompra: (c: Omit<Compra, 'id'>, id: number | null) => void;
  excluirCompra: (id: number) => void;
  registrarHistorico: (tipo: string, icone: string, texto: string) => void;
  importarDB: (dados: unknown) => boolean;

  crono: Estado;
  cal: Cal;
  calc: Calc[];
  updateCrono: (fn: (S: Estado, cal: Cal, calcAtual: Calc[]) => void) => void;
  carregarCrono: (obj: Partial<Estado> | null) => void;
  readOnly: boolean;

  usuario: string | null;
  sair: (() => Promise<void>) | null;
  nuvem: StatusNuvem;
  recarregarNuvem: () => void;

  tema: 'light' | 'dark';
  alternarTema: () => void;
  toast: (msg: string) => void;
  toastMsg: string | null;
}

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp fora do provider');
  return c;
};

function lerJSON<T>(k: string): T | null {
  try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : null; } catch { return null; }
}
function gravar(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } }

interface ProviderProps { children: ReactNode; userId: string | null; email: string | null; onSignOut: (() => Promise<void>) | null }

export function AppProvider({ children, userId, email, onSignOut }: ProviderProps) {
  // cache local de outra conta nunca é aproveitado
  if (userId) {
    const dono = (() => { try { return localStorage.getItem(K_OWNER); } catch { return null; } })();
    if (dono && dono !== userId) { [K_DB, K_CRONOS, K_CRONO].forEach((k) => { try { localStorage.removeItem(k); } catch { /* ok */ } }); }
  }
  const [db, setDb] = useState<DB>(() => {
    return sanitizarDB(lerJSON<DB>(K_DB)) ?? dbVazio();
  });
  const [obraAtivaId, setObraAtiva] = useState<number | null>(null);
  const [cronos, setCronos] = useState<Record<string, Estado>>(() => {
    const raw = lerJSON<Record<string, Partial<Estado>>>(K_CRONOS);
    const out: Record<string, Estado> = {};
    if (raw && typeof raw === 'object') Object.keys(raw).forEach((k) => { out[k] = normalizarEstado(raw[k]); });
    else {
      const legado = lerJSON<Partial<Estado>>(K_CRONO);
      if (legado && Array.isArray(legado.tarefas) && legado.tarefas.length) out.legacy = normalizarEstado(legado);
    }
    return out;
  });
  const [shared, setShared] = useState<Estado | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [tema, setTema] = useState<'light' | 'dark'>(() => {
    try { return localStorage.getItem(K_TEMA) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
  });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastT = useRef<number>();
  const roRef = useRef(false);
  roRef.current = readOnly;

  const obraAtual = db.obras.find((o) => o.id === obraAtivaId) ?? db.obras[0] ?? null;
  const chave = obraAtual ? String(obraAtual.id) : 'legacy';
  const semente = useMemo(() => {
    const E = novoEstado();
    if (obraAtual) {
      E.meta.nome = obraAtual.nome; E.meta.resp = obraAtual.responsavel;
      if (obraAtual.inicio) E.meta.inicio = obraAtual.inicio;
    }
    return E;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obraAtual?.id]);
  const crono: Estado = readOnly && shared ? shared : cronos[chave] ?? semente;
  const chaveRef = useRef(chave); chaveRef.current = chave;
  const sementeRef = useRef(semente); sementeRef.current = semente;
  const cal = useMemo(() => makeCal(crono), [crono]);
  const calc = useMemo(() => calcular(crono, cal), [crono, cal]);
  const calcRef = useRef(calc); calcRef.current = calc;
  const calRef = useRef(cal); calRef.current = cal;

  useEffect(() => { gravar(K_DB, db); }, [db]);
  useEffect(() => { gravar(K_CRONOS, cronos); }, [cronos]);
  /* cronograma antigo (único) é adotado pela primeira obra */
  useEffect(() => {
    if (cronos.legacy && db.obras.length) {
      setCronos((c) => { const { legacy, ...resto } = c; return { ...resto, [String(db.obras[0].id)]: legacy }; });
    }
  }, [cronos.legacy, db.obras]);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema);
    try { localStorage.setItem(K_TEMA, tema); } catch { /* ok */ }
  }, [tema]);

  /* ---------- Sincronização com o Supabase ---------- */
  const [nuvem, setNuvem] = useState<StatusNuvem>(userId && supabase ? 'carregando' : 'local');
  const nuvemRef = useRef<StatusNuvem>(nuvem); nuvemRef.current = nuvem;
  const revRef = useRef(0);
  const prontoRef = useRef(false);
  const pularRef = useRef(false);
  const ultimoRef = useRef('');
  const salvandoRef = useRef(false);
  const sujoRef = useRef(false);
  const payload = useMemo(() => JSON.stringify({ ...db, cronogramas: cronos }), [db, cronos]);
  const payloadRef = useRef(payload); payloadRef.current = payload;

  const salvarAgora = useCallback(async () => {
    if (!supabase || !userId || !prontoRef.current || nuvemRef.current === 'conflito') return;
    if (salvandoRef.current) { sujoRef.current = true; return; }
    salvandoRef.current = true; sujoRef.current = false;
    const txt = payloadRef.current;
    setNuvem('salvando');
    try {
      const dados = JSON.parse(txt);
      if (revRef.current === 0) {
        const { error } = await supabase.from('obrix_dados').insert({ user_id: userId, data: dados, revision: 1 });
        if (error) { setNuvem(error.code === '23505' ? 'conflito' : 'erro'); return; }
        revRef.current = 1;
      } else {
        const { data, error } = await supabase.from('obrix_dados')
          .update({ data: dados, revision: revRef.current + 1, updated_at: new Date().toISOString() })
          .eq('user_id', userId).eq('revision', revRef.current).select('revision');
        if (error) { setNuvem('erro'); return; }
        if (!data || !data.length) { setNuvem('conflito'); return; }
        revRef.current = data[0].revision as number;
      }
      ultimoRef.current = txt;
      setNuvem('salvo');
    } catch { setNuvem('erro'); }
    finally {
      salvandoRef.current = false;
      if (sujoRef.current && (nuvemRef.current as StatusNuvem) !== 'conflito' && payloadRef.current !== ultimoRef.current) void salvarAgora();
    }
  }, [userId]);

  const carregarNuvem = useCallback(async () => {
    if (!supabase || !userId) return;
    setNuvem('carregando'); prontoRef.current = false;
    const { data, error } = await supabase.from('obrix_dados').select('data,revision').eq('user_id', userId).maybeSingle();
    if (error) { setNuvem('erro'); return; }
    if (data) {
      const raw = (data.data ?? {}) as { cronogramas?: Record<string, Partial<Estado>> };
      const limpo = sanitizarDB(raw) ?? dbVazio();
      const ids = new Set(limpo.obras.map((o) => String(o.id)));
      const novo: Record<string, Estado> = {};
      Object.keys(raw.cronogramas ?? {}).forEach((k) => { if (ids.has(k)) novo[k] = normalizarEstado(raw.cronogramas![k]); });
      pularRef.current = true;
      setDb(limpo); setCronos(novo);
      revRef.current = data.revision as number;
      ultimoRef.current = '';
      prontoRef.current = true; setNuvem('salvo');
    } else {
      revRef.current = 0; prontoRef.current = true; setNuvem('salvo');
      // primeiro acesso: leva para a nuvem o que já existia neste navegador
      if (db.obras.length || Object.keys(cronos).length) { ultimoRef.current = ''; void salvarAgora(); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, salvarAgora]);

  useEffect(() => {
    if (!userId || !supabase) return;
    try { localStorage.setItem(K_OWNER, userId); } catch { /* ok */ }
    void carregarNuvem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId || !supabase || !prontoRef.current) return;
    if (pularRef.current) { pularRef.current = false; return; }
    if (payload === ultimoRef.current || nuvemRef.current === 'conflito') return;
    setNuvem('salvando');
    const t = window.setTimeout(() => void salvarAgora(), 800);
    return () => window.clearTimeout(t);
  }, [payload, userId, salvarAgora]);

  useEffect(() => {
    if (!userId) return;
    const h = () => { if (document.visibilityState === 'hidden' && payloadRef.current !== ultimoRef.current) void salvarAgora(); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [userId, salvarAgora]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  /* link compartilhado (#v=… somente leitura | #p=… editável) */
  useEffect(() => {
    const carregarHash = () => {
    const m = /^#(v|p)=(.+)$/s.exec(window.location.hash);
    if (!m) return;
    desempacotar(m[2]).then((obj) => {
      const est = normalizarEstado(obj);
      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      const ro = m[1] === 'v';
      if (ro) { setShared(est); setReadOnly(true); }
      else setCronos((c) => ({ ...c, [chaveRef.current]: est }));
      window.history.replaceState(null, '', base + (ro ? '/painel' + window.location.hash : '/cronograma'));
      window.dispatchEvent(new PopStateEvent('popstate'));
    }).catch(() => alert('Não consegui ler o link — ele pode ter sido cortado pelo e-mail. Peça o arquivo .json.'));
  };
    carregarHash();
    window.addEventListener('hashchange', carregarHash);
    return () => window.removeEventListener('hashchange', carregarHash);
  }, []);

  /* ---------- AC21 ---------- */
  const mutarDb = useCallback((fn: (d: DB) => void) => {
    setDb((prev) => {
      const d: DB = JSON.parse(JSON.stringify(prev));
      fn(d);
      return d;
    });
  }, []);
  const hist = (d: DB, tipo: string, icone: string, texto: string) => {
    d.historico.unshift({ id: ++d.nextId, ts: new Date().toISOString(), tipo, icone, texto, user: 'Gerente' } as Historico);
    if (d.historico.length > 500) d.historico.pop();
  };

  const registrarHistorico = useCallback((tipo: string, icone: string, texto: string) => mutarDb((d) => hist(d, tipo, icone, texto)), [mutarDb]);

  const salvarObra: Ctx['salvarObra'] = useCallback((dados, id) => mutarDb((d) => {
    if (id == null) {
      d.obras.push({ id: ++d.nextId, itens: [], ...dados });
      hist(d, 'obra_criada', '🏗️', `Obra "${dados.nome}" cadastrada · AC21: ${fmt(dados.ac21)}`);
    } else {
      const o = d.obras.find((x) => x.id === id); if (!o) return;
      const ant = o.ac21; Object.assign(o, dados);
      if (ant !== dados.ac21) hist(d, 'ac21_alterado', '💰', `AC21 de "${dados.nome}" alterado: ${fmt(ant)} → ${fmt(dados.ac21)}`);
      else hist(d, 'obra_editada', '✏️', `Dados da obra "${dados.nome}" atualizados`);
    }
  }), [mutarDb]);

  const excluirObra = useCallback((id: number) => {
    mutarDb((d) => {
      const o = d.obras.find((x) => x.id === id); if (!o) return;
      hist(d, 'obra_excluida', '🗑️', `Obra "${o.nome}" removida`);
      d.obras = d.obras.filter((x) => x.id !== id);
      d.compras = d.compras.filter((c) => c.obraId !== id);
    });
    setObraAtiva((cur) => (cur === id ? null : cur));
    setCronos((c) => { const { [String(id)]: _removido, ...resto } = c; return resto; });
  }, [mutarDb]);

  const salvarItem: Ctx['salvarItem'] = useCallback((obraId, item, id) => mutarDb((d) => {
    const o = d.obras.find((x) => x.id === obraId); if (!o) return;
    if (id == null) {
      o.itens.push({ id: ++d.nextId, ...item });
      hist(d, 'item_adicionado', '➕', `Item "${item.desc}" adicionado à obra ${o.codigo} · Pago: ${fmt(item.pago)}`);
    } else {
      const idx = o.itens.findIndex((i) => i.id === id); if (idx < 0) return;
      const ant = o.itens[idx];
      hist(d, 'item_editado', '✏️', ant.pago !== item.pago
        ? `Item "${item.desc}" atualizado · Pago: ${fmt(ant.pago)} → ${fmt(item.pago)}`
        : `Item "${item.desc}" editado na obra ${o.codigo}`);
      o.itens[idx] = { id, ...item };
    }
  }), [mutarDb]);

  const excluirItem = useCallback((obraId: number, id: number) => mutarDb((d) => {
    const o = d.obras.find((x) => x.id === obraId); if (!o) return;
    const it = o.itens.find((i) => i.id === id); if (!it) return;
    hist(d, 'item_excluido', '🗑️', `Item "${it.desc}" removido da obra ${o.codigo}`);
    o.itens = o.itens.filter((i) => i.id !== id);
  }), [mutarDb]);

  const salvarCompra: Ctx['salvarCompra'] = useCallback((c, id) => mutarDb((d) => {
    const obra = d.obras.find((o) => o.id === c.obraId);
    if (id == null) {
      d.compras.push({ id: ++d.nextId, ...c });
      hist(d, 'compra', '🛒', `Compra "${c.desc}" registrada — ${c.forn} · ${fmt(c.total)} · ${obra?.codigo || ''}`);
    } else {
      const idx = d.compras.findIndex((x) => x.id === id); if (idx < 0) return;
      d.compras[idx] = { id, ...c };
      hist(d, 'compra_editada', '✏️', `Compra "${c.desc}" atualizada · ${fmt(c.total)}`);
    }
  }), [mutarDb]);

  const excluirCompra = useCallback((id: number) => mutarDb((d) => {
    const c = d.compras.find((x) => x.id === id); if (!c) return;
    hist(d, 'compra_excluida', '🗑️', `Compra "${c.desc}" removida`);
    d.compras = d.compras.filter((x) => x.id !== id);
  }), [mutarDb]);

  const importarDB = useCallback((dados: unknown) => {
    const limpo = sanitizarDB(dados);
    if (!limpo) return false;
    limpo.historico.unshift({ id: ++limpo.nextId, ts: new Date().toISOString(), tipo: 'restore', icone: '📂', texto: 'Backup carregado com sucesso', user: 'Gerente' });
    setDb(limpo);
    const cr = (dados as { cronogramas?: Record<string, Partial<Estado>> }).cronogramas;
    if (cr && typeof cr === 'object') {
      const ids = new Set(limpo.obras.map((o) => String(o.id)));
      const novo: Record<string, Estado> = {};
      Object.keys(cr).forEach((k) => { if (ids.has(k) || k === 'legacy') novo[k] = normalizarEstado(cr[k]); });
      setCronos(novo);
    }
    return true;
  }, []);
  const exportarTudo = useCallback(() => ({ ...db, cronogramas: cronos }), [db, cronos]);

  /* ---------- Cronograma ---------- */
  const updateCrono: Ctx['updateCrono'] = useCallback((fn) => {
    if (roRef.current) return;
    const k = chaveRef.current;
    setCronos((prev) => {
      const S: Estado = JSON.parse(JSON.stringify(prev[k] ?? sementeRef.current));
      fn(S, calRef.current, calcRef.current);
      return { ...prev, [k]: S };
    });
  }, []);
  const carregarCrono = useCallback((obj: Partial<Estado> | null) => {
    const est = normalizarEstado(obj);
    setCronos((prev) => ({ ...prev, [chaveRef.current]: est }));
  }, []);

  const value: Ctx = {
    db, obraAtivaId, obraAtual, cronos, exportarTudo, setObraAtiva, salvarObra, excluirObra, salvarItem, excluirItem, salvarCompra, excluirCompra,
    registrarHistorico, importarDB,
    crono, cal, calc, updateCrono, carregarCrono, readOnly,
    usuario: email, sair: onSignOut, nuvem, recarregarNuvem: () => { void carregarNuvem(); },
    tema, alternarTema: () => setTema((t) => (t === 'dark' ? 'light' : 'dark')),
    toast, toastMsg,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
