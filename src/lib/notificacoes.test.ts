import { describe, expect, it } from 'vitest';
import { tempoRelativo } from './notificacoes';

describe('tempo relativo das notificações', () => {
  const agora = new Date('2026-10-24T15:00:00Z').getTime();
  const antes = (min: number) => new Date(agora - min * 60000).toISOString();
  it('agora, minutos, horas, ontem e dias', () => {
    expect(tempoRelativo(antes(0), agora)).toBe('agora');
    expect(tempoRelativo(antes(5), agora)).toBe('há 5 min');
    expect(tempoRelativo(antes(3 * 60), agora)).toBe('há 3 h');
    expect(tempoRelativo(antes(30 * 60), agora)).toBe('ontem');
    expect(tempoRelativo(antes(4 * 24 * 60), agora)).toBe('há 4 dias');
  });
  it('depois de uma semana mostra a data; data inválida fica vazia', () => {
    expect(tempoRelativo(antes(20 * 24 * 60), agora)).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(tempoRelativo('???', agora)).toBe('');
  });
});
