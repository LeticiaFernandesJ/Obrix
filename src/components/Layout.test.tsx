import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { podeEditarArea, podeVerArea, type Papel, type Permissoes } from '../lib/equipe';

const ctx = vi.hoisted(() => ({ papel: 'admin' as Papel, permissoes: null as Permissoes | null }));

vi.mock('../store/AppStore', async () => {
  const eq = await import('../lib/equipe');
  return {
    useApp: () => ({
      toastMsg: null, readOnly: false, tema: 'light', alternarTema: () => undefined, usuario: 'ana@x.com', nomeUsuario: 'Ana', sair: null,
      nuvem: 'salvo', recarregarNuvem: () => undefined, tentarSincronizar: () => undefined, orgId: 'o1', orgNome: 'Alfa', papel: ctx.papel,
      podeVerArea: (a: never) => eq.podeVerArea(ctx.papel, ctx.permissoes, a),
      podeEditarArea: (a: never) => eq.podeEditarArea(ctx.papel, ctx.permissoes, a),
      db: { obras: [], compras: [], historico: [] }, exportarTudo: () => ({}), importarDB: () => true, registrarHistorico: () => undefined, toast: () => undefined,
    }),
  };
});
vi.mock('./Dialogo', () => ({ useDialogo: () => ({ confirmar: async () => true, avisar: async () => undefined }) }));
vi.mock('./AlertasSino', () => ({ AlertasSino: () => null }));
vi.mock('../pages/crono/CronoActions', () => ({ CronoActions: () => null }));
vi.mock('../lib/pwa', () => ({ useInstalar: () => ({ podeInstalar: false, instalarNoIos: false, instalar: async () => undefined }) }));

import Layout from './Layout';

const tela = (rota: string) => renderToString(
  <MemoryRouter initialEntries={[rota]}>
    <Routes><Route element={<Layout />}><Route path="*" element={<div>conteúdo da tela</div>} /></Route><Route path="/" element={<div>inicio</div>} /></Routes>
  </MemoryRouter>,
);

describe('menu e telas conforme o acesso', () => {
  it('"vê tudo e altera só as compras": todas as telas aparecem', () => {
    ctx.papel = 'personalizado'; ctx.permissoes = { obras: 'ver', compras: 'editar', cronograma: 'ver', historico: 'ver' };
    const html = tela('/compras');
    ['Compras', 'Financeiro', 'Histórico', 'Cronograma', 'Painel PMO'].forEach((t) => expect(html).toContain(t));
    expect(html).toContain('conteúdo da tela');
    expect(podeEditarArea(ctx.papel, ctx.permissoes, 'obras')).toBe(false);
    expect(podeVerArea(ctx.papel, ctx.permissoes, 'cronograma')).toBe(true);
  });
  it('sem acesso ao cronograma e ao histórico: somem do menu e o endereço volta ao início', () => {
    ctx.papel = 'personalizado'; ctx.permissoes = { compras: 'editar', cronograma: 'nenhum', historico: 'nenhum' };
    const html = tela('/compras');
    expect(html).toContain('Financeiro');
    ['Cronograma', 'Painel PMO', 'Histórico'].forEach((t) => expect(html).not.toContain('>' + t + '<'));
    expect(tela('/cronograma')).not.toContain('conteúdo da tela');
    expect(tela('/historico')).not.toContain('conteúdo da tela');
  });
  it('sem acesso a compras: some Compras e Financeiro', () => {
    ctx.papel = 'personalizado'; ctx.permissoes = { compras: 'nenhum' };
    const html = tela('/obras');
    expect(html).not.toContain('Financeiro');
    expect(tela('/financeiro')).not.toContain('conteúdo da tela');
  });
});
