import {
  MAX_REFRESH_SESSIONS,
  REFRESH_ROTATION_GRACE_MS,
  addRefreshSession,
  matchesRefreshSession,
  removeRefreshSession,
  rotateRefreshSession,
} from './refresh-sessions';
import { hashRefreshToken } from './refresh-token-hash';

const count = (stored: string | null) => (stored ? stored.split(',') : []);
const permanentCount = (stored: string | null) =>
  count(stored).filter((e) => !e.includes('@')).length;

describe('refresh-sessions', () => {
  const now = 1_700_000_000_000;

  it('aceita o formato legado (um hash puro)', () => {
    expect(matchesRefreshSession(hashRefreshToken('a'), 'a', now)).toBe(true);
    expect(matchesRefreshSession(hashRefreshToken('a'), 'b', now)).toBe(false);
  });

  it('nega quando não há nada guardado (logout / troca de senha)', () => {
    expect(matchesRefreshSession(null, 'a', now)).toBe(false);
    expect(matchesRefreshSession('', 'a', now)).toBe(false);
  });

  it('login em outro aparelho NÃO derruba a sessão anterior', () => {
    const afterA = addRefreshSession(null, 'tokenA', now);
    const afterB = addRefreshSession(afterA, 'tokenB', now);
    expect(matchesRefreshSession(afterB, 'tokenA', now)).toBe(true);
    expect(matchesRefreshSession(afterB, 'tokenB', now)).toBe(true);
  });

  it('migra o formato legado ao acrescentar uma sessão', () => {
    const next = addRefreshSession(hashRefreshToken('velho'), 'novo', now);
    expect(matchesRefreshSession(next, 'velho', now)).toBe(true);
    expect(matchesRefreshSession(next, 'novo', now)).toBe(true);
  });

  it('rotação troca só a sessão do token e preserva as outras', () => {
    let stored: string | null = addRefreshSession(null, 'A1', now);
    stored = addRefreshSession(stored, 'B1', now);
    stored = rotateRefreshSession(stored, 'A1', 'A2', now);
    expect(matchesRefreshSession(stored, 'A2', now)).toBe(true);
    expect(matchesRefreshSession(stored, 'B1', now)).toBe(true);
  });

  describe('M1: carência curta e sem sessão permanente a mais', () => {
    it('a carência é curta (<= 15 s)', () => {
      expect(REFRESH_ROTATION_GRACE_MS).toBeLessThanOrEqual(15_000);
    });

    it('o token rotacionado vale só durante a carência', () => {
      let stored: string | null = addRefreshSession(null, 'A1', now);
      stored = rotateRefreshSession(stored, 'A1', 'A2', now);
      expect(matchesRefreshSession(stored, 'A1', now + 1000)).toBe(true);
      const late = now + REFRESH_ROTATION_GRACE_MS + 1;
      expect(matchesRefreshSession(stored, 'A1', late)).toBe(false);
      expect(matchesRefreshSession(stored, 'A2', late)).toBe(true);
    });

    it('repetir o token em carência NÃO cria sessão permanente nova', () => {
      let stored: string | null = addRefreshSession(null, 'A1', now);
      stored = rotateRefreshSession(stored, 'A1', 'A2', now);
      expect(permanentCount(stored)).toBe(1);

      // ladrão (ou aba atrasada) repete A1 dentro da carência
      stored = rotateRefreshSession(stored, 'A1', 'LADRAO', now + 1000);
      expect(stored).not.toBeNull();
      expect(permanentCount(stored)).toBe(1);
    });

    it('token em carência SUBSTITUI a sessão atual; o dono tem a carência para renovar', () => {
      let stored: string | null = addRefreshSession(null, 'A1', now);
      stored = rotateRefreshSession(stored, 'A1', 'A2', now);
      stored = rotateRefreshSession(stored, 'A1', 'A3', now + 1000);

      // sessão atual é A3; A2 (o dono) ainda vale pela carência
      expect(matchesRefreshSession(stored, 'A3', now + 2000)).toBe(true);
      expect(matchesRefreshSession(stored, 'A2', now + 2000)).toBe(true);
      // o dono renova com A2 dentro da carência e a sessão continua única
      stored = rotateRefreshSession(stored, 'A2', 'A4', now + 3000);
      expect(permanentCount(stored)).toBe(1);
      expect(matchesRefreshSession(stored, 'A4', now + 3000)).toBe(true);
    });

    it('depois da carência, repetir o token antigo não rotaciona (null)', () => {
      let stored: string | null = addRefreshSession(null, 'A1', now);
      stored = rotateRefreshSession(stored, 'A1', 'A2', now);
      const late = now + REFRESH_ROTATION_GRACE_MS + 1;
      expect(rotateRefreshSession(stored, 'A1', 'X', late)).toBeNull();
    });

    it('entradas com carência vencida são descartadas ao gravar', () => {
      let stored: string | null = addRefreshSession(null, 'A1', now);
      stored = rotateRefreshSession(stored, 'A1', 'A2', now);
      const later = now + REFRESH_ROTATION_GRACE_MS + 5;
      stored = addRefreshSession(stored, 'B1', later);
      expect(count(stored)).toHaveLength(2);
      expect(stored).not.toContain('@');
    });

    it('token desconhecido não rotaciona', () => {
      const stored = addRefreshSession(null, 'A1', now);
      expect(rotateRefreshSession(stored, 'lixo', 'X', now)).toBeNull();
    });
  });

  describe('M2: remover só a sessão do token (logout)', () => {
    it('remove a sessão do token e preserva as dos outros aparelhos', () => {
      let stored: string | null = addRefreshSession(null, 'PC', now);
      stored = addRefreshSession(stored, 'CEL', now);
      const after = removeRefreshSession(stored, 'PC', now);
      expect(matchesRefreshSession(after, 'PC', now)).toBe(false);
      expect(matchesRefreshSession(after, 'CEL', now)).toBe(true);
    });

    it('remove também as carências da sessão (token antigo não ressuscita)', () => {
      let stored: string | null = addRefreshSession(null, 'PC1', now);
      stored = addRefreshSession(stored, 'CEL', now);
      stored = rotateRefreshSession(stored, 'PC1', 'PC2', now);
      // logout com o token novo: o antigo (em carência) morre junto
      const after = removeRefreshSession(stored, 'PC2', now + 100);
      expect(matchesRefreshSession(after, 'PC1', now + 100)).toBe(false);
      expect(matchesRefreshSession(after, 'PC2', now + 100)).toBe(false);
      expect(matchesRefreshSession(after, 'CEL', now + 100)).toBe(true);
    });

    it('logout com token em carência remove a sessão atual inteira', () => {
      let stored: string | null = addRefreshSession(null, 'PC1', now);
      stored = rotateRefreshSession(stored, 'PC1', 'PC2', now);
      const after = removeRefreshSession(stored, 'PC1', now + 100);
      expect(matchesRefreshSession(after, 'PC2', now + 100)).toBe(false);
    });

    it('última sessão: devolve string vazia; token desconhecido: null', () => {
      const stored = addRefreshSession(null, 'PC', now);
      expect(removeRefreshSession(stored, 'PC', now)).toBe('');
      expect(removeRefreshSession(stored, 'outro', now)).toBeNull();
    });
  });

  it('limita o número de sessões e descarta as mais antigas', () => {
    let stored: string | null = null;
    for (let i = 0; i < MAX_REFRESH_SESSIONS + 3; i++) {
      stored = addRefreshSession(stored, `t${i}`, now);
    }
    expect(matchesRefreshSession(stored, 't0', now)).toBe(false);
    expect(matchesRefreshSession(stored, 't2', now)).toBe(false);
    expect(matchesRefreshSession(stored, 't3', now)).toBe(true);
    expect(
      matchesRefreshSession(stored, `t${MAX_REFRESH_SESSIONS + 2}`, now),
    ).toBe(true);
  });
});
