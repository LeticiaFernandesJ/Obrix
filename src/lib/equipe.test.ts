import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LISTA_PAPEIS, PAPEIS, capturarConvite, conviteGuardado, limparConvite, podeAlterar, traduzirErro } from './equipe';

describe('papéis', () => {
  it('só administrador e editor alteram dados; sem papel (uso local) também pode', () => {
    expect(podeAlterar('admin')).toBe(true);
    expect(podeAlterar('editor')).toBe(true);
    expect(podeAlterar('leitor')).toBe(false);
    expect(podeAlterar(null)).toBe(true);
  });
  it('todo papel tem nome e descrição', () => {
    LISTA_PAPEIS.forEach((p) => { expect(PAPEIS[p].rotulo.length).toBeGreaterThan(2); expect(PAPEIS[p].descricao.length).toBeGreaterThan(10); });
  });
});

describe('mensagens de erro', () => {
  it('traduz os erros do banco para o português', () => {
    expect(traduzirErro('Convite inválido ou expirado')).toMatch(/novo link/);
    expect(traduzirErro('A organização precisa ter pelo menos um administrador')).toMatch(/pelo menos um administrador/);
    expect(traduzirErro('new row violates row-level security policy')).toMatch(/permissão/);
    expect(traduzirErro('Failed to fetch')).toMatch(/conexão/);
    expect(traduzirErro('algo desconhecido')).toBe('algo desconhecido');
  });
});

describe('link de convite', () => {
  const guardado = new Map<string, string>();
  let endereco = '';
  beforeEach(() => {
    guardado.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => guardado.get(k) ?? null,
      setItem: (k: string, v: string) => { guardado.set(k, v); },
      removeItem: (k: string) => { guardado.delete(k); },
    });
    const abrir = (url: string) => {
      endereco = url;
      const u = new URL(url);
      vi.stubGlobal('location', { href: url, search: u.search, origin: u.origin });
    };
    abrir('https://exemplo.com/Obrix/?convite=0b0f9b3e-1c1a-4a53-9d8f-2f0d6a1c9e11&x=1');
    vi.stubGlobal('history', { replaceState: (_s: unknown, _t: string, url: string) => { endereco = 'https://exemplo.com' + url; } });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('guarda o código e o tira do endereço', () => {
    capturarConvite();
    expect(conviteGuardado()).toBe('0b0f9b3e-1c1a-4a53-9d8f-2f0d6a1c9e11');
    expect(endereco).not.toContain('convite');
    expect(endereco).toContain('x=1'); // os outros parâmetros ficam
  });
  it('ignora código que não é um UUID', () => {
    vi.stubGlobal('location', { href: 'https://exemplo.com/?convite=abc', search: '?convite=abc', origin: 'https://exemplo.com' });
    capturarConvite();
    expect(conviteGuardado()).toBeNull();
  });
  it('limpa depois de usado', () => {
    capturarConvite(); limparConvite();
    expect(conviteGuardado()).toBeNull();
  });
});
