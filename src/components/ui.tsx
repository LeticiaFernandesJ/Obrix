import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Chart, type ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

export function Modal({ title, onClose, children, footer, size }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'lg';
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal' + (size ? ' ' + size : '')} role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </div>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/** Wrapper simples do Chart.js: recria o gráfico quando a configuração muda. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ChartCanvas({ config, height }: { config: ChartConfiguration<any, any, any>; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(config.data) + JSON.stringify((config.options as { indexAxis?: string })?.indexAxis);
  useEffect(() => {
    if (!ref.current) return;
    const ch = new Chart(ref.current, config);
    return () => ch.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <div className="chart-box" style={{ height }}><canvas ref={ref} /></div>;
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
