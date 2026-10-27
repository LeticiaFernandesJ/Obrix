type XLSXLib = typeof import('xlsx');
/** A biblioteca de planilhas é pesada: só é carregada quando alguém exporta. */
const carregarXLSX = () => import('xlsx');

/* =========================== TIPOS =========================== */
export type StatusObra = 'Em Andamento' | 'Planejamento' | 'Concluída' | 'Suspensa';
export type TipoItem = 'orcado' | 'nao_orcado';
export type StatusCompra = 'Pago' | 'Pendente' | 'Parcial';

export interface Item {
  id: number; desc: string; cat: string; tipo: TipoItem; orcado: number; pago: number;
  forn: string; nf: string; data: string; obs: string;
}
export interface Obra {
  id: number; nome: string; codigo: string; local: string; responsavel: string;
  inicio: string; fim: string; ac21: number; status: StatusObra; obs: string; itens: Item[];
}
export interface Compra {
  id: number; obraId: number; desc: string; cat: string; forn: string; cnpj: string; nf: string;
  data: string; qtde: number; unid: string; unit: number; total: number; status: StatusCompra; obs: string;
  /** vencimento do pagamento (AAAA-MM-DD); vazio se não houver */
  venc: string;
}
export interface Historico { id: number; ts: string; tipo: string; icone: string; texto: string; user: string }
export interface DB { obras: Obra[]; compras: Compra[]; historico: Historico[]; nextId: number }

export const CORES = ['#1565C0', '#1D9E75', '#BA7517', '#993556', '#533AB7', '#3B6D11', '#A32D2D', '#0E5B8A', '#6D4C00'];
export const CATS_ITEM = ['Construtora', 'Insumos', 'Equipamentos', 'Serviços', 'Compras', 'Mão de Obra', 'Instalações', 'Projetos', 'Outros'];
export const CATS_COMPRA = ['Insumos', 'Equipamentos', 'Ferramentas', 'EPI / Segurança', 'Materiais Elétricos', 'Materiais Hidráulicos', 'Acabamentos', 'Outros'];
export const STATUS_OBRA: StatusObra[] = ['Em Andamento', 'Planejamento', 'Concluída', 'Suspensa'];

export const dbVazio = (): DB => ({ obras: [], compras: [], historico: [], nextId: 1 });

