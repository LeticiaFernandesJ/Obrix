import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  type Compra, type DB, type Historico, type Item, type Obra, dbVazio, fmt, novoId, sanitizarDB,
} from '../lib/ac21';
import {
  type Calc, type Cal, type Estado, type Tarefa, calcular, desempacotar, makeCal, normalizarEstado, novoEstado,
} from '../lib/schedule';
import { supabase } from '../lib/supabase';
import { useDialogo } from '../components/Dialogo';
import { ConflitoErro, type Snap, type Tabela, type Versoes, TABELAS, deLinhas, enviarMudancas, lerNuvem, paraLinhas, snapDe, snapVazio, versoesDe } from '../lib/nuvem';
import { type Area, type Org, type Papel, type Permissoes, podeAlterar, podeEditarArea, podeVerArea, soMinhasTarefas } from '../lib/equipe';
import { validarEdicaoMinhas } from '../lib/minhasTarefas';
import { type BackupCrono, empilharBackup, trocarCronoDaObra } from '../lib/importacao';

const K_DB = 'obrix-ac21-v1';
const K_CRONO = 'cronograma-obra-v2'; // legado (cronograma único)
const K_CRONOS = 'obrix-cronos-v1';
const K_BKP = 'obrix-crono-bkp-v1'; // cópias de segurança dos cronogramas, antes de substituir
const K_TEMA = 'obrix-tema';

export type StatusNuvem = 'local' | 'carregando' | 'salvando' | 'salvo' | 'erro';

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
  /** troca o cronograma de UMA obra (a ativa, ou a indicada em obraId), guardando antes uma cópia de segurança. false = não aplicou */
  carregarCrono: (obj: Partial<Estado> | null, opc?: { obraId?: number; motivo?: string }) => boolean;
  /** cópias de segurança do cronograma da obra ativa (as mais novas primeiro) */
  backupsCrono: BackupCrono[];
  restaurarCrono: (ts: string) => void;
  readOnly: boolean;

  /* equipe */
  /** quem está logado (null no uso local) */
  userId: string | null;
  orgId: string | null;
  orgNome: string;
  orgs: Org[];
  papel: Papel | null;
  permissoes: Permissoes | null;
  /** false para quem não altera nada (leitor, link somente leitura) */
  podeEditar: boolean;
  /** pode alterar esta área (obras, compras, cronograma)? */
  podeEditarArea: (area: Area) => boolean;
  /** só altera as tarefas em que é o responsável (nível "só as tarefas dela" no cronograma) */
  soMinhas: boolean;
  /** pode alterar esta tarefa? (tudo, ou só as próprias) */
  podeEditarTarefa: (t: Tarefa) => boolean;
  /** enxerga esta área? (compras, cronograma e histórico podem ficar escondidos) */
  podeVerArea: (area: Area) => boolean;
  trocarOrg: (id: string) => void;
  recarregarOrgs: () => void;

  usuario: string | null;
  /** nome completo de quem está logado (vazio se não informou) */ nomeUsuario: string;
  sair: (() => Promise<void>) | null;
  nuvem: StatusNuvem;
  recarregarNuvem: () => void;
  tentarSincronizar: () => void;

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

interface ProviderProps {
  children: ReactNode; userId: string | null; email: string | null; nome?: string; onSignOut: (() => Promise<void>) | null;
  /** link público sem login: não lê nem grava os dados guardados no navegador (são de quem entrou antes) */
  semCache?: boolean;
  orgId?: string | null; papel?: Papel | null; permissoes?: Permissoes | null; orgs?: Org[]; trocarOrg?: (id: string) => void; recarregarOrgs?: () => void;
}

