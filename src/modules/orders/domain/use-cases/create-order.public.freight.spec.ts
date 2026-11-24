import { BadRequestException, Logger } from '@nestjs/common';
import { CreateOrderUseCase } from './create-order.use-case';
import { sanitizePublicOrderInput } from '../utils/public-order-rules';
import {
  PublicFreightService,
  FREIGHT_CHANGED_MESSAGE,
  resetFreightCache,
} from '../services/public-freight.service';
import {
  GoogleRoutesClient,
  GoogleRoutesError,
} from '../../infrastructure/google-routes.client';

type Fields = Record<string, any>;

// Pedido público de ponta a ponta no servidor: preço do catálogo + frete por distância (Google mockado).
const RANGES = [
  { id: 'a', distancia: 2, valor: 5 },
  { id: 'b', distancia: 5, valor: 8 },
  { id: 'c', distancia: 10, valor: 12 },
];

function build(
  opts: {
    km?: number | Error;
    settings?: Fields;
    coupon?: { discountAmount: number; type: string };
  } = {},
) {
  const saveWithStockDecrement = jest
    .fn()
    .mockImplementation((saved: Fields) =>
      Promise.resolve({ ...saved, id: 'o1', items: saved.items ?? [] }),
    );
  const km = opts.km ?? 3;
  const distanceKm = jest.fn(() =>
    km instanceof Error ? Promise.reject(km) : Promise.resolve(km),
  );
  const prisma = {
    product: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'p1',
        title: 'Pod X',
        price: 50,
        promotionalPrice: null,
        isVisible: true,
        items: [{ id: 'pi1', stock: 20, options: [] }],
      }),
      update: jest.fn(),
    },
    orderBump: { findUnique: jest.fn() },
    combo: { findUnique: jest.fn() },
    loyaltyProgram: { findUnique: jest.fn() },
    loyaltyCard: { findFirst: jest.fn(), update: jest.fn() },
    loyaltyRewardRedemption: { create: jest.fn(), findFirst: jest.fn() },
    loyaltyTransaction: { create: jest.fn() },
  };
  const coupon = opts.coupon;
  const useCase = new CreateOrderUseCase(
    { saveWithStockDecrement } as never,
    {
      execute: jest.fn().mockResolvedValue({
        coupon: coupon ? { id: 'c1', type: coupon.type } : null,
        discountAmount: coupon?.discountAmount ?? 0,
      }),
    } as never,
    {
      findById: jest.fn().mockResolvedValue({ currentUses: 0 }),
      update: jest.fn(),
    } as never,
    { sendNotifications: jest.fn() } as never,
    { findAll: jest.fn().mockResolvedValue([]) } as never,
    { emitNovoPedido: jest.fn() } as never,
    {
      notifyNewOrder: jest.fn(),
      notifyOrderUpdated: jest.fn(),
      server: { emit: jest.fn() }, emitToStore: jest.fn(), notifyCatalogRefresh: jest.fn(),
    } as never,
    { getStoreId: jest.fn().mockReturnValue('store-1') } as never,
    {
      get: jest.fn().mockResolvedValue({
        promoPaymentMethods: ['pix'],
        paymentGateways: {},
        paymentRules: [],
        street: 'Rua 14 de Julho',
        number: '539',
        city: 'Campo Grande',
        state: 'MS',
        cep: '79002-330',
        storePickupEnabled: true,
        deliveryType: 'DISTANCE',
        deliveryRanges: { ranges: RANGES, allowAboveMax: false },
        ...opts.settings,
      }),
    } as never,
    prisma as never,
    {} as never,
    new PublicFreightService({ distanceKm } as unknown as GoogleRoutesClient),
  );
  return { useCase, saveWithStockDecrement, distanceKm };
}

