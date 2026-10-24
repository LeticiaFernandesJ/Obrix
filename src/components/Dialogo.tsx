import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal } from './ui';

interface Opcoes { titulo?: string; confirmar?: string; cancelar?: string; perigo?: boolean }
interface Ctx {
  /** Pergunta sim/não. Devolve true se a pessoa confirmou. */
  confirmar: (mensagem: string, opcoes?: Opcoes) => Promise<boolean>;
  /** Mostra um aviso com um botão "Entendi". */
  avisar: (mensagem: string, titulo?: string) => Promise<void>;
}

const DialogoCtx = createContext<Ctx | null>(null);
export const useDialogo = () => {
  const c = useContext(DialogoCtx);
  if (!c) throw new Error('useDialogo fora do provider');
  return c;
};

interface Aberto extends Opcoes { mensagem: string; aviso: boolean; resolver: (v: boolean) => void }

export function DialogoProvider({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const fila = useRef<Aberto[]>([]);

  const mostrar = useCallback((d: Aberto) => {
    setAberto((atual) => { if (atual) { fila.current.push(d); return atual; } return d; });
  }, []);
  const fechar = (v: boolean) => {
    aberto?.resolver(v);
    setAberto(fila.current.shift() ?? null);
  };

  const valor = useMemo<Ctx>(() => ({
    confirmar: (mensagem, opcoes) => new Promise<boolean>((resolver) => mostrar({ mensagem, aviso: false, resolver, ...opcoes })),
    avisar: (mensagem, titulo) => new Promise<void>((resolver) => mostrar({ mensagem, titulo, aviso: true, resolver: () => resolver() })),
  }), [mostrar]);

  return (
    <DialogoCtx.Provider value={valor}>
      {children}
      {aberto && (
        <Modal
          title={aberto.titulo ?? (aberto.aviso ? 'Aviso' : 'Confirmar')}
          onClose={() => fechar(false)}
          footer={aberto.aviso ? (
            <button className="btn btn-primary" autoFocus onClick={() => fechar(true)}>Entendi</button>
          ) : (
            <>
              <button className="btn" onClick={() => fechar(false)}>{aberto.cancelar ?? 'Cancelar'}</button>
              <button className={'btn ' + (aberto.perigo ? 'btn-danger-solid' : 'btn-primary')} autoFocus onClick={() => fechar(true)}>
                {aberto.confirmar ?? 'Confirmar'}
              </button>
            </>
          )}
        >
          <p style={{ whiteSpace: 'pre-line', color: 'var(--text)', margin: 0 }}>{aberto.mensagem}</p>
        </Modal>
      )}
    </DialogoCtx.Provider>
  );
}
