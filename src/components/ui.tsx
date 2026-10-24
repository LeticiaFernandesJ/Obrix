import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { mascaraMoeda, valorDaMascara } from '../lib/ac21';
import { Chart, type ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let contadorModal = 0;

export function Modal({ title, onClose, children, footer, size }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'lg';
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const idTitulo = useRef('modal-t-' + ++contadorModal).current;
  const fecharRef = useRef(onClose); fecharRef.current = onClose;

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const el = caixa.current;
    // foco inicial: campo marcado com autoFocus, senão o primeiro campo, senão a própria caixa
    if (el && !el.contains(document.activeElement)) {
      (el.querySelector<HTMLElement>('[autofocus], input, select, textarea') ?? el).focus();
    }
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); fecharRef.current(); return; }
      if (e.key !== 'Tab' || !el) return;
      const itens = [...el.querySelectorAll<HTMLElement>(FOCAVEIS)].filter((x) => x.offsetParent !== null);
      if (!itens.length) { e.preventDefault(); el.focus(); return; }
      const primeiro = itens[0], ultimo = itens[itens.length - 1];
      if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === el)) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener('keydown', h, true);
    return () => { document.removeEventListener('keydown', h, true); anterior?.focus?.(); };
  }, []);

  const conteudo = (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={caixa} tabIndex={-1} className={'modal' + (size ? ' ' + size : '')} role="dialog" aria-modal="true" aria-labelledby={idTitulo}>
        <div className="modal-header">
          <div className="modal-title" id={idTitulo}>{title}</div>
          <button className="modal-close" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </div>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
  // fora da barra superior e de qualquer contexto de empilhamento: a janela sempre fica por cima do menu lateral
  const destino = typeof document !== 'undefined' ? (document.querySelector('.shell') ?? document.body) : null;
  return destino ? createPortal(conteudo, destino) : conteudo;
}

/** Tema atual (atributo data-theme do <html>), reagindo quando muda. */
function useTemaAtual() {
  const [t, setT] = useState(() => document.documentElement.getAttribute('data-theme') ?? 'light');
  useEffect(() => {
    const o = new MutationObserver(() => setT(document.documentElement.getAttribute('data-theme') ?? 'light'));
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => o.disconnect();
  }, []);
  return t;
}

/** Wrapper simples do Chart.js: recria o gráfico quando a configuração ou o tema mudam. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ChartCanvas({ config, height }: { config: ChartConfiguration<any, any, any>; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const tema = useTemaAtual();
  const key = JSON.stringify(config.data) + JSON.stringify((config.options as { indexAxis?: string })?.indexAxis) + tema;
  useEffect(() => {
    if (!ref.current) return;
    // textos e linhas de grade seguem as cores do tema (claro/escuro)
    const css = getComputedStyle(document.documentElement);
    Chart.defaults.color = css.getPropertyValue('--text2').trim() || '#666';
    Chart.defaults.borderColor = css.getPropertyValue('--gray-border').trim() || 'rgba(0,0,0,.1)';
    const ch = new Chart(ref.current, config);
    return () => ch.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <div className="chart-box" style={{ height }}><canvas ref={ref} /></div>;
}

/** Mostra as primeiras linhas e deixa a pessoa pedir mais. Volta ao começo quando `chave` muda (ex.: o filtro). */
export function useLimite(chave: string, passo = 50) {
  const [limite, setLimite] = useState(passo);
  useEffect(() => { setLimite(passo); }, [chave, passo]);
  return { limite, passo, mais: () => setLimite((v) => v + passo) };
}
export function MaisLinhas({ total, limite, passo, mais }: { total: number; limite: number; passo: number; mais: () => void }) {
  if (total <= limite) return null;
  return (
    <div className="mais-linhas" role="status">
      <span>Mostrando {limite} de {total}</span>
      <button className="btn btn-sm" onClick={mais}>Mostrar mais {Math.min(passo, total - limite)}</button>
    </div>
  );
}

export function Empty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <p>{children}</p>
    </div>
  );
}

export function Progress({ value, color }: { value: number; color: string }) {
  return <div className="progress"><div className="progress-fill" style={{ width: Math.min(value, 100) + '%', background: color }} /></div>;
}

export const brMoneyTick = (v: string | number) => 'R$' + Math.round(Number(v) / 1000) + 'k';
export type TT = { dataset: { label?: string }; raw: unknown; dataIndex: number };

/** Campo de valor em reais com máscara: digite só números ("123456" → "1.234,56"). O valor guardado é "1234.56". */
export function CampoDinheiro({ id, value, onChange, placeholder = '0,00' }: {
  id?: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="adorn" data-pre="R$">
      <input id={id} type="text" inputMode="numeric" autoComplete="off" placeholder={placeholder}
        value={mascaraMoeda(value)} onChange={(e) => onChange(valorDaMascara(e.target.value))} />
    </div>
  );
}
