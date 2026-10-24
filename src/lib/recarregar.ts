/**
 * Depois de uma nova versão publicada, uma aba que ficou aberta pode tentar carregar uma tela
 * (arquivo) que já não existe no servidor. Recarregar a página resolve; fazemos isso no máximo
 * uma vez a cada 15 segundos, para nunca entrar em laço de recarregamento.
 */
export function recarregarUmaVez(): boolean {
  const chave = 'obrix-recarregou';
  try {
    const ultimo = Number(sessionStorage.getItem(chave) || 0);
    if (Date.now() - ultimo < 15000) return false;
    sessionStorage.setItem(chave, String(Date.now()));
  } catch { /* sem sessionStorage: recarrega mesmo assim */ }
  location.reload();
  return true;
}

/** Erro típico de "arquivo da tela não encontrado" (nova versão publicada). */
export const ehErroDeArquivoAntigo = (e: unknown) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError|Unable to preload/i.test(
    e instanceof Error ? e.message : String(e),
  );
