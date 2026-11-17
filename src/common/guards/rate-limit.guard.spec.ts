import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard, clientIp, resetRateLimits } from './rate-limit.guard';
import { StoreOrdersController } from '../../modules/orders/infrastructure/controllers/store-orders.controller';
import { PaymentsController } from '../../modules/payments/infrastructure/controllers/payments.controller';

const METADATA_KEY = 'rate-limit-options';

function context(headers: Record<string, string> = {}, ip = '10.0.0.1') {
  const setHeader = jest.fn();
  const ctx = {
    getHandler: () => handler,
    getClass: () => Klass,
    switchToHttp: () => ({
      getRequest: () => ({ headers, ip }),
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  return { ctx, setHeader };
}
function handler() {}
class Klass {}

const guardWith = (
  options: { name: string; limit: number; windowMs: number } | undefined,
) =>
  new RateLimitGuard({
    getAllAndOverride: jest.fn().mockReturnValue(options),
  } as unknown as Reflector);

beforeEach(() => {
  resetRateLimits();
  delete process.env.RATE_LIMIT_PROXY_HOPS;
  jest.useRealTimers();
});

describe('RateLimitGuard (D)', () => {
  it('libera até o limite e responde 429 na chamada seguinte, com Retry-After', () => {
    const guard = guardWith({ name: 't', limit: 3, windowMs: 60_000 });
    const { ctx, setHeader } = context();
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);

    let error: HttpException | undefined;
    try {
      guard.canActivate(ctx);
    } catch (e) {
      error = e as HttpException;
    }
    expect(error).toBeInstanceOf(HttpException);
    expect(error?.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('cada IP e cada nome de limite têm a sua contagem', () => {
    const guard = guardWith({ name: 'a', limit: 1, windowMs: 60_000 });
    const one = context({}, '1.1.1.1').ctx;
    const two = context({}, '2.2.2.2').ctx;
    expect(guard.canActivate(one)).toBe(true);
    expect(guard.canActivate(two)).toBe(true);
    expect(() => guard.canActivate(one)).toThrow(HttpException);

    const other = guardWith({ name: 'b', limit: 1, windowMs: 60_000 });
    expect(other.canActivate(one)).toBe(true);
  });

  it('a janela vence e o IP volta a poder chamar', () => {
    jest.useFakeTimers();
    const guard = guardWith({ name: 'janela', limit: 1, windowMs: 1000 });
    const { ctx } = context();
    expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
    jest.advanceTimersByTime(1500);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rota sem limite configurado passa direto', () => {
    const guard = guardWith(undefined);
    const { ctx } = context();
    for (let i = 0; i < 50; i++) expect(guard.canActivate(ctx)).toBe(true);
  });

  it('IP do cliente: último valor de x-forwarded-for (o proxy acrescenta no fim); o início é falsificável', () => {
    expect(
      clientIp({
        headers: { 'x-forwarded-for': '9.9.9.9, 203.0.113.7' },
        ip: '10.0.0.1',
      }),
    ).toBe('203.0.113.7');
    // cliente tentando se passar por outro IP não troca a chave
    expect(
      clientIp({
        headers: { 'x-forwarded-for': '8.8.8.8, 203.0.113.7' },
        ip: '10.0.0.1',
      }),
    ).toBe('203.0.113.7');
    expect(clientIp({ headers: {}, ip: '10.0.0.1' })).toBe('10.0.0.1');
    process.env.RATE_LIMIT_PROXY_HOPS = '2';
    expect(
      clientIp({
        headers: { 'x-forwarded-for': '198.51.100.4, 203.0.113.7' },
        ip: '10.0.0.1',
      }),
    ).toBe('198.51.100.4');
  });
});

describe('limites aplicados nas rotas (D)', () => {
  const meta = (proto: object, method: string) =>
    Reflect.getMetadata(
      METADATA_KEY,
      (proto as Record<string, object>)[method],
    ) as { name: string; limit: number; windowMs: number } | undefined;

  it('criação de pedido da loja, Pix e cartão do Mercado Pago têm limite por IP', () => {
    expect(meta(StoreOrdersController.prototype, 'create')).toMatchObject({
      name: 'store-order',
      limit: 10,
    });
    expect(
      meta(PaymentsController.prototype, 'createMercadoPagoPix'),
    ).toMatchObject({ name: 'mp-pix' });
    expect(
      meta(PaymentsController.prototype, 'createMercadoPagoCard'),
    ).toMatchObject({ name: 'mp-card', limit: 10 });
  });

  it('webhooks e verificação de status também (cada chamada pode consultar o provedor)', () => {
    expect(meta(PaymentsController.prototype, 'handleWebhook')).toMatchObject({
      name: 'webhook',
    });
    expect(
      meta(PaymentsController.prototype, 'handleMercadoPagoWebhook'),
    ).toMatchObject({ name: 'mp-webhook' });
    expect(meta(PaymentsController.prototype, 'checkStatus')).toMatchObject({
      name: 'check-status',
    });
  });

  it('o guard está ligado a essas rotas', () => {
    const guards = (proto: object, method: string) =>
      Reflect.getMetadata(
        '__guards__',
        (proto as Record<string, object>)[method],
      ) as unknown[];
    expect(guards(StoreOrdersController.prototype, 'create')).toContain(
      RateLimitGuard,
    );
    expect(
      guards(PaymentsController.prototype, 'createMercadoPagoCard'),
    ).toContain(RateLimitGuard);
    expect(
      guards(PaymentsController.prototype, 'createMercadoPagoPix'),
    ).toContain(RateLimitGuard);
  });
});