const body = (extra: Fields = {}): Fields => ({
  customerName: 'Ana Souza',
  customerPhone: '67999990000',
  deliveryModality: 'DELIVERY',
  street: 'Rua Goiânia, 2386',
  number: '2386',
  neighborhood: 'Centro',
  city: 'Campo Grande',
  state: 'MS',
  cep: '79000-000',
  paymentType: 'online',
  paymentMethod: 'credit',
  items: [{ productId: 'p1', productName: 'Pod X', quantity: 2, price: 50 }],
  itemsTotal: 100,
  freight: 8,
  totalOrder: 108,
  totalReceived: 108,
  ...extra,
});

async function create(setup: Parameters<typeof build>[0], data: Fields) {
  const { useCase, saveWithStockDecrement, distanceKm } = build(setup);
  const error = await useCase
    .execute(sanitizePublicOrderInput(data) as never, { publicOrder: true })
    .then(() => null)
    .catch((e: unknown) => e as Error);
  return {
    error,
    saved: saveWithStockDecrement.mock.calls[0]?.[0] as Fields,
    saveWithStockDecrement,
    distanceKm,
  };
}

beforeEach(() => {
  resetFreightCache();
  delete process.env.FREIGHT_ON_GOOGLE_FAILURE;
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('pedido público: frete recalculado pelo servidor', () => {
  it('pedido normal por distância (3 km = R$ 8): grava o frete do servidor e o total certo', async () => {
    const { error, saved, distanceKm } = await create({ km: 3 }, body());
    expect(error).toBeNull();
    expect(saved.freight).toBe(8);
    expect(saved.totalOrder).toBe(108);
    expect(distanceKm).toHaveBeenCalledTimes(1);
  });

  it('frete adulterado (R$ 0,01 e total ajustado) é recusado com "O frete mudou" e nada é gravado', async () => {
    const { error, saveWithStockDecrement } = await create(
      { km: 3 },
      body({ freight: 0.01, totalOrder: 100.01 }),
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error?.message).toBe(FREIGHT_CHANGED_MESSAGE);
    expect(saveWithStockDecrement).not.toHaveBeenCalled();
  });

  it('frete zero sem direito a frete grátis é recusado', async () => {
    const { error } = await create(
      { km: 3 },
      body({ freight: 0, totalOrder: 100 }),
    );
    expect(error?.message).toBe(FREIGHT_CHANGED_MESSAGE);
  });

  it('frete certo mas total adulterado continua recusado pela conferência do total', async () => {
    const { error, saveWithStockDecrement } = await create(
      { km: 3 },
      body({ totalOrder: 1 }),
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect(saveWithStockDecrement).not.toHaveBeenCalled();
  });

  it('frete grátis por valor mínimo: o navegador manda 0 e o servidor concorda', async () => {
    const { error, saved } = await create(
      {
        km: 3,
        settings: {
          freeShippingEnabled: true,
          freeShippingMinValue: 80,
          deliveryRanges: { ranges: RANGES, allowAboveMax: true },
        },
      },
      body({ freight: 0, totalOrder: 100 }),
    );
    expect(error).toBeNull();
    expect(saved.freight).toBe(0);
    expect(saved.totalOrder).toBe(100);
  });

  it('cupom de frete grátis validado pelo servidor: frete zero aceito; sem cupom válido o mesmo pedido é recusado', async () => {
    const comCupom = await create(
      { km: 3, coupon: { discountAmount: 0, type: 'FREE_SHIPPING' } },
      body({ couponTitle: 'FRETEGRATIS', freight: 0, totalOrder: 100 }),
    );
    expect(comCupom.error).toBeNull();
    expect(comCupom.saved.freight).toBe(0);

    const semCupom = await create(
      { km: 3 },
      body({ couponTitle: undefined, freight: 0, totalOrder: 100 }),
    );
    expect(semCupom.error?.message).toBe(FREIGHT_CHANGED_MESSAGE);
  });

  it('retirada na loja: frete zero, sem chamar o Google', async () => {
    const { error, saved, distanceKm } = await create(
      { km: 3 },
      body({ deliveryModality: 'STORE_PICKUP', freight: 0, totalOrder: 100 }),
    );
    expect(error).toBeNull();
    expect(saved.freight).toBe(0);
    expect(distanceKm).not.toHaveBeenCalled();
  });

  it('pedido mínimo ativo: recusa pedido público abaixo do mínimo (entrega e retirada) e aceita quando atinge o mínimo', async () => {
    const settingsMin = {
      minOrderEnabled: true,
      minOrderValue: 120,
    };

    const abaixoEntrega = await create(
      { km: 3, settings: settingsMin },
      body({ itemsTotal: 100, freight: 8, totalOrder: 108 }),
    );
    expect(abaixoEntrega.error).toBeInstanceOf(BadRequestException);
    expect(abaixoEntrega.error?.message).toBe(
      'O valor mínimo do pedido é R$ 120,00.',
    );
    expect(abaixoEntrega.saveWithStockDecrement).not.toHaveBeenCalled();

    const abaixoRetirada = await create(
      { km: 3, settings: settingsMin },
      body({
        deliveryModality: 'STORE_PICKUP',
        itemsTotal: 100,
        freight: 0,
        totalOrder: 100,
      }),
    );
    expect(abaixoRetirada.error).toBeInstanceOf(BadRequestException);
    expect(abaixoRetirada.error?.message).toBe(
      'O valor mínimo do pedido é R$ 120,00.',
    );

    const atingiuMinimo = await create(
      {
        km: 3,
        settings: { minOrderEnabled: true, minOrderValue: 100 },
      },
      body({ itemsTotal: 100, freight: 8, totalOrder: 108 }),
    );
    expect(atingiuMinimo.error).toBeNull();
    expect(atingiuMinimo.saved.totalOrder).toBe(108);
  });

  it('retirada com frete embutido é recusada', async () => {
    const { error } = await create(
      { km: 3 },
      body({ deliveryModality: 'STORE_PICKUP', freight: 8, totalOrder: 108 }),
    );
    expect(error?.message).toBe(FREIGHT_CHANGED_MESSAGE);
  });

  it('acima da distância máxima: recusado como fora da área', async () => {
    const { error, saveWithStockDecrement } = await create(
      { km: 25 },
      body({ freight: 12, totalOrder: 112 }),
    );
    expect(error?.message).toContain('fora da área de entrega');
    expect(saveWithStockDecrement).not.toHaveBeenCalled();
  });

  it('Google indisponível: aceita só o frete dentro das faixas da loja (aviso no log) e recusa o inventado', async () => {
    const down = new GoogleRoutesError('unavailable', 503);
    const ok = await create(
      { km: down },
      body({ freight: 8, totalOrder: 108 }),
    );
    expect(ok.error).toBeNull();
    expect(ok.saved.freight).toBe(8);

    const forjado = await create(
      { km: down },
      body({ freight: 0.01, totalOrder: 100.01 }),
    );
    expect(forjado.error?.message).toBe(FREIGHT_CHANGED_MESSAGE);
  });

  it('sem chave do Google (não configurada): mesmo comportamento seguro, sem derrubar o checkout', async () => {
    const { error, saved } = await create(
      { km: new GoogleRoutesError('not_configured') },
      body(),
    );
    expect(error).toBeNull();
    expect(saved.freight).toBe(8);
  });

  it('Google indisponível com FREIGHT_ON_GOOGLE_FAILURE=reject: pedido recusado com mensagem para tentar de novo', async () => {
    process.env.FREIGHT_ON_GOOGLE_FAILURE = 'reject';
    const { error, saveWithStockDecrement } = await create(
      { km: new GoogleRoutesError('unavailable') },
      body(),
    );
    expect(error?.message).toContain('Tente novamente');
    expect(saveWithStockDecrement).not.toHaveBeenCalled();
  });

  it('o painel (admin) não usa essa regra: o frete digitado pelo operador segue valendo', async () => {
    const { useCase, saveWithStockDecrement, distanceKm } = build({ km: 3 });
    await useCase
      .execute(body({ freight: 1, totalOrder: 101 }) as never)
      .catch(() => undefined);
    expect(distanceKm).not.toHaveBeenCalled();
    expect(saveWithStockDecrement.mock.calls[0][0].freight).toBe(1);
  });
});
