import { describe, expect, it } from 'vitest';
import { AVISO_SO_MINHAS, validarEdicaoMinhas } from './minhasTarefas';
import { novaTarefa } from './schedule';

const EU = 'u-eu', OUTRO = 'u-outro';
const lista = () => [
  novaTarefa({ id: 'a', nome: 'Da outra pessoa', resp: 'Ana', respId: OUTRO }),
  novaTarefa({ id: 'b', nome: 'Minha', resp: 'Eu', respId: EU, pct: 10 }),
  novaTarefa({ id: 'c', nome: 'Sem responsável da equipe', resp: 'Equipe externa' }),
];
const copia = () => JSON.parse(JSON.stringify(lista())) as ReturnType<typeof lista>;

describe('quem altera só as próprias tarefas', () => {
  it('pode mudar a própria tarefa (avanço, datas, duração, nome)', () => {
    const d = copia(); d[1].pct = 80; d[1].dur = 7; d[1].nome = 'Minha, renomeada'; d[1].rIni = 20000;
    expect(validarEdicaoMinhas(lista(), d, EU)).toBeNull();
  });
  it('sem mudança nenhuma também passa', () => {
    expect(validarEdicaoMinhas(lista(), copia(), EU)).toBeNull();
  });
  it('não mexe na tarefa de outra pessoa nem na que não tem responsável da equipe', () => {
    const a = copia(); a[0].pct = 50;
    expect(validarEdicaoMinhas(lista(), a, EU)).toBe(AVISO_SO_MINHAS);
    const c = copia(); c[2].nome = 'x';
    expect(validarEdicaoMinhas(lista(), c, EU)).toBe(AVISO_SO_MINHAS);
  });
  it('não passa a própria tarefa para outro, nem troca o nome do responsável, o nível ou a linha de base', () => {
    const r = copia(); r[1].respId = OUTRO;
    expect(validarEdicaoMinhas(lista(), r, EU)).toBe(AVISO_SO_MINHAS);
    const n = copia(); n[1].resp = 'Outro nome';
    expect(validarEdicaoMinhas(lista(), n, EU)).toBe(AVISO_SO_MINHAS);
    const v = copia(); v[1].nivel = 1;
    expect(validarEdicaoMinhas(lista(), v, EU)).toBe(AVISO_SO_MINHAS);
    const b = copia(); b[1].bl = { i: 1, f: 2 };
    expect(validarEdicaoMinhas(lista(), b, EU)).toBe(AVISO_SO_MINHAS);
  });
  it('não pega para si a tarefa dos outros', () => {
    const d = copia(); d[0].respId = EU; d[0].resp = 'Eu';
    expect(validarEdicaoMinhas(lista(), d, EU)).toBe(AVISO_SO_MINHAS);
  });
  it('não cria, apaga nem muda a ordem das linhas', () => {
    const mais = copia(); mais.push(novaTarefa({ id: 'd', respId: EU }));
    expect(validarEdicaoMinhas(lista(), mais, EU)).toBe(AVISO_SO_MINHAS);
    const menos = copia().slice(0, 2);
    expect(validarEdicaoMinhas(lista(), menos, EU)).toBe(AVISO_SO_MINHAS);
    const troca = copia(); [troca[1], troca[2]] = [troca[2], troca[1]];
    expect(validarEdicaoMinhas(lista(), troca, EU)).toBe(AVISO_SO_MINHAS);
  });
  it('sem usuário identificado nada passa', () => {
    expect(validarEdicaoMinhas(lista(), copia(), null)).toBe(AVISO_SO_MINHAS);
  });
});
