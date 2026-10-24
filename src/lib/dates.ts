/* Datas do cronograma: dia = inteiro (0 = 1970-01-01, sempre UTC). */
export const DIA = 86400000;
export const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MESL = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export function n2iso(n: number): string {
  return new Date(n * DIA).toISOString().slice(0, 10);
}
export function iso2n(s?: string | null): number | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DIA);
}
export function n2br(n: number | null | undefined): string {
  if (n == null) return '';
  const d = new Date(n * DIA);
  return (
    String(d.getUTCDate()).padStart(2, '0') + '/' +
    String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear()
  );
}
export function n2brc(n: number | null | undefined): string {
  if (n == null) return '';
  const d = new Date(n * DIA);
  return String(d.getUTCDate()).padStart(2, '0') + '/' + MES[d.getUTCMonth()];
}
export function dow(n: number): number {
  return (((n % 7) + 4 + 7) % 7);
}
export function hojeN(): number {
  const d = new Date();
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DIA);
}
/** aceita 12/03/2026, 12-03-26, 2026-03-12, 12/03 */
export function parseData(txt: unknown): number | null {
  if (txt == null) return null;
  const s = String(txt).trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DIA);
  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(s);
  if (m) {
    let a = m[3] ? +m[3] : new Date(hojeN() * DIA).getUTCFullYear();
    if (a < 100) a += 2000;
    return Math.round(Date.UTC(a, +m[2] - 1, +m[1]) / DIA);
  }
  const t = Date.parse(s);
  return isNaN(t) ? null : Math.round(t / DIA);
}