/* =========================== FORMATAÇÃO =========================== */
/** Arredonda para centavos (evita 0,1 + 0,2 = 0,30000000000000004 nas somas e nas comparações). */
export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
// r2 também tira o "-0": um saldo de -0,0000001 aparecia como "R$ -0,00"
const centavos = (v: unknown) => { const n = r2(Number(v || 0)); return n === 0 ? 0 : n; };
export const fmt = (v: unknown) =>
  'R$ ' + centavos(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtNum = (v: unknown) =>
  centavos(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Percentual com 1 casa. Só mostra 100% quando o valor chegou mesmo a 100%: 99,96% aparece como 99,9%. */
export const pct = (a: number, b: number) => {
  if (!(b > 0)) return 0;
  const v = Math.round((a / b) * 1000) / 10;
  return a < b ? Math.min(v, 99.9) : v;
};
/** Percentual inteiro, com a mesma regra: abaixo de 100% nunca arredonda para 100. */
export const pctInt = (a: number, b: number) => {
  if (!(b > 0)) return 0;
  const v = Math.round((a / b) * 100);
  return a < b ? Math.min(v, 99) : v;
};
/** Percentual como texto brasileiro: 99,7 */
export const pctTxt = (n: number) => String(n).replace('.', ',');
export function fmtData(s?: string) {
  if (!s) return '-';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}
export function fmtTs(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
/** Hoje no relógio do aparelho (AAAA-MM-DD). Não usa UTC: no Brasil, depois das 21h o UTC já é o dia seguinte. */
export const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/* =========================== CÁLCULOS =========================== */
export const totalOrc = (o: Obra) => r2(o.itens.reduce((s, i) => s + Number(i.orcado || 0), 0));
export const totalItens = (o: Obra) => r2(o.itens.reduce((s, i) => s + Number(i.pago || 0), 0));
export const totalCompras = (db: DB, o: Obra) =>
  r2(db.compras.filter((c) => c.obraId === o.id && c.status === 'Pago').reduce((s, c) => s + Number(c.total || 0), 0));
export const totalComprasTodas = (db: DB, o: Obra) =>
  r2(db.compras.filter((c) => c.obraId === o.id).reduce((s, c) => s + Number(c.total || 0), 0));
export const totalPago = (db: DB, o: Obra) => r2(totalItens(o) + totalCompras(db, o));
/** O que um item compromete: o valor orçado enquanto não foi pago; depois de pago, o valor realmente pago (maior ou menor). */
export const comprometidoDoItem = (i: Item) => (Number(i.pago || 0) > 0 ? Number(i.pago) : Number(i.orcado || 0));
/** Itens orçados que custaram mais do que o previsto: quanto passou e em quantos itens. */
export function acimaDoOrcado(o: Obra) {
  const l = o.itens.filter((i) => Number(i.orcado || 0) > 0 && Number(i.pago || 0) > Number(i.orcado) + 0.005);
  return { valor: r2(l.reduce((s, i) => s + Number(i.pago) - Number(i.orcado), 0)), qtd: l.length };
}
/** Comprometido = tudo que foi lançado: itens (orçados ou não) + todas as compras (pagas ou pendentes). */
export const totalComprometido = (db: DB, o: Obra) => r2(o.itens.reduce((s, i) => s + comprometidoDoItem(i), 0) + totalComprasTodas(db, o));

/** Passou do AC21? (meio centavo de folga para não acusar estouro por arredondamento) */
export const estourou = (valor: number, ac21: number) => ac21 > 0 && valor - ac21 > 0.005;
export type SituacaoVerba = 'estourada' | 'esgotada' | 'limite' | 'ok';
/** Situação da verba pelo valor comprometido: estourada (passou), esgotada (100%, sem saldo), no limite (a partir de 90%) ou ok. */
export function situacaoVerba(comprometido: number, ac21: number): SituacaoVerba {
  if (!(ac21 > 0)) return 'ok';
  if (estourou(comprometido, ac21)) return 'estourada';
  if (comprometido >= ac21 - 0.005) return 'esgotada';
  return comprometido / ac21 >= 0.9 ? 'limite' : 'ok';
}

/* obras ativas e finalizadas */
export type Situacao = 'ativas' | 'finalizadas' | 'todas';
export const SITUACOES: { id: Situacao; rotulo: string }[] = [
  { id: 'ativas', rotulo: 'Obras ativas' }, { id: 'finalizadas', rotulo: 'Obras finalizadas' }, { id: 'todas', rotulo: 'Todas as obras' },
];
/** Finalizada = status Concluída. Ativas: em andamento, planejamento e suspensas. */
export const obraFinalizada = (o: Pick<Obra, 'status'>) => o.status === 'Concluída';
const K_SITUACAO = 'obrix-situacao-obras';
/** Filtro escolhido (vale para o painel e a lista de obras, enquanto a aba estiver aberta). Padrão: ativas. */
export const lerSituacao = (): Situacao => {
  try { const v = sessionStorage.getItem(K_SITUACAO); return v === 'finalizadas' || v === 'todas' ? v : 'ativas'; } catch { return 'ativas'; }
};
export const gravarSituacao = (s: Situacao) => { try { sessionStorage.setItem(K_SITUACAO, s); } catch { /* ok */ } };
export function porSituacao<T extends Pick<Obra, 'status'>>(obras: T[], s: Situacao): T[] {
  return s === 'todas' ? obras : obras.filter((o) => (s === 'finalizadas' ? obraFinalizada(o) : !obraFinalizada(o)));
}
export const totalNaoOrc = (o: Obra) =>
  r2(o.itens.filter((i) => i.tipo === 'nao_orcado').reduce((s, i) => s + Number(i.pago || 0), 0));

export const corPct = (p: number) => (p >= 95 ? 'var(--red)' : p >= 80 ? 'var(--amber)' : 'var(--green)');
export type NivelStatus = 'danger' | 'warn' | 'ok';
export const nivelPct = (p: number): NivelStatus => (p >= 95 ? 'danger' : p >= 80 ? 'warn' : 'ok');
export const rotuloNivel: Record<NivelStatus, string> = { danger: 'Crítico', warn: 'Atenção', ok: 'OK' };
export const badgeStatusObra = (s: StatusObra) => (s === 'Concluída' ? 'badge-ok' : s === 'Suspensa' ? 'badge-danger' : 'badge-blue');

/* =========================== EXCEL =========================== */
const hoje = () => hojeISO();

export async function exportarExcel(db: DB) {
  const XLSX = await carregarXLSX();
  const wb = XLSX.utils.book_new();
  const resumo: unknown[][] = [['Obra', 'Código', 'Local', 'Responsável', 'AC21', 'Comprometido', '% Comprometido', 'Pago', 'Saldo (AC21-Comp.)', 'Saldo (AC21-Pago)', 'Status']];
  db.obras.forEach((o) => {
    const pg = totalPago(db, o), comp = totalComprometido(db, o);
    resumo.push([o.nome, o.codigo, o.local, o.responsavel, o.ac21, comp, pct(comp, o.ac21) / 100, pg, r2(o.ac21 - comp), r2(o.ac21 - pg), o.status]);
  });
  const wsRes = XLSX.utils.aoa_to_sheet(resumo);
  wsRes['!cols'] = [35, 16, 20, 18, 16, 16, 16, 16, 18, 18, 14].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, wsRes, 'Resumo Geral');
  const usados = new Set<string>(['Resumo Geral', 'Compras']);
  db.obras.forEach((o) => {
    const rows: unknown[][] = [['Descrição', 'Categoria', 'Tipo', 'Orçado', 'Pago', 'Saldo Item', 'Fornecedor', 'NF', 'Data Pgto', 'Observações']];
    o.itens.forEach((i) => rows.push([i.desc, i.cat, i.tipo === 'nao_orcado' ? 'Não Orçado' : 'Orçado', i.orcado, i.pago, r2(Number(i.orcado || 0) - Number(i.pago || 0)), i.forn, i.nf, i.data, i.obs]));
    rows.push([]);
    rows.push(['', '', 'TOTAL', totalOrc(o), totalItens(o)]);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [40, 14, 12, 14, 14, 14, 22, 16, 12, 30].map((wch) => ({ wch }));
    let nome = (o.codigo || o.nome).replace(/[^a-zA-Z0-9-]/g, '').substring(0, 31) || 'Obra';
    let k = 2; while (usados.has(nome)) nome = nome.substring(0, 28) + '_' + k++;
    usados.add(nome);
    XLSX.utils.book_append_sheet(wb, ws, nome);
  });
  XLSX.utils.book_append_sheet(wb, sheetCompras(XLSX, db), 'Compras');
  XLSX.writeFile(wb, `Controle_AC21_${hoje()}.xlsx`);
}

function sheetCompras(XLSX: XLSXLib, db: DB) {
  const rows: unknown[][] = [['Descrição', 'Obra', 'Categoria', 'Fornecedor', 'CNPJ/CPF', 'NF', 'Data', 'Vencimento', 'Qtde', 'Unid', 'Unit. R$', 'Total R$', 'Status', 'Observações']];
  db.compras.forEach((c) => {
    const obra = db.obras.find((o) => o.id === c.obraId);
    rows.push([c.desc, obra?.codigo || '', c.cat, c.forn, c.cnpj, c.nf, c.data, c.venc, c.qtde, c.unid, c.unit, c.total, c.status, c.obs]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [35, 16, 16, 22, 18, 14, 12, 12, 8, 8, 14, 14, 12, 30].map((wch) => ({ wch }));
  return ws;
}

export async function exportarExcelObra(db: DB, o: Obra) {
  const XLSX = await carregarXLSX();
  const wb = XLSX.utils.book_new();
  const rows: unknown[][] = [
    [`CONTROLE AC21 - ${o.nome}`],
    [`Código: ${o.codigo}  |  Local: ${o.local}  |  AC21: R$ ${o.ac21.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
    [],
    ['Descrição', 'Categoria', 'Tipo', 'Orçado (R$)', 'Pago (R$)', 'Saldo Item (R$)', 'Fornecedor', 'NF', 'Data', 'Observações'],
  ];
  o.itens.forEach((i) => rows.push([i.desc, i.cat, i.tipo === 'nao_orcado' ? 'Não Orçado' : 'Orçado', i.orcado, i.pago, r2(Number(i.orcado || 0) - Number(i.pago || 0)), i.forn, i.nf, i.data, i.obs]));
  rows.push([]);
  rows.push(['', '', 'TOTAL ITENS', totalOrc(o), totalItens(o)]);
  rows.push(['', '', 'COMPRAS PAGAS', '', totalCompras(db, o)]);
  rows.push(['', '', 'TOTAL PAGO', '', totalPago(db, o)]);
  rows.push([]);
  rows.push(['', '', 'AC21 APROVADO', '', '', o.ac21]);
  rows.push(['', '', 'COMPROMETIDO', '', '', totalComprometido(db, o)]);
  rows.push(['', '', 'SALDO (AC21 - COMPROMETIDO)', '', '', r2(o.ac21 - totalComprometido(db, o))]);
  rows.push(['', '', 'SALDO (AC21 - PAGO)', '', '', r2(o.ac21 - totalPago(db, o))]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [40, 14, 13, 14, 14, 16, 22, 16, 12, 30].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, 'Itens');
  XLSX.writeFile(wb, `AC21_${o.codigo || o.id}_${hoje()}.xlsx`);
}

export async function exportarExcelCompras(db: DB) {
  const XLSX = await carregarXLSX();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetCompras(XLSX, db), 'Compras');
  XLSX.writeFile(wb, `Compras_AC21_${hoje()}.xlsx`);
}

/* =========================== VALIDAÇÃO DE DADOS =========================== */
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v: unknown) => (v == null ? '' : String(v));

/** Normaliza qualquer objeto vindo de backup/armazenamento para um DB seguro. Retorna null se não houver obras. */
export function sanitizarDB(raw: unknown): DB | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as DB).obras)) return null;
  const r = raw as Partial<DB>;
  let nextId = Math.max(1, num(r.nextId));
  const bump = (id: unknown) => { const n = num(id); if (n > nextId) nextId = n; return n || ++nextId; };
  const ids = new Set<number>();
  const uniq = (id: unknown) => { let n = bump(id); while (ids.has(n)) n = ++nextId; ids.add(n); return n; };
  const status: StatusObra[] = ['Em Andamento', 'Planejamento', 'Concluída', 'Suspensa'];
  const obras: Obra[] = (r.obras as Partial<Obra>[]).filter((o) => o && typeof o === 'object').map((o) => ({
    id: uniq(o.id), nome: str(o.nome) || 'Obra sem nome', codigo: str(o.codigo), local: str(o.local),
    responsavel: str(o.responsavel), inicio: str(o.inicio), fim: str(o.fim), ac21: num(o.ac21),
    status: status.includes(o.status as StatusObra) ? (o.status as StatusObra) : 'Em Andamento', obs: str(o.obs),
    itens: (Array.isArray(o.itens) ? o.itens : []).filter((i) => i && typeof i === 'object').map((i: Partial<Item>) => ({
      id: uniq(i.id), desc: str(i.desc) || 'Item', cat: str(i.cat) || 'Outros',
      tipo: (i.tipo === 'nao_orcado' ? 'nao_orcado' : 'orcado') as TipoItem,
      orcado: num(i.orcado), pago: num(i.pago), forn: str(i.forn), nf: str(i.nf), data: str(i.data), obs: str(i.obs),
    })),
  }));
  const obraIds = new Set(obras.map((o) => o.id));
  const compras: Compra[] = (Array.isArray(r.compras) ? r.compras : []).filter((c) => c && typeof c === 'object' && obraIds.has(num((c as Compra).obraId)))
    .map((c: Partial<Compra>) => ({
      id: uniq(c.id), obraId: num(c.obraId), desc: str(c.desc) || 'Compra', cat: str(c.cat) || 'Outros', forn: str(c.forn),
      cnpj: str(c.cnpj), nf: str(c.nf), data: str(c.data), qtde: num(c.qtde), unid: str(c.unid), unit: num(c.unit), total: num(c.total), venc: str(c.venc),
      status: (['Pago', 'Pendente', 'Parcial'].includes(str(c.status)) ? c.status : 'Pendente') as StatusCompra, obs: str(c.obs),
    }));
  const historico: Historico[] = (Array.isArray(r.historico) ? r.historico : []).filter((h) => h && typeof h === 'object')
    .map((h: Partial<Historico>) => ({ id: uniq(h.id), ts: str(h.ts) || new Date().toISOString(), tipo: str(h.tipo) || 'info', icone: str(h.icone), texto: str(h.texto), user: str(h.user) || 'Gerente' }));
  return { obras, compras, historico, nextId: nextId + 1 };
}

/** "1 obra" / "3 obras": concordância de número. */
export const plural = (n: number, singular: string, plur: string) => `${n} ${n === 1 ? singular : plur}`;

/* =========================== IDS =========================== */
let ultimoId = 0;
/**
 * Id único e crescente (milissegundos × 1000 + sufixo aleatório). Evita que dois aparelhos da mesma
 * conta gerem o mesmo número ao criar registros ao mesmo tempo. Cabe com folga em um bigint do Postgres
 * e em um número seguro do JavaScript (< 2^53) até o ano 2200.
 */
export function novoId(): number {
  let id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  if (id <= ultimoId) id = ultimoId + 1;
  ultimoId = id;
  return id;
}

/* =========================== MÁSCARA DE DINHEIRO =========================== */
/** "1234.5" → "1.234,50" (texto exibido no campo). Vazio continua vazio. */
export function mascaraMoeda(valor: string): string {
  if (valor === '' || valor == null) return '';
  const n = Number(valor);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** O que a pessoa digitou → valor numérico em texto ("1.234,50" → "1234.50"). Digita-se só números; os dois últimos são os centavos. */
export function valorDaMascara(digitado: string): string {
  const d = digitado.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 14);
  return d === '' ? '' : (parseInt(d, 10) / 100).toFixed(2);
}
