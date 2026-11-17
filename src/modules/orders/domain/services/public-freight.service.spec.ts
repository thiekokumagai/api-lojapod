import { BadRequestException, HttpException, Logger } from '@nestjs/common';
import {
  PublicFreightService,
  FREIGHT_CHANGED_MESSAGE,
  resetFreightCache,
} from './public-freight.service';
import {
  GoogleRoutesClient,
  GoogleRoutesError,
} from '../../infrastructure/google-routes.client';

// Sem rede: o cliente do Google é um mock.
const RANGES = [
  { id: 'a', distancia: 2, valor: 5 },
  { id: 'b', distancia: 5, valor: 8 },
  { id: 'c', distancia: 10, valor: 12 },
];

const store = {
  street: 'Rua 14 de Julho',
  number: '539',
  city: 'Campo Grande',
  state: 'MS',
  cep: '79002-330',
  storePickupEnabled: true,
};
const byDistance = {
  ...store,
  deliveryType: 'DISTANCE',
  deliveryRanges: { ranges: RANGES, allowAboveMax: false },
};

const address = {
  deliveryModality: 'DELIVERY',
  street: 'Rua Goiânia, 2386',
  number: '2386',
  neighborhood: 'Centro',
  city: 'Campo Grande',
  state: 'MS',
};

function setup(km: number | Error = 3) {
  const distanceKm = jest.fn(() =>
    km instanceof Error ? Promise.reject(km) : Promise.resolve(km),
  );
  const google = {
    distanceKm,
    isConfigured: () => true,
  } as unknown as GoogleRoutesClient;
  return { service: new PublicFreightService(google), distanceKm };
}

const run = (
  service: PublicFreightService,
  overrides: Partial<Parameters<PublicFreightService['resolve']>[0]> & {
    settings?: object;
  } = {},
) =>
  service.resolve({
    settings: byDistance,
    order: address,
    itemsTotal: 50,
    freeShippingByCoupon: false,
    clientFreight: 8,
    ...overrides,
  } as never);

