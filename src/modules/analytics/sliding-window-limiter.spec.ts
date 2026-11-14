import { SlidingWindowLimiter } from './sliding-window-limiter';

describe('SlidingWindowLimiter', () => {
  it('permite até o máximo na janela e bloqueia o excesso', () => {
    const limiter = new SlidingWindowLimiter(3, 1000);

    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('a', 100)).toBe(true);
    expect(limiter.allow('a', 200)).toBe(true);
    expect(limiter.allow('a', 300)).toBe(false);
  });

  it('libera de novo quando as tentativas saem da janela', () => {
    const limiter = new SlidingWindowLimiter(2, 1000);

    limiter.allow('a', 0);
    limiter.allow('a', 10);
    expect(limiter.allow('a', 500)).toBe(false);
    expect(limiter.allow('a', 1005)).toBe(true);
  });

  it('conta cada chave separadamente', () => {
    const limiter = new SlidingWindowLimiter(1, 1000);

    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('b', 0)).toBe(true);
    expect(limiter.allow('a', 1)).toBe(false);
  });

  it('tentativa bloqueada não estende o bloqueio', () => {
    const limiter = new SlidingWindowLimiter(1, 1000);

    limiter.allow('a', 0);
    limiter.allow('a', 900);
    expect(limiter.allow('a', 1001)).toBe(true);
  });
});
