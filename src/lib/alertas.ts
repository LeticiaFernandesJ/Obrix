import { restanteDaCompra, type DB, estourou, fmt, hojeISO, obraFinalizada, pct, pctTxt, plural, situacaoVerba, totalComprometido, totalPago } from './ac21';
import { hojeN, parseData } from './dates';
import { calcularEVM } from './evm';
import { diasEntre } from './financeiro';
import { type Estado, calcular, makeCal } from './schedule';

/* =========================== CENTRAL DE ALERTAS ===========================
   Junta, em uma lista só, o que merece atenção em cada obra: verba, contas a pagar, atrasos e desempenho. */

export type NivelAlerta = 'critico' | 'atencao';
export interface Alerta {
  id: string; nivel: NivelAlerta; titulo: string; texto: string;
  /** tela para onde o alerta leva */ rota: string; obraId: number;
}

const nome = (o: { codigo: string; nome: string }) => (o.codigo ? `${o.codigo} - ${o.nome}` : o.nome);

export function gerarAlertas(db: DB, cronos: Record<string, Estado>, hoje: string = hojeISO()): Alerta[] {
  const out: Alerta[] = [];
  db.obras.forEach((o) => {
    const quem = nome(o);
    const ativa = o.status !== 'Concluída' && o.status !== 'Suspensa';

    /* verba */
    if (o.ac21 > 0 && !obraFinalizada(o)) {
      const vc = totalComprometido(db, o), sv = situacaoVerba(vc, o.ac21), pc = pctTxt(pct(vc, o.ac21));
      if (sv === 'estourada') out.push({ id: `verba-${o.id}`, nivel: 'critico', titulo: 'Verba estourada', texto: `${quem}: comprometido ${fmt(vc)}, ${fmt(vc - o.ac21)} acima do AC21.`, rota: '/detalhe', obraId: o.id });
      else if (sv === 'esgotada') out.push({ id: `verba-${o.id}`, nivel: 'atencao', titulo: 'Verba esgotada', texto: `${quem}: todo o AC21 já está comprometido (sem saldo).`, rota: '/detalhe', obraId: o.id });
      else if (sv === 'limite') out.push({ id: `verba-${o.id}`, nivel: 'atencao', titulo: 'Verba no limite', texto: `${quem}: ${pc}% do AC21 já está comprometido.`, rota: '/detalhe', obraId: o.id });
      if (estourou(totalPago(db, o), o.ac21)) out.push({ id: `pago-${o.id}`, nivel: 'critico', titulo: 'Pagamentos acima do AC21', texto: `${quem}: pago ${fmt(totalPago(db, o))}, mais que os ${fmt(o.ac21)} aprovados.`, rota: '/detalhe', obraId: o.id });
    }

    /* contas a pagar */
    const abertas = db.compras.filter((c) => c.obraId === o.id && c.status !== 'Pago' && c.venc);
    const vencidas = abertas.filter((c) => diasEntre(hoje, c.venc) < 0);
    const soma = (l: typeof abertas) => l.reduce((s, c) => s + restanteDaCompra(c), 0);
    if (vencidas.length) out.push({ id: `venc-${o.id}`, nivel: 'critico', titulo: 'Contas vencidas', texto: `${quem}: ${plural(vencidas.length, 'conta vencida', 'contas vencidas')}, ${fmt(soma(vencidas))}.`, rota: '/financeiro', obraId: o.id });
    const breve = abertas.filter((c) => { const d = diasEntre(hoje, c.venc); return d >= 0 && d <= 3; });
    if (breve.length) out.push({ id: `breve-${o.id}`, nivel: 'atencao', titulo: 'Contas vencendo', texto: `${quem}: ${plural(breve.length, 'conta vence', 'contas vencem')} em até 3 dias, ${fmt(soma(breve))}.`, rota: '/financeiro', obraId: o.id });

    /* cronograma e desempenho */
    const S = cronos[String(o.id)];
    if (S && S.tarefas.length && ativa) {
      const c = calcular(S, makeCal(S));
      const sd = parseData(S.meta.statusDate) ?? hojeN();
      const atrasadas = c.filter((k, i) => !k.res && k.fim != null && k.fim < sd && (+S.tarefas[i].pct || 0) < 100).length;
      if (atrasadas) out.push({ id: `atraso-${o.id}`, nivel: atrasadas > 3 ? 'critico' : 'atencao', titulo: 'Tarefas atrasadas', texto: `${quem}: ${plural(atrasadas, 'tarefa atrasada', 'tarefas atrasadas')} no cronograma.`, rota: '/cronograma', obraId: o.id });

      const e = calcularEVM(o, db, S);
      if (e?.idp != null && e.nivelPrazo !== 'bom') out.push({ id: `idp-${o.id}`, nivel: e.nivelPrazo === 'critico' ? 'critico' : 'atencao', titulo: 'Obra atrasada em relação ao plano', texto: `${quem}: índice de prazo ${e.idp.toFixed(2).replace('.', ',')}.`, rota: '/detalhe', obraId: o.id });
      if (e?.idc != null && e.nivelCusto !== 'bom') out.push({ id: `idc-${o.id}`, nivel: e.nivelCusto === 'critico' ? 'critico' : 'atencao', titulo: 'Custo acima do avanço', texto: `${quem}: índice de custo ${e.idc.toFixed(2).replace('.', ',')}.`, rota: '/detalhe', obraId: o.id });
    }
  });
  return out.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'critico' ? -1 : 1));
}
