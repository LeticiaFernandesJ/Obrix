import type { Tarefa } from './schedule';

export const AVISO_SO_MINHAS = 'Você só pode alterar as tarefas atribuídas a você.';

/**
 * Confere uma edição feita por quem só altera as próprias tarefas (nível "minhas" do cronograma).
 * Devolve a mensagem de erro, ou null se estiver tudo certo. O banco aplica a mesma regra; aqui evitamos
 * mostrar na tela uma alteração que nunca seria gravada.
 */
export function validarEdicaoMinhas(antes: Tarefa[], depois: Tarefa[], userId: string | null): string | null {
  if (!userId || antes.length !== depois.length) return AVISO_SO_MINHAS;
  for (let i = 0; i < antes.length; i++) {
    const a = antes[i], b = depois[i];
    if (a.id !== b.id) return AVISO_SO_MINHAS; // linha criada, apagada ou movida
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (a.respId !== userId) return AVISO_SO_MINHAS; // mexeu na tarefa de outra pessoa
    // da própria tarefa não dá para mudar o responsável, o nível nem a linha de base
    if (a.resp !== b.resp || a.respId !== b.respId || a.nivel !== b.nivel || JSON.stringify(a.bl) !== JSON.stringify(b.bl)) return AVISO_SO_MINHAS;
  }
  return null;
}
