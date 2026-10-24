import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIMITE_LINK_BYTES, LIMITE_LINK_TEXTO, desempacotar, empacotar, exemplo } from './schedule';

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function comprimir(bytes: Uint8Array): Promise<string> {
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter(); void w.write(bytes as unknown as BufferSource); void w.close();
  return 'z' + b64u(new Uint8Array(await new Response(cs.readable).arrayBuffer()));
}

afterEach(() => vi.useRealTimers());

describe('link compartilhado do cronograma', () => {
  it('ida e volta mantém o cronograma', async () => {
    const S = exemplo();
    const volta = await desempacotar(await empacotar(S));
    expect(volta.tarefas.length).toBe(S.tarefas.length);
    expect(volta.meta.nome).toBe(S.meta.nome);
  });

  it('link com validade abre dentro do prazo e expira depois', async () => {
    const link = await empacotar(exemplo(), 7);
    expect((await desempacotar(link)).tarefas.length).toBeGreaterThan(0);
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 8 * 86400000);
    await expect(desempacotar(link)).rejects.toThrow(/expirou/);
  });

  it('sem validade nunca expira', async () => {
    const link = await empacotar(exemplo(), 0);
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 3650 * 86400000);
    expect((await desempacotar(link)).tarefas.length).toBeGreaterThan(0);
  });

  it('recusa link que descomprime para algo gigante (bomba de compressão)', async () => {
    const link = await comprimir(new Uint8Array(LIMITE_LINK_BYTES + 1024 * 1024)); // poucos KB comprimido
    expect(link.length).toBeLessThan(LIMITE_LINK_TEXTO);
    await expect(desempacotar(link)).rejects.toThrow(/grande demais/);
  });

  it('recusa texto de link enorme antes de tentar abrir', async () => {
    await expect(desempacotar('z' + 'A'.repeat(LIMITE_LINK_TEXTO + 10))).rejects.toThrow(/grande demais/);
  });
});
