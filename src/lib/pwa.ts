import { useEffect, useState } from 'react';

interface EventoInstalar extends Event { prompt: () => Promise<void> }

/* O navegador pode disparar este evento antes do React montar: guardamos já na carga do módulo. */
let guardado: EventoInstalar | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); guardado = e as EventoInstalar; avisar(); });
  window.addEventListener('appinstalled', () => { guardado = null; avisar(); });
}

const jaInstalado = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** Controla o botão "Instalar aplicativo". */
export function useInstalar() {
  const [, forca] = useState(0);
  useEffect(() => { const f = () => forca((n) => n + 1); ouvintes.add(f); return () => { ouvintes.delete(f); }; }, []);
  const ios = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  return {
    podeInstalar: !!guardado && !jaInstalado(),
    instalado: jaInstalado(),
    instalarNoIos: ios && !jaInstalado(),
    instalar: async () => { if (!guardado) return; const e = guardado; guardado = null; avisar(); await e.prompt(); },
  };
}
