import { type Compra, type DB } from './ac21';
import { blocos, bloco, limparXml, numero, tag } from './xml';

/* =========================== LEITURA DE NF-e (XML) ===========================
   Lê o XML da nota fiscal eletrônica (modelo 55, com ou sem o envelope nfeProc).
   Não depende de DOMParser, então funciona igual no navegador e nos testes. */

export interface ItemNFe { desc: string; qtde: number; unid: string; unit: number; total: number }
export interface ParcelaNFe { numero: string; venc: string; valor: number }
export interface NFe {
  chave: string; numero: string; serie: string;
  /** AAAA-MM-DD */ emissao: string;
  fornecedor: string; cnpj: string;
  total: number; itens: ItemNFe[]; parcelas: ParcelaNFe[];
}

export const soDigitos = (s: string) => String(s ?? '').replace(/\D/g, '');

export function formatarCnpj(s: string): string {
  const d = soDigitos(s);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return s;
}

/** Máscara de CNPJ/CPF enquanto a pessoa digita (até 14 dígitos). */
export function mascaraCnpjCpf(s: string): string {
  const d = soDigitos(s).slice(0, 14);
  if (d.length <= 11) return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

export function lerNFe(xmlBruto: string): NFe {
  // tira BOM, comentários e os prefixos de namespace (<nfe:tag> vira <tag>)
  const xml = limparXml(xmlBruto);
  const inf = /<infNFe(\s[^>]*)?>([\s\S]*?)<\/infNFe>/.exec(xml);
  if (!inf) throw new Error('Este arquivo não é uma NF-e (não achei o grupo infNFe).');
  const corpo = inf[2];
  const id = /\bId="NFe(\d{44})"/.exec(inf[1] ?? '');

  const emit = bloco(corpo, 'emit');
  const ide = bloco(corpo, 'ide');
  const emissaoBruta = tag(ide, 'dhEmi') || tag(ide, 'dEmi');
  const total = numero(tag(bloco(corpo, 'total'), 'vNF'));

  const itens: ItemNFe[] = blocos(corpo, 'det').map((d) => {
    const p = bloco(d, 'prod');
    return { desc: tag(p, 'xProd'), qtde: numero(tag(p, 'qCom')), unid: tag(p, 'uCom'), unit: numero(tag(p, 'vUnCom')), total: numero(tag(p, 'vProd')) };
  });
  const parcelas: ParcelaNFe[] = blocos(bloco(corpo, 'cobr'), 'dup').map((d, i) => ({
    numero: tag(d, 'nDup') || String(i + 1).padStart(3, '0'), venc: tag(d, 'dVenc').slice(0, 10), valor: numero(tag(d, 'vDup')),
  }));

  const nf: NFe = {
    chave: id?.[1] ?? '', numero: tag(ide, 'nNF'), serie: tag(ide, 'serie'),
    emissao: /^\d{4}-\d{2}-\d{2}/.test(emissaoBruta) ? emissaoBruta.slice(0, 10) : '',
    fornecedor: tag(emit, 'xNome') || tag(emit, 'xFant'), cnpj: tag(emit, 'CNPJ') || tag(emit, 'CPF'),
    total: total || itens.reduce((s, i) => s + i.total, 0), itens, parcelas,
  };
  if (!nf.numero || !nf.fornecedor) throw new Error('A NF-e está incompleta (faltam número ou emitente).');
  return nf;
}

/* =========================== DE NOTA PARA COMPRAS =========================== */
export type ModoLancamento = 'nota' | 'itens';
export interface OpcoesLancamento { obraId: number; categoria: string; status: Compra['status']; modo: ModoLancamento }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A nota já foi lançada? (mesmo CNPJ e mesmo número de NF) */
export const notaJaLancada = (db: DB, nf: NFe) =>
  db.compras.some((c) => c.nf === nf.numero && soDigitos(c.cnpj) === soDigitos(nf.cnpj) && soDigitos(nf.cnpj) !== '');

/**
 * Transforma a nota em compras (sem id; o app atribui). Em "nota", cada parcela (duplicata) vira uma compra com o
 * seu vencimento; sem parcelas, vira uma compra única. Em "itens", cada produto vira uma compra.
 */
export function comprasDaNFe(nf: NFe, o: OpcoesLancamento): Omit<Compra, 'id'>[] {
  const base = { obraId: o.obraId, cat: o.categoria, forn: nf.fornecedor, cnpj: formatarCnpj(nf.cnpj), nf: nf.numero, data: nf.emissao, status: o.status };
  const chave = nf.chave ? `Chave de acesso: ${nf.chave}` : '';

  if (o.modo === 'itens') {
    const venc = nf.parcelas[0]?.venc ?? '';
    // frete, seguro, impostos e descontos da nota ficam fora do valor dos produtos: rateia a diferença
    // entre o total da nota e a soma dos itens, para a soma das compras bater com o que a nota cobra
    const soma = r2(nf.itens.reduce((s, i) => s + i.total, 0));
    const dif = r2(nf.total - soma);
    const rateia = nf.itens.length > 0 && soma > 0 && Math.abs(dif) >= 0.01;
    let resto = dif;
    return nf.itens.map((i, k) => {
      const extra = !rateia ? 0 : k === nf.itens.length - 1 ? r2(resto) : r2((dif * i.total) / soma);
      resto = r2(resto - extra);
      const total = r2(i.total + extra);
      return {
        ...base, desc: i.desc || `Item da NF ${nf.numero}`, qtde: i.qtde, unid: i.unid, unit: rateia && i.qtde > 0 ? r2(total / i.qtde) : i.unit, total, venc,
        obs: `Item da NF ${nf.numero}. ${rateia ? 'Inclui o rateio de frete, impostos e descontos da nota. ' : ''}${chave}`.trim(),
      };
    });
  }
  const resumo = nf.itens.slice(0, 5).map((i) => `${i.qtde} ${i.unid} ${i.desc}`).join('; ') + (nf.itens.length > 5 ? `; e mais ${nf.itens.length - 5} item(ns)` : '');
  const obs = [`Itens: ${resumo || 'sem itens'}.`, chave].filter(Boolean).join(' ');
  if (nf.parcelas.length <= 1) {
    return [{ ...base, desc: `NF ${nf.numero} - ${nf.fornecedor}`, qtde: 1, unid: 'un', unit: nf.total, total: r2(nf.total), venc: nf.parcelas[0]?.venc ?? '', obs }];
  }
  return nf.parcelas.map((p, i) => ({
    ...base, desc: `NF ${nf.numero} - ${nf.fornecedor} (parcela ${i + 1}/${nf.parcelas.length})`,
    qtde: 1, unid: 'un', unit: p.valor, total: r2(p.valor), venc: p.venc, obs,
  }));
}
