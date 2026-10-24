import { describe, expect, it } from 'vitest';
import { type DB, dbVazio } from './ac21';
import { comprasDaNFe, formatarCnpj, lerNFe, notaJaLancada, mascaraCnpjCpf } from './nfe';

const CHAVE = ['43', '2510', '12345678000190', '55', '001', '000001234', '1', '00001234', '9'].join('');

/** NF-e parecida com as reais: envelope nfeProc, namespace, entidades e duas duplicatas. */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe Id="NFe${CHAVE}" versao="4.00">
      <ide><cUF>43</cUF><serie>1</serie><nNF>1234</nNF><dhEmi>2026-10-05T10:30:00-03:00</dhEmi></ide>
      <emit><CNPJ>12345678000190</CNPJ><xNome>Cerâmica Silva &amp; Filhos Ltda</xNome><xFant>Silva</xFant></emit>
      <det nItem="1"><prod><cProd>1</cProd><xProd>Bloco cerâmico 14x19x29</xProd><uCom>UN</uCom><qCom>500.0000</qCom><vUnCom>3.2000000000</vUnCom><vProd>1600.00</vProd></prod></det>
      <det nItem="2"><prod><cProd>2</cProd><xProd>Argamassa AC-II 20kg</xProd><uCom>SC</uCom><qCom>40.0000</qCom><vUnCom>25.5000000000</vUnCom><vProd>1020.00</vProd></prod></det>
      <total><ICMSTot><vProd>2620.00</vProd><vNF>2620.00</vNF></ICMSTot></total>
      <cobr><fat><nFat>1234</nFat><vOrig>2620.00</vOrig></fat>
        <dup><nDup>001</nDup><dVenc>2026-11-05</dVenc><vDup>1310.00</vDup></dup>
        <dup><nDup>002</nDup><dVenc>2026-12-05</dVenc><vDup>1310.00</vDup></dup>
      </cobr>
    </infNFe>
  </NFe>
</nfeProc>`;

describe('leitura da NF-e', () => {
  it('extrai emitente, número, data, itens, total e parcelas', () => {
    const nf = lerNFe(XML);
    expect(nf.chave).toBe(CHAVE);
    expect(nf.numero).toBe('1234'); expect(nf.serie).toBe('1');
    expect(nf.emissao).toBe('2026-10-05');
    expect(nf.fornecedor).toBe('Cerâmica Silva & Filhos Ltda');
    expect(nf.cnpj).toBe('12345678000190');
    expect(nf.total).toBe(2620);
    expect(nf.itens).toHaveLength(2);
    expect(nf.itens[0]).toEqual({ desc: 'Bloco cerâmico 14x19x29', qtde: 500, unid: 'UN', unit: 3.2, total: 1600 });
    expect(nf.parcelas).toEqual([{ numero: '001', venc: '2026-11-05', valor: 1310 }, { numero: '002', venc: '2026-12-05', valor: 1310 }]);
  });
  it('aceita prefixo de namespace e arquivo com BOM', () => {
    const pref = '﻿' + XML.replace(/<(\/?)([A-Za-z]+)/g, (m, b, n) => (n === 'nfeProc' || n === 'xml' ? m : `<${b}ns:${n}`));
    expect(lerNFe(pref).numero).toBe('1234');
  });
  it('sem duplicatas devolve lista de parcelas vazia; sem vNF soma os itens', () => {
    const semCobr = XML.replace(/<cobr>[\s\S]*<\/cobr>/, '').replace('<vNF>2620.00</vNF>', '');
    const nf = lerNFe(semCobr);
    expect(nf.parcelas).toEqual([]);
    expect(nf.total).toBe(2620);
  });
  it('recusa arquivos que não são NF-e', () => {
    expect(() => lerNFe('<html><body>oi</body></html>')).toThrow(/não é uma NF-e/);
    expect(() => lerNFe('<infNFe><ide></ide></infNFe>')).toThrow(/incompleta/);
  });
  it('formata CNPJ e CPF', () => {
    expect(formatarCnpj('12345678000190')).toBe('12.345.678/0001-90');
    expect(formatarCnpj('12345678901')).toBe('123.456.789-01');
    expect(formatarCnpj('abc')).toBe('abc');
  });
});

describe('lançamento das compras', () => {
  const op = { obraId: 7, categoria: 'Insumos', status: 'Pendente' as const };
  it('uma compra por parcela, com o vencimento de cada uma', () => {
    const c = comprasDaNFe(lerNFe(XML), { ...op, modo: 'nota' });
    expect(c).toHaveLength(2);
    expect(c.map((x) => x.venc)).toEqual(['2026-11-05', '2026-12-05']);
    expect(c.map((x) => x.total)).toEqual([1310, 1310]);
    expect(c[0].desc).toBe('NF 1234 - Cerâmica Silva & Filhos Ltda (parcela 1/2)');
    expect(c[0]).toMatchObject({ obraId: 7, cat: 'Insumos', nf: '1234', cnpj: '12.345.678/0001-90', data: '2026-10-05', status: 'Pendente' });
    expect(c[0].obs).toContain('500 UN Bloco cerâmico');
    expect(c[0].obs).toContain(CHAVE);
  });
  it('nota sem parcelas vira uma compra só, sem vencimento', () => {
    const c = comprasDaNFe(lerNFe(XML.replace(/<cobr>[\s\S]*<\/cobr>/, '')), { ...op, modo: 'nota' });
    expect(c).toHaveLength(1);
    expect(c[0].total).toBe(2620); expect(c[0].venc).toBe('');
  });
  it('uma compra por item, com quantidade e valor unitário', () => {
    const c = comprasDaNFe(lerNFe(XML), { ...op, modo: 'itens' });
    expect(c.map((x) => x.desc)).toEqual(['Bloco cerâmico 14x19x29', 'Argamassa AC-II 20kg']);
    expect(c[1]).toMatchObject({ qtde: 40, unid: 'SC', unit: 25.5, total: 1020, venc: '2026-11-05' });
    expect(c.reduce((s, x) => s + x.total, 0)).toBe(2620);
  });
  it('a soma das compras bate com o total da nota', () => {
    for (const modo of ['nota', 'itens'] as const) {
      expect(comprasDaNFe(lerNFe(XML), { ...op, modo }).reduce((s, x) => s + x.total, 0)).toBe(2620);
    }
  });
  it('detecta nota já lançada (mesmo CNPJ e número)', () => {
    const nf = lerNFe(XML);
    const db: DB = { ...dbVazio(), compras: comprasDaNFe(nf, { ...op, modo: 'nota' }).map((c, i) => ({ ...c, id: i + 1 })) };
    expect(notaJaLancada(db, nf)).toBe(true);
    expect(notaJaLancada(dbVazio(), nf)).toBe(false);
    expect(notaJaLancada(db, { ...nf, numero: '9999' })).toBe(false);
  });
});

describe('máscara de CNPJ e CPF', () => {
  it('formata enquanto digita e limita a 14 dígitos', () => {
    expect(mascaraCnpjCpf('12345678901')).toBe('123.456.789-01');
    expect(mascaraCnpjCpf('12345678000190')).toBe('12.345.678/0001-90');
    expect(mascaraCnpjCpf('12.345.678/0001-90999')).toBe('12.345.678/0001-90');
    expect(mascaraCnpjCpf('abc')).toBe('');
    expect(mascaraCnpjCpf('123')).toBe('123');
  });
});
