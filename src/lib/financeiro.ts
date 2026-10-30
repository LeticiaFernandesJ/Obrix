import { type Compra, pagoDaCompra, restanteDaCompra } from './ac21';

/* =========================== CONTAS A PAGAR E FLUXO DE CAIXA ===========================
   Uma compra com status diferente de "Pago" é uma conta a pagar; o vencimento diz quando. */

const DIA = 86400000;
/** Dias de a até b (positivo se b é depois de a). Datas no formato AAAA-MM-DD. */
export const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DIA);

export type TipoSituacao = 'paga' | 'vencida' | 'hoje' | 'proxima' | 'futura' | 'sem_venc';
export interface Situacao { tipo: TipoSituacao; /** dias de atraso (vencida) ou que faltam (hoje/proxima/futura) */ dias: number }

export function situacaoConta(c: Pick<Compra, 'status' | 'venc'>, hoje: string, janela = 7): Situacao {
  if (c.status === 'Pago') return { tipo: 'paga', dias: 0 };
  if (!c.venc) return { tipo: 'sem_venc', dias: 0 };
  const d = diasEntre(hoje, c.venc);
  if (d < 0) return { tipo: 'vencida', dias: -d };
  if (d === 0) return { tipo: 'hoje', dias: 0 };
  return { tipo: d <= janela ? 'proxima' : 'futura', dias: d };
}

export function textoSituacao(s: Situacao): string {
  switch (s.tipo) {
    case 'paga': return 'Paga';
    case 'vencida': return s.dias === 1 ? 'Venceu há 1 dia' : `Venceu há ${s.dias} dias`;
    case 'hoje': return 'Vence hoje';
    case 'proxima': case 'futura': return s.dias === 1 ? 'Vence amanhã' : `Vence em ${s.dias} dias`;
    default: return 'Sem vencimento';
  }
}

interface Soma { n: number; valor: number }
/** Soma o que falta pagar (numa compra parcial, só o restante). */
const somar = (lista: Compra[]): Soma => ({ n: lista.length, valor: Math.round(lista.reduce((s, c) => s + restanteDaCompra(c), 0) * 100) / 100 });
const somarPago = (lista: Compra[]): Soma => ({ n: lista.length, valor: Math.round(lista.reduce((s, c) => s + pagoDaCompra(c), 0) * 100) / 100 });

export interface ResumoFinanceiro {
  vencidas: Soma; hoje: Soma; proximos7: Soma; proximos30: Soma; semVencimento: Soma; aPagar: Soma; pagoNoMes: Soma;
}
export function resumoFinanceiro(compras: Compra[], hoje: string): ResumoFinanceiro {
  const abertas = compras.filter((c) => c.status !== 'Pago');
  const com = (fn: (s: Situacao) => boolean) => somar(abertas.filter((c) => fn(situacaoConta(c, hoje))));
  const mes = hoje.slice(0, 7);
  return {
    vencidas: com((s) => s.tipo === 'vencida'),
    hoje: com((s) => s.tipo === 'hoje'),
    proximos7: com((s) => s.tipo === 'hoje' || (s.tipo === 'proxima' && s.dias <= 7)),
    proximos30: com((s) => s.tipo === 'hoje' || ((s.tipo === 'proxima' || s.tipo === 'futura') && s.dias <= 30)),
    semVencimento: com((s) => s.tipo === 'sem_venc'),
    aPagar: somar(abertas),
    pagoNoMes: somarPago(compras.filter((c) => pagoDaCompra(c) > 0 && c.data.slice(0, 7) === mes)),
  };
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export interface MesFluxo { mes: string; rotulo: string; aPagar: number; pago: number }

/** Mês a mês: o que vence (ainda a pagar) e o que já foi pago, de `passado` meses atrás até `futuro` meses à frente. */
export function fluxoMensal(compras: Compra[], hoje: string, passado = 2, futuro = 5): MesFluxo[] {
  const [a, m] = hoje.split('-').map(Number);
  const out: MesFluxo[] = [];
  for (let i = -passado; i <= futuro; i++) {
    const d = new Date(Date.UTC(a, m - 1 + i, 1));
    const mes = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    out.push({ mes, rotulo: `${MESES[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`, aPagar: 0, pago: 0 });
  }
  const por = new Map(out.map((x) => [x.mes, x]));
  compras.forEach((c) => {
    const pago = pagoDaCompra(c), resta = restanteDaCompra(c);
    if (pago > 0) { const x = por.get(c.data.slice(0, 7)); if (x) x.pago += pago; }
    if (resta > 0 && c.venc) { const x = por.get(c.venc.slice(0, 7)); if (x) x.aPagar += resta; }
  });
  out.forEach((x) => { x.aPagar = Math.round(x.aPagar * 100) / 100; x.pago = Math.round(x.pago * 100) / 100; });
  return out;
}

/** Contas abertas em ordem de vencimento (as vencidas primeiro, as sem vencimento por último). */
export function contasAbertas(compras: Compra[]): Compra[] {
  return compras.filter((c) => c.status !== 'Pago').sort((x, y) => (x.venc || '9999-12-31').localeCompare(y.venc || '9999-12-31'));
}