beforeEach(() => {
  resetFreightCache();
  delete process.env.FREIGHT_ON_GOOGLE_FAILURE;
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('frete recalculado pelo servidor', () => {
  it('por faixas: cliente com o frete certo passa e o servidor grava esse valor', async () => {
    const { service, distanceKm } = setup(3);
    const result = await run(service, { clientFreight: 8 });
    expect(result).toMatchObject({
      freight: 8,
      source: 'google',
      distanceKm: 3,
    });
    expect(distanceKm).toHaveBeenCalledTimes(1);
  });

  it('manda ao Google a origem (local ativo da loja) e o destino montados como no navegador', async () => {
    const { service, distanceKm } = setup(3);
    await run(service);
    expect(distanceKm).toHaveBeenCalledWith(
      'Rua 14 de Julho, 539, Campo Grande - MS, CEP 79002330, Brasil',
      'Rua Goiânia, 2386, Centro, Campo Grande, MS',
    );
  });

  it('cada faixa: 1 km = R$ 5, 3 km = R$ 8, 8 km = R$ 12', async () => {
    for (const [km, price] of [
      [1, 5],
      [3, 8],
      [8, 12],
    ] as const) {
      resetFreightCache();
      const { service } = setup(km);
      await expect(
        run(service, { clientFreight: price }),
      ).resolves.toMatchObject({ freight: price });
    }
  });

  it('frete menor que o real (R$ 0,01 ou outra faixa mais barata): 400 "O frete mudou, atualize o carrinho"', async () => {
    const { service } = setup(8); // real: R$ 12
    for (const clientFreight of [0.01, 0, 5, 8]) {
      const error = await run(service, { clientFreight }).catch(
        (e: Error) => e,
      );
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).toBe(FREIGHT_CHANGED_MESSAGE);
    }
  });

  it('frete maior que o real também diverge (o cliente veria um valor diferente do cobrado)', async () => {
    const { service } = setup(1); // real: R$ 5
    await expect(run(service, { clientFreight: 12 })).rejects.toThrow(
      FREIGHT_CHANGED_MESSAGE,
    );
  });

  it('diferença de até R$ 0,10 é aceita (arredondamento); acima disso não', async () => {
    const { service } = setup(3);
    await expect(run(service, { clientFreight: 8.05 })).resolves.toMatchObject({
      freight: 8.05,
    });
    resetFreightCache();
    await expect(run(setup(3).service, { clientFreight: 8.2 })).rejects.toThrow(
      FREIGHT_CHANGED_MESSAGE,
    );
  });

  it('perto da divisa de faixa (navegador mediu 4,9 km e o servidor 5,2 km) aceita as duas faixas vizinhas', async () => {
    const { service } = setup(5.2); // servidor: faixa de 12
    await expect(run(service, { clientFreight: 12 })).resolves.toMatchObject({
      freight: 12,
    });
    resetFreightCache();
    await expect(
      run(setup(5.2).service, { clientFreight: 8 }),
    ).resolves.toMatchObject({ freight: 8 });
    // mas não duas faixas abaixo
    resetFreightCache();
    await expect(run(setup(5.2).service, { clientFreight: 5 })).rejects.toThrow(
      FREIGHT_CHANGED_MESSAGE,
    );
  });

  it('frete grátis por valor mínimo: esperado é zero; cobrar mais ou pagar menos que o certo não passa', async () => {
    const settings = {
      ...byDistance,
      deliveryRanges: { ranges: RANGES, allowAboveMax: true },
      freeShippingEnabled: true,
      freeShippingMinValue: 100,
    };
    const free = await run(setup(3).service, {
      settings,
      itemsTotal: 120,
      clientFreight: 0,
    });
    expect(free.freight).toBe(0);

    // carrinho abaixo do mínimo não tem frete grátis: o cliente que manda 0 é recusado
    await expect(
      run(setup(3).service, { settings, itemsTotal: 99, clientFreight: 0 }),
    ).rejects.toThrow(FREIGHT_CHANGED_MESSAGE);
    // acima do mínimo, mandar valor cheio também diverge
    await expect(
      run(setup(3).service, { settings, itemsTotal: 120, clientFreight: 8 }),
    ).rejects.toThrow(FREIGHT_CHANGED_MESSAGE);
  });

  it('frete grátis por valor com "acima do máximo" permitido nem chama o Google', async () => {
    const settings = {
      ...byDistance,
      deliveryRanges: { ranges: RANGES, allowAboveMax: true },
      freeShippingEnabled: true,
      freeShippingMinValue: 100,
    };
    const { service, distanceKm } = setup(3);
    await run(service, { settings, itemsTotal: 120, clientFreight: 0 });
    expect(distanceKm).not.toHaveBeenCalled();
  });

  it('cupom de frete grátis: esperado zero (e área ainda é conferida)', async () => {
    const { service } = setup(3);
    await expect(
      run(service, { freeShippingByCoupon: true, clientFreight: 0 }),
    ).resolves.toMatchObject({ freight: 0 });
    await expect(
      run(setup(3).service, { freeShippingByCoupon: true, clientFreight: 8 }),
    ).rejects.toThrow(FREIGHT_CHANGED_MESSAGE);
    // fora da área mesmo com cupom
    resetFreightCache();
    await expect(
      run(setup(40).service, { freeShippingByCoupon: true, clientFreight: 0 }),
    ).rejects.toThrow(/fora da área/);
  });

  it('retirada na loja: frete zero, sem Google; com frete embutido é recusado; precisa estar habilitada', async () => {
    const { service, distanceKm } = setup(3);
    await expect(
      run(service, {
        order: { ...address, deliveryModality: 'STORE_PICKUP' },
        clientFreight: 0,
      }),
    ).resolves.toMatchObject({
      freight: 0,
      source: 'pickup',
    });
    expect(distanceKm).not.toHaveBeenCalled();
    await expect(
      run(service, {
        order: { ...address, deliveryModality: 'STORE_PICKUP' },
        clientFreight: 8,
      }),
    ).rejects.toThrow(FREIGHT_CHANGED_MESSAGE);
    await expect(
      run(service, {
        settings: { ...byDistance, storePickupEnabled: false },
        order: { ...address, deliveryModality: 'STORE_PICKUP' },
        clientFreight: 0,
      }),
    ).rejects.toThrow(/retirada/i);
  });

  it('acima da distância máxima sem permissão: fora da área (400)', async () => {
    const { service } = setup(25);
    const error = await run(service, { clientFreight: 12 }).catch(
      (e: Error) => e,
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toContain(
      'fora da área de entrega (máximo 10km)',
    );
  });

  it('acima do máximo com permissão: vale o preço da última faixa', async () => {
    const settings = {
      ...byDistance,
      deliveryRanges: { ranges: RANGES, allowAboveMax: true },
    };
    await expect(
      run(setup(25).service, { settings, clientFreight: 12 }),
    ).resolves.toMatchObject({ freight: 12 });
  });

  it('raio máximo configurado vale para qualquer tipo de frete (taxa fixa também)', async () => {
    const settings = {
      ...store,
      deliveryType: 'FIXED_FEE',
      deliveryFixedFee: 6,
      deliveryRanges: { ranges: [], maxDeliveryKm: 8 },
    };
    await expect(
      run(setup(9).service, { settings, clientFreight: 6 }),
    ).rejects.toThrow(/fora da área/);
    resetFreightCache();
    await expect(
      run(setup(7).service, { settings, clientFreight: 6 }),
    ).resolves.toMatchObject({ freight: 6 });
  });

  it('taxa fixa, sem faixas nem raio: não chama o Google e confere o valor', async () => {
    const settings = {
      ...store,
      deliveryType: 'FIXED_FEE',
      deliveryFixedFee: 6,
    };
    const { service, distanceKm } = setup(3);
    await expect(
      run(service, { settings, clientFreight: 6 }),
    ).resolves.toMatchObject({ freight: 6, source: 'rules' });
    await expect(run(service, { settings, clientFreight: 1 })).rejects.toThrow(
      FREIGHT_CHANGED_MESSAGE,
    );
    expect(distanceKm).not.toHaveBeenCalled();
  });

  it('"a combinar": cliente manda -1 (ou 0) e fica -1; cobrar um valor diverge', async () => {
    const settings = { ...store, deliveryType: 'TO_COMBINE' };
    const { service } = setup(3);
    await expect(
      run(service, { settings, clientFreight: -1 }),
    ).resolves.toMatchObject({ freight: -1 });
    await expect(
      run(service, { settings, clientFreight: 0 }),
    ).resolves.toMatchObject({ freight: 0 });
    await expect(run(service, { settings, clientFreight: 9 })).rejects.toThrow(
      FREIGHT_CHANGED_MESSAGE,
    );
  });

  it('"-1" com frete que a loja cobra: diverge (não dá para virar "a combinar" para pagar zero)', async () => {
    await expect(run(setup(8).service, { clientFreight: -1 })).rejects.toThrow(
      FREIGHT_CHANGED_MESSAGE,
    );
  });

  it('endereço sem rua: 400 sem chamar o Google; rota inexistente: 400 com mensagem clara', async () => {
    const empty = setup(3);
    await expect(
      run(empty.service, { order: { ...address, street: '' } }),
    ).rejects.toThrow(/incompleto/);
    expect(empty.distanceKm).not.toHaveBeenCalled();

    const noRoute = setup(new GoogleRoutesError('no_route', 400));
    await expect(run(noRoute.service)).rejects.toThrow(/Confira o endereço/);
  });
});

describe('cache de distância (custo do Google)', () => {
  it('o mesmo endereço repetido não consulta o Google de novo', async () => {
    const { service, distanceKm } = setup(3);
    await run(service);
    await run(service);
    await run(service, { clientFreight: 8.05 });
    expect(distanceKm).toHaveBeenCalledTimes(1);
  });

  it('endereço diferente consulta de novo; maiúsculas/minúsculas não contam como outro', async () => {
    const { service, distanceKm } = setup(3);
    await run(service);
    await run(service, { order: { ...address, street: 'RUA GOIÂNIA, 2386' } });
    expect(distanceKm).toHaveBeenCalledTimes(1);
    await run(service, {
      order: { ...address, number: '10', street: 'Rua Outra' },
    });
    expect(distanceKm).toHaveBeenCalledTimes(2);
  });

  it('falha do Google não fica em cache', async () => {
    const google = {
      distanceKm: jest
        .fn()
        .mockRejectedValueOnce(new GoogleRoutesError('unavailable', 503))
        .mockResolvedValue(3),
    } as unknown as GoogleRoutesClient;
    const service = new PublicFreightService(google);
    await run(service, { clientFreight: 8 }); // cai na trava
    await expect(run(service, { clientFreight: 8 })).resolves.toMatchObject({
      source: 'google',
    });
    expect(google.distanceKm).toHaveBeenCalledTimes(2);
  });
});

describe('Google fora do ar ou sem chave', () => {
  const failures: Array<[string, GoogleRoutesError]> = [
    ['sem chave configurada', new GoogleRoutesError('not_configured')],
    ['indisponível (HTTP 503)', new GoogleRoutesError('unavailable', 503)],
    ['chave recusada (HTTP 403)', new GoogleRoutesError('unavailable', 403)],
  ];

  it.each(failures)(
    '%s: aceita só frete entre o menor e o maior preço da loja e avisa no log',
    async (_label, error) => {
      const warn = jest.spyOn(Logger.prototype, 'warn');
      const { service } = setup(error);
      await expect(run(service, { clientFreight: 8 })).resolves.toMatchObject({
        freight: 8,
        source: 'bounds',
      });
      await expect(
        run(setup(error).service, { clientFreight: 12 }),
      ).resolves.toMatchObject({ source: 'bounds' });
      expect(warn).toHaveBeenCalled();
    },
  );

  it.each(failures)(
    '%s: frete fora das faixas da loja (R$ 0,01, R$ 50) é recusado',
    async (_label, error) => {
      for (const clientFreight of [0.01, 0, 50]) {
        await expect(
          run(setup(error).service, { clientFreight }),
        ).rejects.toThrow(FREIGHT_CHANGED_MESSAGE);
      }
    },
  );

  it('o aviso no log não repete a cada pedido (no máximo 1 por minuto) e não traz a chave', async () => {
    process.env.GOOGLE_MAPS_SERVER_KEY = 'AIza-segredo-que-nao-pode-vazar';
    const warn = jest.spyOn(Logger.prototype, 'warn');
    const { service } = setup(new GoogleRoutesError('unavailable', 503));
    await run(service, { clientFreight: 8 });
    await run(service, { clientFreight: 8 });
    await run(service, { clientFreight: 8 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('AIza-segredo');
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
  });

  it('FREIGHT_ON_GOOGLE_FAILURE=reject: recusa o pedido (503) com mensagem para tentar de novo', async () => {
    process.env.FREIGHT_ON_GOOGLE_FAILURE = 'reject';
    const error = await run(
      setup(new GoogleRoutesError('not_configured')).service,
    ).catch((e: Error) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(503);
    expect((error as Error).message).toContain('Tente novamente');
  });

  it('com Google fora, taxa fixa e "a combinar" continuam funcionando (não precisam do Google)', async () => {
    const { service, distanceKm } = setup(new GoogleRoutesError('unavailable'));
    await expect(
      run(service, {
        settings: { ...store, deliveryType: 'FIXED_FEE', deliveryFixedFee: 6 },
        clientFreight: 6,
      }),
    ).resolves.toMatchObject({ freight: 6 });
    expect(distanceKm).not.toHaveBeenCalled();
  });

  it('loja só com "a combinar" ou sem faixas e Google fora: só aceita frete zero', async () => {
    const settings = {
      ...store,
      deliveryType: 'DISTANCE',
      deliveryRanges: { ranges: [], maxDeliveryKm: 8 },
    };
    const failing = new GoogleRoutesError('unavailable');
    await expect(
      run(setup(failing).service, { settings, clientFreight: -1 }),
    ).resolves.toMatchObject({ source: 'bounds' });
    await expect(
      run(setup(failing).service, { settings, clientFreight: 9 }),
    ).rejects.toThrow(FREIGHT_CHANGED_MESSAGE);
  });
});
