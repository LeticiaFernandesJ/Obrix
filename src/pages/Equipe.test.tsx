import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

const ctx = vi.hoisted(() => ({
  papel: 'admin' as 'admin' | 'editor' | 'leitor',
  orgs: [] as { id: string; nome: string; papel: string }[],
}));

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) }, from: () => ({}) },
  supabaseAtivo: true,
}));
vi.mock('../components/Dialogo', () => ({ useDialogo: () => ({ confirmar: async () => true, avisar: async () => undefined }) }));
vi.mock('../store/AppStore', () => ({
  useApp: () => ({
    orgId: 'org1', orgNome: 'Construtora Alfa', orgs: ctx.orgs, papel: ctx.papel, usuario: 'ana@x.com',
    trocarOrg: () => undefined, recarregarOrgs: () => undefined, toast: () => undefined,
  }),
}));

import Equipe from './Equipe';

describe('tela Equipe (primeira renderização)', () => {
  it('administrador vê o nome editável e a área de convites', () => {
    ctx.papel = 'admin'; ctx.orgs = [{ id: 'org1', nome: 'Construtora Alfa', papel: 'admin' }];
    const html = renderToString(<Equipe />);
    expect(html).toContain('Construtora Alfa');
    expect(html).toContain('Administrador');
    expect(html).toContain('Convidar pessoas');
    expect(html).toContain('Salvar nome');
    expect(html).not.toContain('Trocar de organização'); // só uma organização
  });
  it('leitor não vê convites nem pode renomear', () => {
    ctx.papel = 'leitor'; ctx.orgs = [{ id: 'org1', nome: 'Construtora Alfa', papel: 'leitor' }];
    const html = renderToString(<Equipe />);
    expect(html).not.toContain('Convidar pessoas');
    expect(html).not.toContain('Salvar nome');
    expect(html).toContain('Só administradores convidam');
    expect(html).toContain('disabled');
  });
  it('mostra o seletor quando a pessoa está em mais de uma organização', () => {
    ctx.papel = 'editor';
    ctx.orgs = [{ id: 'org1', nome: 'Construtora Alfa', papel: 'editor' }, { id: 'org2', nome: 'Obras Beta', papel: 'admin' }];
    const html = renderToString(<Equipe />);
    expect(html).toContain('Trocar de organização');
    expect(html).toContain('Obras Beta');
  });
});