export function AppProvider({ children, userId = null, email, nome = '', onSignOut, semCache = false, orgId = null, papel = null, permissoes = null, orgs = [], trocarOrg, recarregarOrgs }: ProviderProps) {
  const { confirmar, avisar } = useDialogo();
  // as janelas de diálogo são chamadas de dentro de callbacks e efeitos que não devem refazer-se a cada renderização
  const confirmarRef = useRef(confirmar); confirmarRef.current = confirmar;
  const avisarRef = useRef(avisar); avisarRef.current = avisar;
  // cada organização tem o seu próprio cache no navegador
  const sufixo = orgId ? ':' + orgId : '';
  const kDb = K_DB + sufixo, kCronos = K_CRONOS + sufixo;
  const [db, setDb] = useState<DB>(() => {
    // dados guardados antes das equipes (sem sufixo) são aproveitados uma vez, na primeira organização
    if (semCache) return dbVazio();
    return sanitizarDB(lerJSON<DB>(kDb) ?? (orgId ? lerJSON<DB>(K_DB) : null)) ?? dbVazio();
  });
  const [obraAtivaId, setObraAtiva] = useState<number | null>(null);
  const [cronos, setCronos] = useState<Record<string, Estado>>(() => {
    if (semCache) return {};
    const raw = lerJSON<Record<string, Partial<Estado>>>(kCronos) ?? (orgId ? lerJSON<Record<string, Partial<Estado>>>(K_CRONOS) : null);
    const out: Record<string, Estado> = {};
    if (raw && typeof raw === 'object') Object.keys(raw).forEach((k) => { out[k] = normalizarEstado(raw[k]); });
    else {
      const legado = lerJSON<Partial<Estado>>(K_CRONO);
      if (legado && Array.isArray(legado.tarefas) && legado.tarefas.length) out.legacy = normalizarEstado(legado);
    }
    return out;
  });
  const kBkp = K_BKP + sufixo;
  const [backups, setBackups] = useState<Record<string, BackupCrono[]>>(() => {
    const b = semCache ? null : lerJSON<Record<string, BackupCrono[]>>(kBkp);
    return b && typeof b === 'object' && !Array.isArray(b) ? b : {};
  });
  const backupsRef = useRef(backups); backupsRef.current = backups;
  const carregarRef = useRef<Ctx['carregarCrono']>();
  const [shared, setShared] = useState<Estado | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [tema, setTema] = useState<'light' | 'dark'>(() => {
    try { return localStorage.getItem(K_TEMA) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
  });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastT = useRef<number>();
  const orgAtual = orgs.find((o) => o.id === orgId);
  const podeEditar = !readOnly && podeAlterar(papel, permissoes);
  const editaArea = (a: Area) => !readOnly && podeEditarArea(papel, permissoes, a);
  const veArea = (a: Area) => readOnly || podeVerArea(papel, permissoes, a);
  const soMinhas = !readOnly && soMinhasTarefas(papel, permissoes);
  const minhasRef = useRef(false); minhasRef.current = soMinhas;
  const userRef = useRef<string | null>(null); userRef.current = userId;
  const podeEditarTarefa = (t: Tarefa) => editaArea('cronograma') || (soMinhas && !!userId && t.respId === userId);
  const roRef = useRef(false);
  roRef.current = !podeEditar;
  const areaRef = useRef(editaArea);
  areaRef.current = editaArea;
  /** tabelas que esta pessoa pode gravar (o banco recusa as demais) */
  const tabelasRef = useRef<ReadonlySet<Tabela>>(new Set(TABELAS));
  tabelasRef.current = new Set<Tabela>([
    ...(editaArea('obras') ? (['obras', 'itens'] as Tabela[]) : []),
    ...(editaArea('compras') ? (['compras'] as Tabela[]) : []),
    ...(editaArea('cronograma') ? (['cronogramas', 'tarefas', 'medicoes'] as Tabela[]) : soMinhas ? (['tarefas'] as Tabela[]) : []),
    ...(podeEditar ? (['historico'] as Tabela[]) : []),
  ]);
  const autorRef = useRef(email ?? 'Gerente');
  autorRef.current = email ?? 'Gerente';

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

  useEffect(() => { if (!semCache) gravar(kDb, db); }, [db, kDb, semCache]);
  useEffect(() => { if (!semCache) gravar(kCronos, cronos); }, [cronos, kCronos, semCache]);
  useEffect(() => { if (!semCache) gravar(kBkp, backups); }, [backups, kBkp, semCache]);
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

  /* ---------- Sincronização com o Supabase (dados da organização) ---------- */
  const [nuvem, setNuvem] = useState<StatusNuvem>(orgId && supabase ? 'carregando' : 'local');
  const prontoRef = useRef(false);
  const snapRef = useRef<Snap>(snapVazio());
  const versoesRef = useRef<Versoes>(new Map()); // updated_at de cada linha como estava na nuvem quando li (detecta edição simultânea)
  const forcarRef = useRef(false);               // próxima gravação ignora o conflito (a pessoa escolheu manter a sua versão)
  const ultimoRef = useRef('');
  const salvandoRef = useRef(false);
  const sujoRef = useRef(false);
  const payload = useMemo(() => JSON.stringify({ db, cronos }), [db, cronos]);
  const estadoRef = useRef({ db, cronos, payload }); estadoRef.current = { db, cronos, payload };
  const baseRef = useRef(payload);          // estado com o qual a sincronização começou
  const editouSemNuvemRef = useRef(false);  // houve edição enquanto a nuvem não estava disponível (ex.: sem internet)
  const atualizarDepoisRef = useRef(false); // chegou novidade de outra pessoa enquanto havia alteração minha pendente
  const ultimoEnvioRef = useRef(0);         // quando terminei de enviar (ignora o "eco" do meu próprio envio)

  const atualizarDaNuvem = useCallback(async () => {
    if (!supabase || !orgId || !prontoRef.current) return;
    // alteração minha ainda não enviada: espera, para não perder nada
    if (salvandoRef.current || estadoRef.current.payload !== ultimoRef.current) { atualizarDepoisRef.current = true; return; }
    try {
      const L = await lerNuvem(supabase, orgId);
      if (salvandoRef.current || estadoRef.current.payload !== ultimoRef.current) { atualizarDepoisRef.current = true; return; }
      const r = deLinhas(L);
      const novo = JSON.stringify({ db: r.db, cronos: r.cronos });
      if (novo === ultimoRef.current) return;
      snapRef.current = snapDe(paraLinhas(r.db, r.cronos));
      versoesRef.current = versoesDe(L);
      ultimoRef.current = novo;
      setDb(r.db); setCronos(r.cronos);
    } catch (e) { console.error('Falha ao atualizar da nuvem', e); }
  }, [orgId]);

  const salvarAgora = useCallback(async () => {
    if (!supabase || !orgId || !prontoRef.current || roRef.current) return;
    if (salvandoRef.current) { sujoRef.current = true; return; }
    salvandoRef.current = true; sujoRef.current = false;
    const alvo = estadoRef.current;
    setNuvem('salvando');
    try {
      const forcar = forcarRef.current; forcarRef.current = false;
      await enviarMudancas(supabase, orgId, paraLinhas(alvo.db, alvo.cronos), snapRef.current, tabelasRef.current, { versoes: versoesRef.current, forcar });
      ultimoRef.current = alvo.payload;
      ultimoEnvioRef.current = Date.now();
      setNuvem('salvo');
    } catch (e) {
      if (e instanceof ConflitoErro) {
        // outra pessoa mexeu nas mesmas linhas: quem decide é quem está editando
        const manter = await confirmarRef.current(`Outra pessoa alterou ${e.linhas.length === 1 ? '1 registro' : e.linhas.length + ' registros'} que você também alterou, desde que você abriu a tela.\n\nManter a sua versão substitui o que ela fez. Usar a da nuvem descarta as suas alterações que ainda não foram enviadas.`, { titulo: 'Edição simultânea', confirmar: 'Manter a minha', cancelar: 'Usar a da nuvem' });
        if (manter) { forcarRef.current = true; sujoRef.current = true; }
        else {
          try {
            const L = await lerNuvem(supabase, orgId); const r = deLinhas(L);
            snapRef.current = snapDe(paraLinhas(r.db, r.cronos)); versoesRef.current = versoesDe(L);
            ultimoRef.current = JSON.stringify({ db: r.db, cronos: r.cronos });
            setDb(r.db); setCronos(r.cronos); setNuvem('salvo');
          } catch (e2) { console.error('Falha ao atualizar da nuvem', e2); setNuvem('erro'); }
        }
      } else { console.error('Falha ao sincronizar', e); setNuvem('erro'); }
    }
    finally {
      salvandoRef.current = false;
      if (sujoRef.current && estadoRef.current.payload !== ultimoRef.current) void salvarAgora();
      else if (atualizarDepoisRef.current && estadoRef.current.payload === ultimoRef.current) { atualizarDepoisRef.current = false; void atualizarDaNuvem(); }
    }
  }, [orgId, atualizarDaNuvem]);

  const carregarNuvem = useCallback(async () => {
    if (!supabase || !orgId) return;
    setNuvem('carregando'); prontoRef.current = false;
    try {
      const L = await lerNuvem(supabase, orgId);
      if (L.obras.length) {
        const r = deLinhas(L);
        snapRef.current = snapDe(paraLinhas(r.db, r.cronos));
        versoesRef.current = versoesDe(L);
        const local = estadoRef.current;
        const manterLocal = !roRef.current && editouSemNuvemRef.current &&
          (await confirmarRef.current('Você fez alterações neste aparelho enquanto estava sem conexão.\n\nEnviar essas alterações para a nuvem substitui o que está lá. Descartar usa os dados da nuvem.', { titulo: 'Alterações sem conexão', confirmar: 'Enviar as minhas', cancelar: 'Descartar e usar a nuvem' }));
        if (manterLocal) {
          await enviarMudancas(supabase, orgId, paraLinhas(local.db, local.cronos), snapRef.current, tabelasRef.current, { versoes: versoesRef.current, forcar: true });
          ultimoRef.current = local.payload;
        } else {
          ultimoRef.current = JSON.stringify({ db: r.db, cronos: r.cronos });
          setDb(r.db); setCronos(r.cronos);
        }
        editouSemNuvemRef.current = false;
      } else {
        // organização sem dados: aproveita o que já havia neste navegador (só quem pode alterar envia)
        const atual = estadoRef.current;
        snapRef.current = snapVazio();
        if (atual.db.obras.length && !roRef.current && areaRef.current('obras')) {
          await enviarMudancas(supabase, orgId, paraLinhas(atual.db, atual.cronos), snapRef.current, tabelasRef.current);
          // os dados antigos (sem organização) já subiram: não devem ir também para outra organização
          [K_DB, K_CRONOS, K_CRONO, K_BKP].forEach((k) => { try { localStorage.removeItem(k); } catch { /* ok */ } });
        }
        ultimoRef.current = atual.payload;
      }
      prontoRef.current = true; setNuvem('salvo');
    } catch (e) { console.error('Falha ao carregar da nuvem', e); setNuvem('erro'); }
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !supabase) return;
    void carregarNuvem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !supabase) return;
    if (!prontoRef.current) { if (payload !== baseRef.current && !roRef.current) editouSemNuvemRef.current = true; return; }
    if (payload === ultimoRef.current || roRef.current) return;
    setNuvem('salvando');
    const t = window.setTimeout(() => void salvarAgora(), 800);
    return () => window.clearTimeout(t);
  }, [payload, orgId, salvarAgora]);

  useEffect(() => {
    if (!orgId) return;
    const h = () => { if (document.visibilityState === 'hidden' && estadoRef.current.payload !== ultimoRef.current) void salvarAgora(); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [orgId, salvarAgora]);

  /* Quando outra pessoa altera os dados: avisos em tempo real + conferência a cada 45 s e ao voltar para a aba. */
  useEffect(() => {
    if (!orgId || !supabase) return;
    const sb = supabase;
    let t: number | undefined;
    const agendar = () => { window.clearTimeout(t); t = window.setTimeout(() => void atualizarDaNuvem(), 1200); };
    // meu próprio envio também gera avisos: ignora os que chegam logo depois dele
    const aoMudar = () => { if (Date.now() - ultimoEnvioRef.current > 3000) agendar(); };
    const canal = sb.channel('obrix-' + orgId);
    TABELAS.forEach((tabela) => canal.on('postgres_changes', { event: '*', schema: 'public', table: tabela, filter: `org_id=eq.${orgId}` }, aoMudar));
    canal.subscribe();
    const visivel = () => { if (document.visibilityState === 'visible') agendar(); };
    const ronda = window.setInterval(() => { if (document.visibilityState === 'visible') void atualizarDaNuvem(); }, 45000);
    document.addEventListener('visibilitychange', visivel);
    window.addEventListener('online', agendar);
    return () => {
      window.clearTimeout(t); window.clearInterval(ronda);
      document.removeEventListener('visibilitychange', visivel); window.removeEventListener('online', agendar);
      void sb.removeChannel(canal);
    };
  }, [orgId, atualizarDaNuvem]);

  /* Sair sem perder alterações: tenta enviar o que está pendente; se não der, pede confirmação. */
  const sairSeguro = useCallback(async () => {
    if (!onSignOut) return;
    if (supabase && orgId) {
      for (let i = 0; i < 4 && prontoRef.current && estadoRef.current.payload !== ultimoRef.current; i++) {
        if (salvandoRef.current) await new Promise((r) => setTimeout(r, 500)); else await salvarAgora();
      }
      const pendente = prontoRef.current ? estadoRef.current.payload !== ultimoRef.current : editouSemNuvemRef.current;
      if (pendente && !(await confirmar('Algumas alterações ainda não foram enviadas para a nuvem (sem conexão ou erro).\nSe sair agora, elas serão perdidas.', { titulo: 'Sair mesmo assim?', confirmar: 'Sair e perder', perigo: true }))) return;
    }
    await onSignOut();
  }, [onSignOut, orgId, salvarAgora, confirmar]);

  useEffect(() => {
    if (!orgId || !supabase) return;
    const h = (e: BeforeUnloadEvent) => {
      if (prontoRef.current && estadoRef.current.payload !== ultimoRef.current) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [orgId]);

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
    desempacotar(m[2]).then(async (obj) => {
      const est = normalizarEstado(obj);
      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      const ro = m[1] === 'v';
      if (ro) { setShared(est); setReadOnly(true); }
      else if (!roRef.current) {
        // um link recebido não pode trocar o cronograma sem a pessoa saber: mostra o destino e pede confirmação
        const obra = estadoRef.current.db.obras.find((o) => String(o.id) === chaveRef.current);
        const alvo = obra ? `da obra "${obra.nome}"` : 'aberto';
        const ok = await confirmarRef.current(`Este link quer substituir o cronograma ${alvo} por outro com ${est.tarefas.length} tarefas${est.meta.nome ? ` ("${est.meta.nome}")` : ''}.\n\nSó continue se você confia em quem enviou. Uma cópia do cronograma atual fica guardada.`, { titulo: 'Link com cronograma', confirmar: 'Substituir', cancelar: 'Não abrir', perigo: true });
        if (ok) carregarRef.current?.(est, { motivo: 'Antes de abrir um link editável' });
      }
      window.history.replaceState(null, '', base + (ro ? '/painel' + window.location.hash : '/cronograma'));
      window.dispatchEvent(new PopStateEvent('popstate'));
    }).catch((e: Error) => { void avisarRef.current(/expirou|grande demais/.test(e.message) ? e.message : 'Não consegui ler o link, ele pode ter sido cortado pelo e-mail. Peça o arquivo .json.'); });
  };
    carregarHash();
    window.addEventListener('hashchange', carregarHash);
    return () => window.removeEventListener('hashchange', carregarHash);
  }, []);

  /* ---------- AC21 ---------- */
  const mutarDb = useCallback((fn: (d: DB) => void, area?: Area) => {
    if (roRef.current) { toast('Você tem acesso somente de consulta.'); return; }
    if (area && !areaRef.current(area)) { toast('Você não tem permissão para alterar esta área.'); return; }
    setDb((prev) => {
      const d: DB = JSON.parse(JSON.stringify(prev));
      fn(d);
      return d;
    });
  }, [toast]);
  const hist = (d: DB, tipo: string, icone: string, texto: string) => {
    d.historico.unshift({ id: novoId(), ts: new Date().toISOString(), tipo, icone, texto, user: autorRef.current } as Historico);
    if (d.historico.length > 3000) d.historico.pop();
  };

  const registrarHistorico = useCallback((tipo: string, icone: string, texto: string) => mutarDb((d) => hist(d, tipo, icone, texto)), [mutarDb]);

  const salvarObra: Ctx['salvarObra'] = useCallback((dados, id) => mutarDb((d) => {
    if (id == null) {
      d.obras.push({ id: novoId(), itens: [], ...dados });
      hist(d, 'obra_criada', '🏗️', `Obra "${dados.nome}" cadastrada · AC21: ${fmt(dados.ac21)}`);
    } else {
      const o = d.obras.find((x) => x.id === id); if (!o) return;
      const ant = o.ac21; Object.assign(o, dados);
      if (ant !== dados.ac21) hist(d, 'ac21_alterado', '💰', `AC21 de "${dados.nome}" alterado: ${fmt(ant)} → ${fmt(dados.ac21)}`);
      else hist(d, 'obra_editada', '✏️', `Dados da obra "${dados.nome}" atualizados`);
    }
  }, 'obras'), [mutarDb]);

  const excluirObra = useCallback((id: number) => {
    // apagar a obra leva junto as compras e o cronograma: precisa poder alterar as três áreas
    if (!areaRef.current('obras') || !areaRef.current('compras') || !areaRef.current('cronograma')) { toast('Para excluir uma obra você precisa poder alterar obras, compras e cronograma.'); return; }
    mutarDb((d) => {
      const o = d.obras.find((x) => x.id === id); if (!o) return;
      hist(d, 'obra_excluida', '🗑️', `Obra "${o.nome}" removida`);
      d.obras = d.obras.filter((x) => x.id !== id);
      d.compras = d.compras.filter((c) => c.obraId !== id);
    });
    setObraAtiva((cur) => (cur === id ? null : cur));
    setCronos((c) => { const { [String(id)]: _removido, ...resto } = c; return resto; });
    setBackups((b) => { const { [String(id)]: _b, ...resto } = b; return resto; });
  }, [mutarDb, toast]);

  const salvarItem: Ctx['salvarItem'] = useCallback((obraId, item, id) => mutarDb((d) => {
    const o = d.obras.find((x) => x.id === obraId); if (!o) return;
    if (id == null) {
      o.itens.push({ id: novoId(), ...item });
      hist(d, 'item_adicionado', '➕', `Item "${item.desc}" adicionado à obra ${o.codigo} · Pago: ${fmt(item.pago)}`);
    } else {
      const idx = o.itens.findIndex((i) => i.id === id); if (idx < 0) return;
      const ant = o.itens[idx];
      hist(d, 'item_editado', '✏️', ant.pago !== item.pago
        ? `Item "${item.desc}" atualizado · Pago: ${fmt(ant.pago)} → ${fmt(item.pago)}`
        : `Item "${item.desc}" editado na obra ${o.codigo}`);
      o.itens[idx] = { id, ...item };
    }
  }, 'obras'), [mutarDb]);

  const excluirItem = useCallback((obraId: number, id: number) => mutarDb((d) => {
    const o = d.obras.find((x) => x.id === obraId); if (!o) return;
    const it = o.itens.find((i) => i.id === id); if (!it) return;
    hist(d, 'item_excluido', '🗑️', `Item "${it.desc}" removido da obra ${o.codigo}`);
    o.itens = o.itens.filter((i) => i.id !== id);
  }, 'obras'), [mutarDb]);

  const salvarCompra: Ctx['salvarCompra'] = useCallback((c, id) => mutarDb((d) => {
    const obra = d.obras.find((o) => o.id === c.obraId);
    if (id == null) {
      d.compras.push({ id: novoId(), ...c });
      hist(d, 'compra', '🛒', `Compra "${c.desc}" registrada - ${c.forn} · ${fmt(c.total)} · ${obra?.codigo || ''}`);
    } else {
      const idx = d.compras.findIndex((x) => x.id === id); if (idx < 0) return;
      d.compras[idx] = { id, ...c };
      hist(d, 'compra_editada', '✏️', `Compra "${c.desc}" atualizada · ${fmt(c.total)}`);
    }
  }, 'compras'), [mutarDb]);

  const excluirCompra = useCallback((id: number) => mutarDb((d) => {
    const c = d.compras.find((x) => x.id === id); if (!c) return;
    hist(d, 'compra_excluida', '🗑️', `Compra "${c.desc}" removida`);
    d.compras = d.compras.filter((x) => x.id !== id);
  }, 'compras'), [mutarDb]);

  const importarDB = useCallback((dados: unknown) => {
    if (roRef.current) { toast('Você tem acesso somente de consulta.'); return false; }
    if (!areaRef.current('obras') || !areaRef.current('compras') || !areaRef.current('cronograma')) { toast('Carregar um backup substitui tudo: só quem altera obras, compras e cronograma pode.'); return false; }
    const limpo = sanitizarDB(dados);
    if (!limpo) return false;
    limpo.historico.unshift({ id: novoId(), ts: new Date().toISOString(), tipo: 'restore', icone: '📂', texto: 'Backup carregado com sucesso', user: autorRef.current });
    setDb(limpo);
    const cr = (dados as { cronogramas?: Record<string, Partial<Estado>> }).cronogramas;
    if (cr && typeof cr === 'object') {
      const ids = new Set(limpo.obras.map((o) => String(o.id)));
      const novo: Record<string, Estado> = {};
      Object.keys(cr).forEach((k) => { if (ids.has(k) || k === 'legacy') novo[k] = normalizarEstado(cr[k]); });
      setCronos(novo);
    }
    return true;
  }, [toast]);
  const exportarTudo = useCallback(() => ({ ...db, cronogramas: cronos }), [db, cronos]);

  /* ---------- Cronograma ---------- */
  const updateCrono: Ctx['updateCrono'] = useCallback((fn) => {
    if (roRef.current) return;
    const k = chaveRef.current;
    if (!areaRef.current('cronograma')) {
      // só as próprias tarefas: confere antes de aceitar a alteração
      if (!minhasRef.current) return;
      const antes: Estado = estadoRef.current.cronos[k] ?? sementeRef.current;
      const S: Estado = JSON.parse(JSON.stringify(antes));
      fn(S, calRef.current, calcRef.current);
      const erro = validarEdicaoMinhas(antes.tarefas, S.tarefas, userRef.current);
      if (erro) { toast(erro); return; }
      setCronos((prev) => ({ ...prev, [k]: S }));
      return;
    }
    setCronos((prev) => {
      const S: Estado = JSON.parse(JSON.stringify(prev[k] ?? sementeRef.current));
      fn(S, calRef.current, calcRef.current);
      return { ...prev, [k]: S };
    });
  }, [toast]);
  const carregarCrono: Ctx['carregarCrono'] = useCallback((obj, opc) => {
    if (roRef.current || !areaRef.current('cronograma')) return false;
    const est = normalizarEstado(obj);
    const obraId = opc?.obraId;
    const obrasIds = estadoRef.current.db.obras.map((o) => o.id);
    if (obraId != null && !obrasIds.includes(obraId)) return false;
    const k = obraId != null ? String(obraId) : chaveRef.current;
    const antes = estadoRef.current.cronos[k];
    if (antes) setBackups((b) => ({ ...b, [k]: empilharBackup(b[k] ?? [], { ts: new Date().toISOString(), motivo: opc?.motivo ?? 'Antes de carregar outro cronograma', estado: antes }) }));
    // só a chave desta obra muda; as outras obras continuam exatamente como estavam
    setCronos((prev) => (obraId != null ? trocarCronoDaObra(prev, obraId, est, obrasIds) : { ...prev, [k]: est }));
    return true;
  }, []);
  carregarRef.current = carregarCrono;
  const restaurarCrono = useCallback((ts: string) => {
    if (roRef.current || !areaRef.current('cronograma')) return;
    const k = chaveRef.current;
    const b = (backupsRef.current[k] ?? []).find((x) => x.ts === ts); if (!b) return;
    const atual = estadoRef.current.cronos[k] ?? b.estado;
    // restaurar também é reversível: a versão que estava aberta vira uma cópia
    setBackups((p) => ({ ...p, [k]: empilharBackup((p[k] ?? []).filter((x) => x.ts !== ts), { ts: new Date().toISOString(), motivo: 'Antes de restaurar uma versão anterior', estado: atual }) }));
    setCronos((prev) => ({ ...prev, [k]: normalizarEstado(b.estado) }));
  }, []);

  const value: Ctx = {
    db, obraAtivaId, obraAtual, cronos, exportarTudo, setObraAtiva, salvarObra, excluirObra, salvarItem, excluirItem, salvarCompra, excluirCompra,
    registrarHistorico, importarDB,
    crono, cal, calc, updateCrono, carregarCrono, backupsCrono: backups[chave] ?? [], restaurarCrono, readOnly,
    userId, orgId, orgNome: orgAtual?.nome ?? '', orgs, papel, permissoes, podeEditar, podeEditarArea: editaArea, podeVerArea: veArea, soMinhas, podeEditarTarefa,
    trocarOrg: trocarOrg ?? (() => undefined), recarregarOrgs: recarregarOrgs ?? (() => undefined),
    usuario: email, nomeUsuario: nome, sair: onSignOut ? sairSeguro : null, nuvem, recarregarNuvem: () => { void carregarNuvem(); }, tentarSincronizar: () => { void salvarAgora(); },
    tema, alternarTema: () => setTema((t) => (t === 'dark' ? 'light' : 'dark')),
    toast, toastMsg,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
