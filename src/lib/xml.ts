/* Pequenos auxiliares para ler XML (NF-e, MS Project) sem depender do DOMParser, para funcionar igual no navegador e nos testes. */

const ENTIDADES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
export const decodificar = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTIDADES[m]).replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(+n)).trim();

export const escaparXml = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string));

/** Tira BOM, comentários e prefixos de namespace (<ns:tag> vira <tag>). */
export const limparXml = (xml: string) => xml.replace(/^\uFEFF/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(\/?)[A-Za-z0-9_]+:/g, '<$1');

const padrao = (nome: string, flags = '') => new RegExp('<' + nome + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + nome + '>', flags);

/** Conteúdo (decodificado) do primeiro <nome>...</nome> dentro do trecho, ou ''. */
export function tag(trecho: string, nome: string): string {
  const m = padrao(nome).exec(trecho);
  return m ? decodificar(m[1]) : '';
}
/** Conteúdo bruto do primeiro <nome>...</nome>; serve para achar blocos dentro de blocos. */
export function bloco(trecho: string, nome: string): string {
  const m = padrao(nome).exec(trecho);
  return m ? m[1] : '';
}
/** Todos os blocos <nome>...</nome> do trecho (conteúdo bruto). */
export function blocos(trecho: string, nome: string): string[] {
  const out: string[] = []; const re = padrao(nome, 'g');
  let m: RegExpExecArray | null; while ((m = re.exec(trecho))) out.push(m[1]);
  return out;
}
export const numero = (s: string | undefined) => { const n = parseFloat(String(s ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
