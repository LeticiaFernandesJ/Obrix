import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LISTA_PAPEIS, PAPEIS, capturarConvite, conviteGuardado, limparConvite, nivelDaArea, normalizarPermissoes, permissoesDoPapel, podeAlterar,
  podeEditarArea, podeVerArea, resumoPermissoes, traduzirErro,
} from './equipe';

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

describe('acesso por área (papel Personalizado)', () => {
  const soCompras = { obras: 'ver', compras: 'editar', cronograma: 'ver', historico: 'ver' } as const;

  it('administrador, editor e leitor seguem as regras fixas', () => {
    expect(nivelDaArea('admin', null, 'historico')).toBe('editar');
    expect(nivelDaArea('editor', null, 'compras')).toBe('editar');
    expect(nivelDaArea('editor', null, 'historico')).toBe('ver');
    expect(nivelDaArea('leitor', null, 'obras')).toBe('ver');
    expect(nivelDaArea(null, null, 'cronograma')).toBe('editar');
  });
  it('"vê tudo e altera só as compras"', () => {
    expect(podeEditarArea('personalizado', soCompras, 'compras')).toBe(true);
    expect(podeEditarArea('personalizado', soCompras, 'obras')).toBe(false);
    expect(podeEditarArea('personalizado', soCompras, 'cronograma')).toBe(false);
    expect(podeVerArea('personalizado', soCompras, 'cronograma')).toBe(true);
    expect(podeAlterar('personalizado', soCompras)).toBe(true);
  });
  it('área marcada como "nenhum" some; sem marcação vira só consulta', () => {
    expect(podeVerArea('personalizado', { cronograma: 'nenhum' }, 'cronograma')).toBe(false);
    expect(nivelDaArea('personalizado', {}, 'compras')).toBe('ver');
    expect(nivelDaArea('personalizado', null, 'compras')).toBe('ver');
    expect(podeAlterar('personalizado', {})).toBe(false);
  });
  it('as obras nunca ficam escondidas e o histórico nunca é editável', () => {
    expect(nivelDaArea('personalizado', { obras: 'nenhum' }, 'obras')).toBe('ver');
    expect(nivelDaArea('personalizado', { historico: 'editar' }, 'historico')).toBe('ver');
    expect(normalizarPermissoes({ obras: 'nenhum', historico: 'editar', compras: 'editar' })).toEqual({ obras: 'ver', compras: 'editar', cronograma: 'ver', historico: 'ver' });
  });
  it('o ponto de partida ao personalizar copia o papel atual', () => {
    expect(permissoesDoPapel('editor')).toEqual({ obras: 'editar', compras: 'editar', cronograma: 'editar', historico: 'ver' });
    expect(permissoesDoPapel('leitor')).toEqual({ obras: 'ver', compras: 'ver', cronograma: 'ver', historico: 'ver' });
  });
  it('o resumo diz o que a pessoa altera e o que não vê', () => {
    expect(resumoPermissoes('personalizado', { compras: 'editar', cronograma: 'nenhum' })).toBe('Altera: compras e financeiro. Sem acesso: cronograma');
    expect(resumoPermissoes('personalizado', {})).toBe('Não altera nada');
    expect(resumoPermissoes('editor')).toBe('');
  });
});
