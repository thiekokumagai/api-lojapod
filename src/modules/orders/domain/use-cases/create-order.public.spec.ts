import { BadRequestException } from '@nestjs/common';
import { CreateOrderUseCase } from './create-order.use-case';
import { sanitizePublicOrderInput } from '../utils/public-order-rules';
import { PublicFreightService } from '../services/public-freight.service';

type Fields = Record<string, any>;

// Sem banco e sem rede: repositórios, Prisma, cupom e fidelidade são mocks.
const product = (extra: Fields = {}) => ({
  id: 'p1',
  title: 'Pod X',
  price: 50,
  promotionalPrice: null,
  isVisible: true,
  items: [{ id: 'pi1', stock: 20, options: [] }],
  ...extra,
});

const item = (extra: Fields = {}) => ({
  productId: 'p1',
  productName: 'Pod X',
  quantity: 2,
  price: 50,
  ...extra,
});

const order = (extra: Fields = {}) => ({
  customerName: 'Ana Souza',
  customerPhone: '67999990000',
  deliveryModality: 'DELIVERY',
  paymentType: 'online',
  paymentMethod: 'credit',
  paymentStatus: 'PENDING',
  itemsTotal: 100,
  freight: 10,
  totalOrder: 110,
  totalReceived: 110,
  items: [item()],
  ...extra,
});

interface Setup {
  settings?: Fields;
  products?: Record<string, Fields>;
  bump?: Fields | null;
  combo?: Fields | null;
  options?: Fields[];
  program?: Fields | null;
  card?: Fields | null;
  coupon?: { discountAmount: number; type?: string } | null;
  /** Ligações produto-grupo; sem isto, todo grupo das opções do setup fica ligado ao produto. */
  productCompositions?: Fields[];
}

function build(setup: Setup = {}) {
  const saveWithStockDecrement = jest
    .fn()
    .mockImplementation((saved: Fields) =>
      Promise.resolve({ ...saved, id: 'o1', items: saved.items ?? [] }),
    );
  const products = setup.products ?? { p1: product() };
  const prisma = {
    product: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(products[where.id] ?? null),
      ),
      // categoria de cada produto, para o gatilho por categoria da oferta "Peça também"
      findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          where.id.in
            .filter((id) => products[id])
            .map((id) => ({ id, categoryId: products[id].categoryId ?? null })),
        ),
      ),
      update: jest.fn(),
    },
    orderBump: { findUnique: jest.fn().mockResolvedValue(setup.bump ?? null) },
    combo: {
      findUnique: jest.fn().mockResolvedValue(setup.combo ?? null),
      findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) => {
        if (!setup.combo) return Promise.resolve([]);
        const comboList = Array.isArray(setup.combo)
          ? setup.combo
          : [setup.combo];
        return Promise.resolve(
          comboList.filter((c: Fields) =>
            where?.id?.in?.includes(String(c?.id)),
          ),
        );
      }),
    },
    compositionOption: {
      findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) => {
        const opts = (setup.options as Fields[]) ?? [];
        return Promise.resolve(
          opts
            .filter((o) => where?.id?.in?.includes(String(o?.id)))
            .map((o) => ({ groupId: o.group?.id, ...o })),
        );
      }),
    },
    productComposition: {
      findMany: jest.fn(({ where }: { where: { productId: string } }) => {
        const derived = [
          ...new Map(
            ((setup.options as Fields[]) ?? []).map((o) => [
              o.group?.id,
              {
                productId: where?.productId,
                groupId: o.group?.id,
                group: o.group,
              },
            ]),
          ).values(),
        ];
        const comps = setup.productCompositions ?? derived;
        return Promise.resolve(
          comps.filter(
            (c) => !where?.productId || c.productId === where.productId,
          ),
        );
      }),
    },
    loyaltyProgram: {
      findUnique: jest.fn().mockResolvedValue(setup.program ?? null),
    },
    loyaltyCard: {
      findFirst: jest.fn().mockResolvedValue(setup.card ?? null),
      update: jest.fn(),
    },
    loyaltyRewardRedemption: { create: jest.fn(), findFirst: jest.fn() },
    loyaltyTransaction: { create: jest.fn() },
  };
  const settings = {
    get: jest.fn().mockResolvedValue({
      promoPaymentMethods: ['pix'],
      paymentGateways: {},
      paymentRules: [{ paymentMethod: 'pix', type: 'discount', value: 5 }],
      // taxa fixa de R$ 10: o frete não depende do Google nestes testes (o cálculo por distância tem spec próprio)
      deliveryType: 'FIXED_FEE',
      deliveryFixedFee: 10,
      storePickupEnabled: true,
      ...setup.settings,
    }),
  };
  const coupon = setup.coupon;
  const useCase = new CreateOrderUseCase(
    { saveWithStockDecrement } as never,
    {
      execute: jest.fn().mockResolvedValue({
        coupon: coupon ? { id: 'c1', type: coupon.type ?? 'VALUE' } : null,
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
    settings as never,
    prisma as never,
    {} as never,
    new PublicFreightService({ distanceKm: jest.fn() } as never),
  );
  return { useCase, saveWithStockDecrement, prisma };
}

/** Mesmo caminho do controller da loja: sanitiza e chama o use case em modo "pedido público". */
async function createPublic(setup: Setup, body: Fields) {
  const { useCase, saveWithStockDecrement, prisma } = build(setup);
  const result = await useCase
    .execute(sanitizePublicOrderInput(body) as never, { publicOrder: true })
    .then(() => null)
    .catch((e: unknown) => e);
  return {
    error: result as Error | null,
    saveWithStockDecrement,
    prisma,
    saved: () => saveWithStockDecrement.mock.calls[0]?.[0] as Fields,
  };
}

describe('CreateOrderUseCase — pedido público (loja virtual)', () => {
  describe('B: nasce pendente, nunca pago', () => {
    it('paymentStatus PAID e status COMPLETED enviados pelo cliente são ignorados', async () => {
      const { error, saved } = await createPublic(
        {},
        order({
          paymentStatus: 'PAID',
          status: 'COMPLETED',
          paymentDate: new Date(),
        }),
      );
      expect(error).toBeNull();
      expect(saved().paymentStatus).toBe('PENDING');
      expect(saved().status).not.toBe('COMPLETED');
      expect(saved().paymentDate).toBeUndefined();
    });
  });

  describe('C: preço conferido com o catálogo e total recalculado', () => {
    it('pedido normal (item + frete) mantém o total e grava o do servidor', async () => {
      const { error, saved } = await createPublic({}, order());
      expect(error).toBeNull();
      expect(saved().itemsTotal).toBe(100);
      expect(saved().totalOrder).toBe(110);
      expect(saved().totalReceived).toBe(110);
    });

    it('preço do item adulterado é recusado e nada é gravado', async () => {
      const { error, saveWithStockDecrement } = await createPublic(
        {},
        order({
          items: [item({ price: 0.01 })],
          itemsTotal: 0.02,
          freight: 0,
          totalOrder: 0.02,
        }),
      );
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error?.message).toContain('mudou');
      expect(saveWithStockDecrement).not.toHaveBeenCalled();
    });

    it('itemsTotal e totalOrder adulterados com itens corretos são recusados', async () => {
      const a = await createPublic(
        {},
        order({ itemsTotal: 0.01, totalOrder: 0.01, freight: 0 }),
      );
      expect(a.error).toBeInstanceOf(BadRequestException);
      const b = await createPublic({}, order({ totalOrder: 0.01 }));
      expect(b.error).toBeInstanceOf(BadRequestException);
      expect(b.saveWithStockDecrement).not.toHaveBeenCalled();
    });

    it('preço promocional do catálogo é aceito (Pix) e preço fora do catálogo não', async () => {
      const setup = { products: { p1: product({ promotionalPrice: 40 }) } };
      const ok = await createPublic(
        setup,
        order({
          paymentMethod: 'pix',
          items: [item({ price: 40 })],
          itemsTotal: 80,
          totalOrder: 90,
        }),
      );
      expect(ok.error).toBeNull();
      const bad = await createPublic(
        setup,
        order({
          paymentMethod: 'pix',
          items: [item({ price: 45 })],
          itemsTotal: 90,
          totalOrder: 100,
        }),
      );
      expect(bad.error).toBeInstanceOf(BadRequestException);
    });

    it('variação (mesmo produto, outra opção) usa o mesmo preço do produto', async () => {
      const withVariations = product({
        items: [
          { id: 'pi1', stock: 20, options: [{ option: { value: 'Menta' } }] },
          { id: 'pi2', stock: 20, options: [{ option: { value: 'Uva' } }] },
        ],
      });
      const { error, saved } = await createPublic(
        { products: { p1: withVariations } },
        order({ items: [item({ variation: 'Uva', quantity: 2 })] }),
      );
      expect(error).toBeNull();
      expect(saved().totalOrder).toBe(110);
    });

    it('oferta "Peça também" aceita o preço da oferta e recusa outro', async () => {
      const bump = {
        id: 'b1',
        storeId: 'store-1',
        isActive: true,
        triggerType: 'ALL',
        suggestedProductId: 'p1',
        customPrice: 30,
        discountPercent: null,
      };
      const bumpItem = (price: number) =>
        item({ isOrderBump: true, orderBumpId: 'b1', quantity: 1, price });
      const ok = await createPublic(
        { bump },
        order({
          items: [bumpItem(30)],
          itemsTotal: 30,
          freight: 0,
          totalOrder: 30,
          deliveryModality: 'STORE_PICKUP',
        }),
      );
      expect(ok.error).toBeNull();
      const bad = await createPublic(
        { bump },
        order({
          items: [bumpItem(1)],
          itemsTotal: 1,
          freight: 0,
          totalOrder: 1,
        }),
      );
      expect(bad.error).toBeInstanceOf(BadRequestException);
    });

    describe('oferta "Peça também": só vale se a regra vale e o gatilho foi cumprido', () => {
      // Bebida (p1) em oferta de R$ 30 sobre o Donuts (p2, categoria "doces")
      const products = {
        p1: product({
          id: 'p1',
          title: 'Coca',
          price: 50,
          categoryId: 'bebidas',
        }),
        p2: product({
          id: 'p2',
          title: 'Donuts',
          price: 50,
          categoryId: 'doces',
        }),
      };
      const rule = (extra: Fields = {}) => ({
        id: 'b1',
        storeId: 'store-1',
        isActive: true,
        triggerType: 'PRODUCT',
        triggerProductId: 'p2',
        triggerCategoryId: null,
        suggestedProductId: 'p1',
        customPrice: 30,
        discountPercent: null,
        ...extra,
      });
      const donuts = () =>
        item({
          productId: 'p2',
          productName: 'Donuts',
          quantity: 1,
          price: 50,
        });
      const coca = (price: number) =>
        item({
          productId: 'p1',
          productName: 'Coca',
          quantity: 1,
          price,
          isOrderBump: true,
          orderBumpId: 'b1',
        });
      const pickup = { freight: 0, deliveryModality: 'STORE_PICKUP' };
      const withTotals = (items: Fields[], total: number) =>
        order({
          ...pickup,
          items,
          itemsTotal: total,
          totalOrder: total,
          totalReceived: total,
        });

      it('gatilho de produto cumprido (Donuts no pedido): aceita o preço da oferta', async () => {
        const r = await createPublic(
          { products, bump: rule() },
          withTotals([donuts(), coca(30)], 80),
        );
        expect(r.error).toBeNull();
      });

      it('gatilho de produto NÃO cumprido (sem o Donuts): recusa o preço da oferta', async () => {
        const r = await createPublic(
          { products, bump: rule() },
          withTotals([coca(30)], 30),
        );
        expect(r.error).toBeInstanceOf(BadRequestException);
      });

      it('gatilho de categoria cumprido por um produto da categoria: aceita', async () => {
        const r = await createPublic(
          {
            products,
            bump: rule({
              triggerType: 'CATEGORY',
              triggerProductId: null,
              triggerCategoryId: 'doces',
            }),
          },
          withTotals([donuts(), coca(30)], 80),
        );
        expect(r.error).toBeNull();
        expect(r.prisma.product.findMany).toHaveBeenCalled();
      });

      it('gatilho de categoria NÃO cumprido: recusa', async () => {
        const r = await createPublic(
          {
            products,
            bump: rule({
              triggerType: 'CATEGORY',
              triggerProductId: null,
              triggerCategoryId: 'salgados',
            }),
          },
          withTotals([donuts(), coca(30)], 80),
        );
        expect(r.error).toBeInstanceOf(BadRequestException);
      });

      it('oferta para qualquer pedido (ALL): aceita sem gatilho', async () => {
        const r = await createPublic(
          {
            products,
            bump: rule({ triggerType: 'ALL', triggerProductId: null }),
          },
          withTotals([coca(30)], 30),
        );
        expect(r.error).toBeNull();
      });

      it('oferta DESATIVADA: recusa o preço da oferta', async () => {
        const r = await createPublic(
          { products, bump: rule({ isActive: false }) },
          withTotals([donuts(), coca(30)], 80),
        );
        expect(r.error).toBeInstanceOf(BadRequestException);
      });

      it('oferta de OUTRA LOJA: recusa o preço da oferta', async () => {
        const r = await createPublic(
          { products, bump: rule({ storeId: 'store-2' }) },
          withTotals([donuts(), coca(30)], 80),
        );
        expect(r.error).toBeInstanceOf(BadRequestException);
      });

      it('oferta de outro produto: recusa o preço da oferta', async () => {
        const r = await createPublic(
          { products, bump: rule({ suggestedProductId: 'p2' }) },
          withTotals([donuts(), coca(30)], 80),
        );
        expect(r.error).toBeInstanceOf(BadRequestException);
      });

      it('id de oferta que não existe: recusa o preço da oferta', async () => {
        const r = await createPublic(
          { products, bump: null },
          withTotals([donuts(), coca(30)], 80),
        );
        expect(r.error).toBeInstanceOf(BadRequestException);
      });

      it('mesmo sem gatilho, a bebida pelo preço normal é aceita (paga o preço cheio)', async () => {
        const r = await createPublic(
          { products, bump: rule() },
          withTotals([coca(50)], 50),
        );
        expect(r.error).toBeNull();
        expect(r.saved().totalOrder).toBe(50);
      });
    });

    it('combo: o servidor fixa o preço do banco e o total adulterado não passa', async () => {
      const combo = {
        id: 'c1',
        name: 'Combo',
        price: 70,
        isActive: true,
        items: [],
        imageUrl: null,
        startDate: null,
        endDate: null,
        maxPerOrder: null,
        maxTotalSales: null,
        totalSold: 0,
      };
      const comboItem = (price: number) => ({
        isCombo: true,
        comboId: 'c1',
        productName: 'Combo',
        quantity: 1,
        price,
      });

      const ok = await createPublic(
        { combo },
        order({
          items: [comboItem(70)],
          itemsTotal: 70,
          freight: 0,
          totalOrder: 70,
          deliveryModality: 'STORE_PICKUP',
        }),
      );
      expect(ok.error).toBeNull();

      // cliente manda preço 1 para o combo: o servidor usa 70, então os totais de R$ 1 não batem
      const bad = await createPublic(
        { combo },
        order({
          items: [comboItem(1)],
          itemsTotal: 1,
          freight: 0,
          totalOrder: 1,
        }),
      );
      expect(bad.error).toBeInstanceOf(BadRequestException);
      expect(bad.saveWithStockDecrement).not.toHaveBeenCalled();
    });

    it('combo [SEGURANÇA]: customizationSnapshot do cliente é descartado (não vai para a comanda)', async () => {
      const combo = {
        id: 'c1',
        name: 'Combo',
        price: 70,
        isActive: true,
        items: [],
        imageUrl: null,
        startDate: null,
        endDate: null,
        maxPerOrder: null,
        maxTotalSales: null,
        totalSold: 0,
      };
      const ok = await createPublic(
        { combo },
        order({
          items: [
            {
              isCombo: true,
              comboId: 'c1',
              productName: 'Combo',
              quantity: 1,
              price: 70,
              isCustomized: true,
              customizationSnapshot: {
                stages: [
                  {
                    groupName: 'Adicionais',
                    options: [
                      { optionId: 'x', name: 'Picanha 400g', quantity: 3 },
                    ],
                  },
                ],
              },
            },
          ],
          itemsTotal: 70,
          freight: 0,
          totalOrder: 70,
          deliveryModality: 'STORE_PICKUP',
        }),
      );
      expect(ok.error).toBeNull();
      const saved = ok.saved().items[0];
      expect(saved.isCustomized).toBe(false);
      expect(saved.customizationSnapshot).toBeUndefined();
    });

    it('combo + oferta "Peça também": produto dentro do combo satisfaz o gatilho da oferta', async () => {
      const pGatilho = product({
        id: 'pGatilho',
        title: 'Pod Gatilho',
        price: 60,
        items: [{ id: 'piGatilho', stock: 20, options: [] }],
      });
      const pOferta = product({
        id: 'pOferta',
        title: 'Essência Extra',
        price: 40,
        items: [{ id: 'piOferta', stock: 20, options: [] }],
      });
      const bump = {
        id: 'bCombo',
        storeId: 'store-1',
        isActive: true,
        triggerType: 'PRODUCT',
        triggerProductId: 'pGatilho',
        suggestedProductId: 'pOferta',
        customPrice: 20,
        discountPercent: null,
      };
      const combo = {
        id: 'cCombo',
        name: 'Combo Especial',
        price: 80,
        isActive: true,
        items: [
          {
            productId: 'pGatilho',
            quantity: 1,
            product: pGatilho,
            productItemId: 'piGatilho',
          },
        ],
      };
      const items = [
        {
          isCombo: true,
          comboId: 'cCombo',
          productName: 'Combo Especial',
          quantity: 1,
          price: 80,
        },
        {
          productId: 'pOferta',
          productName: 'Essência Extra',
          quantity: 1,
          price: 20,
          isOrderBump: true,
          orderBumpId: 'bCombo',
        },
      ];
      const ok = await createPublic(
        {
          products: { p1: product(), pGatilho, pOferta },
          combo,
          bump,
        },
        order({
          items,
          itemsTotal: 100,
          freight: 10,
          totalOrder: 110,
          totalReceived: 110,
        }),
      );
      expect(ok.error).toBeNull();
      expect(ok.saved().itemsTotal).toBe(100);
      expect(ok.saved().totalOrder).toBe(110);
    });

    it('segurança: comboSnapshot forjado no payload do cliente não ativa gatilho de oferta', async () => {
      const pGatilho = product({
        id: 'pGatilho',
        title: 'Pod Gatilho',
        price: 60,
        items: [{ id: 'piGatilho', stock: 20, options: [] }],
      });
      const pOferta = product({
        id: 'pOferta',
        title: 'Essência Extra',
        price: 40,
        items: [{ id: 'piOferta', stock: 20, options: [] }],
      });
      const bump = {
        id: 'bCombo',
        storeId: 'store-1',
        isActive: true,
        triggerType: 'PRODUCT',
        triggerProductId: 'pGatilho',
        suggestedProductId: 'pOferta',
        customPrice: 20,
        discountPercent: null,
      };
      // Atacante envia um produto avulso barato tentando injetar comboSnapshot com o productId gatilho
      const items = [
        {
          productId: 'p1',
          productName: 'Bala',
          quantity: 1,
          price: 50,
          comboSnapshot: { items: [{ productId: 'pGatilho' }] },
        },
        {
          productId: 'pOferta',
          productName: 'Essência Extra',
          quantity: 1,
          price: 20, // preço do order bump que não deveria ser aceito
          isOrderBump: true,
          orderBumpId: 'bCombo',
        },
      ];
      const res = await createPublic(
        {
          products: { p1: product({ id: 'p1', price: 50 }), pGatilho, pOferta },
          combo: null,
          bump,
        },
        order({
          items,
          itemsTotal: 70,
          freight: 10,
          totalOrder: 80,
          totalReceived: 80,
        }),
      );
      // Gatilho não é satisfeito porque comboSnapshot forjado é ignorado, logo o preço da oferta é recusado
      expect(res.error).toBeInstanceOf(BadRequestException);
      expect(res.error?.message).toContain('mudou');
      expect(res.saveWithStockDecrement).not.toHaveBeenCalled();
    });

    it('produto customizado (marmita/açaí): calcula corretamente preço base + adicionais', async () => {
      const marmita = product({
        id: 'pMarmita',
        title: 'Marmita Tradicional M',
        isCustomizable: true,
        price: 25,
      });
      const optArroz = {
        id: 'optArroz',
        name: 'Arroz Branco',
        price: 0,
        group: { id: 'gBase', name: 'Base', freeQuantity: 0 },
      };
      const optPicanha = {
        id: 'optPicanha',
        name: 'Picanha',
        price: 8,
        group: { id: 'gCarne', name: 'Carne', freeQuantity: 0 },
      };
      const items = [
        {
          productId: 'pMarmita',
          productName: 'Marmita Tradicional M',
          quantity: 1,
          price: 33, // 25 base + 8 picanha
          isCustomized: true,
          customizationSnapshot: {
            basePrice: 25,
            stages: [
              {
                groupId: 'gBase',
                groupName: 'Base',
                options: [
                  {
                    optionId: 'optArroz',
                    name: 'Arroz Branco',
                    quantity: 1,
                    price: 0,
                  },
                ],
              },
              {
                groupId: 'gCarne',
                groupName: 'Carne',
                options: [
                  {
                    optionId: 'optPicanha',
                    name: 'Picanha',
                    quantity: 1,
                    price: 8,
                  },
                ],
              },
            ],
            totalAdditions: 8,
            finalUnitPrice: 33,
          },
        },
      ];

      const ok = await createPublic(
        {
          products: { pMarmita: marmita },
          options: [optArroz, optPicanha],
        },
        order({
          items,
          itemsTotal: 33,
          freight: 10,
          totalOrder: 43,
          totalReceived: 43,
        }),
      );

      expect(ok.error).toBeNull();
      expect(ok.saved().itemsTotal).toBe(33);
      expect(ok.saved().totalOrder).toBe(43);
      expect(ok.saved().items[0].isCustomized).toBe(true);
      // O snapshot salvo é reconstruído a partir do banco
      expect(
        ok.saved().items[0].customizationSnapshot.stages[1].options[0].name,
      ).toBe('Picanha');
    });

    it('produto customizado: adulteração no preço do adicional é recusada pelo servidor', async () => {
      const marmita = product({
        id: 'pMarmita',
        title: 'Marmita Tradicional M',
        isCustomizable: true,
        price: 25,
      });
      const optPicanha = {
        id: 'optPicanha',
        name: 'Picanha',
        price: 8,
        group: { id: 'gCarne', name: 'Carne', freeQuantity: 0 },
      };
      const items = [
        {
          productId: 'pMarmita',
          productName: 'Marmita Tradicional M',
          quantity: 1,
          price: 26, // cliente tenta pagar 26 em vez de 33 (tentando burlar o adicional de R$ 8 da picanha)
          isCustomized: true,
          customizationSnapshot: {
            basePrice: 25,
            stages: [
              {
                groupId: 'gCarne',
                groupName: 'Carne',
                options: [
                  {
                    optionId: 'optPicanha',
                    name: 'Picanha',
                    quantity: 1,
                    price: 1,
                  },
                ],
              },
            ],
            totalAdditions: 1,
            finalUnitPrice: 26,
          },
        },
      ];

      const res = await createPublic(
        {
          products: { pMarmita: marmita },
          options: [optPicanha],
        },
        order({
          items,
          itemsTotal: 26,
          freight: 5,
          totalOrder: 31,
          totalReceived: 31,
        }),
      );

      expect(res.error).toBeInstanceOf(BadRequestException);
      expect(res.error?.message).toContain('mudou');
      expect(res.saveWithStockDecrement).not.toHaveBeenCalled();
    });

    it('produto customizado [SEGURANÇA]: rejeita quantidade negativa em opções adicionais', async () => {
      const marmita = product({
        id: 'pMarmita',
        title: 'Marmita Tradicional M',
        isCustomizable: true,
        price: 50,
      });
      const optPicanha = {
        id: 'optPicanha',
        name: 'Picanha',
        price: 10,
        group: { id: 'gCarne', name: 'Carne', freeQuantity: 0 },
      };
      const items = [
        {
          productId: 'pMarmita',
          productName: 'Marmita Tradicional M',
          quantity: 1,
          price: 30, // atacante tenta abater 20 reais com quantity -2
          isCustomized: true,
          customizationSnapshot: {
            basePrice: 50,
            stages: [
              {
                groupId: 'gCarne',
                groupName: 'Carne',
                options: [
                  {
                    optionId: 'optPicanha',
                    name: 'Picanha',
                    quantity: -2,
                    price: 10,
                  },
                ],
              },
            ],
            totalAdditions: -20,
            finalUnitPrice: 30,
          },
        },
      ];

      const res = await createPublic(
        {
          products: { pMarmita: marmita },
          options: [optPicanha],
        },
        order({
          items,
          itemsTotal: 30,
          freight: 10,
          totalOrder: 40,
          totalReceived: 40,
        }),
      );

      expect(res.error).toBeInstanceOf(BadRequestException);
      expect(res.error?.message).toContain('inteiro positivo');
      expect(res.saveWithStockDecrement).not.toHaveBeenCalled();
    });

    it('produto customizado [SEGURANÇA]: rejeita opção fantasma sem optionId válido ou inexistente', async () => {
      const marmita = product({
        id: 'pMarmita',
        title: 'Marmita Tradicional M',
        isCustomizable: true,
        price: 25,
      });
      const items = [
        {
          productId: 'pMarmita',
          productName: 'Marmita Tradicional M',
          quantity: 1,
          price: 25,
          isCustomized: true,
          customizationSnapshot: {
            basePrice: 25,
            stages: [
              {
                groupId: 'gCarne',
                groupName: 'Carne',
                options: [
                  {
                    name: 'Picanha Fantasma Não Cobrada',
                    quantity: 2,
                  },
                ],
              },
            ],
          },
        },
      ];

      const res = await createPublic(
        {
          products: { pMarmita: marmita },
          options: [],
        },
        order({
          items,
          itemsTotal: 25,
          freight: 10,
          totalOrder: 35,
          totalReceived: 35,
        }),
      );

      expect(res.error).toBeInstanceOf(BadRequestException);
      expect(res.error?.message).toContain('Identificador da opção');
      expect(res.saveWithStockDecrement).not.toHaveBeenCalled();
    });

    it('produto customizado: respeita cotas grátis (freeQuantity) na montagem', async () => {
      const marmita = product({
        id: 'pMarmita',
        title: 'Marmita Tradicional M',
        isCustomizable: true,
        price: 25,
      });
      const optMolho1 = {
        id: 'optMolho1',
        name: 'Molho Barbecue',
        price: 3,
        group: { id: 'gMolhos', name: 'Molhos', freeQuantity: 2 },
      };
      const optMolho2 = {
        id: 'optMolho2',
        name: 'Molho Alho',
        price: 3,
        group: { id: 'gMolhos', name: 'Molhos', freeQuantity: 2 },
      };
      const items = [
        {
          productId: 'pMarmita',
          productName: 'Marmita Tradicional M',
          quantity: 1,
          price: 25, // 2 molhos grátis escolhidos -> acréscimo R$ 0
          isCustomized: true,
          customizationSnapshot: {
            basePrice: 25,
            stages: [
              {
                groupId: 'gMolhos',
                groupName: 'Molhos',
                options: [
                  {
                    optionId: 'optMolho1',
                    name: 'Molho Barbecue',
                    quantity: 1,
                  },
                  { optionId: 'optMolho2', name: 'Molho Alho', quantity: 1 },
                ],
              },
            ],
          },
        },
      ];

      const ok = await createPublic(
        {
          products: { pMarmita: marmita },
          options: [optMolho1, optMolho2],
        },
        order({
          items,
          itemsTotal: 25,
          freight: 10,
          totalOrder: 35,
          totalReceived: 35,
        }),
      );

      expect(ok.error).toBeNull();
      expect(ok.saved().itemsTotal).toBe(25);
      expect(ok.saved().items[0].customizationSnapshot.totalAdditions).toBe(0);
      expect(ok.saved().items[0].customizationSnapshot.finalUnitPrice).toBe(25);
    });

    describe('montagem [SEGURANÇA]: grupo, cota e limites vêm do banco', () => {
      const gCarne = {
        id: 'gCarne',
        name: 'Carne',
        freeQuantity: 0,
        maxQuantity: 3,
      };
      const gMolhos = {
        id: 'gMolhos',
        name: 'Molhos',
        freeQuantity: 2,
        maxQuantity: 10,
      };
      const marmita = () =>
        product({
          id: 'pMarmita',
          title: 'Marmita',
          price: 25,
          isCustomizable: true,
        });
      const picanha = {
        id: 'optPicanha',
        name: 'Picanha',
        price: 15,
        maxQuantityPerItem: 2,
        group: gCarne,
      };
      const molho = (n: number) => ({
        id: `optMolho${n}`,
        name: `Molho ${n}`,
        price: 3,
        maxQuantityPerItem: 2,
        sortOrder: n,
        group: gMolhos,
      });
      const customItem = (
        price: number,
        stages: Fields[],
        extra: Fields = {},
      ) => ({
        productId: 'pMarmita',
        productName: 'Marmita',
        quantity: 1,
        price,
        isCustomized: true,
        customizationSnapshot: { stages },
        ...extra,
      });
      const run = (setup: Setup, it0: Fields) =>
        createPublic(
          { products: { pMarmita: marmita() }, ...setup },
          order({
            items: [it0],
            itemsTotal: it0.price,
            freight: 10,
            totalOrder: it0.price + 10,
            totalReceived: it0.price + 10,
          }),
        );

      it('etapa com groupId trocado não usa a cota grátis de outro grupo', async () => {
        const stages = [
          {
            groupId: 'gMolhos',
            groupName: 'Molhos',
            options: [{ optionId: 'optPicanha', quantity: 2 }],
          },
        ];
        const bad = await run(
          { options: [picanha, molho(1)] },
          customItem(25, stages),
        );
        expect(bad.error).toBeInstanceOf(BadRequestException);
        expect(bad.error?.message).toContain('mudou');
        expect(bad.saveWithStockDecrement).not.toHaveBeenCalled();

        // Preço cheio (25 + 2x15) passa, e a etapa gravada é a do grupo real
        const ok = await run(
          { options: [picanha, molho(1)] },
          customItem(55, stages),
        );
        expect(ok.error).toBeNull();
        const snap = ok.saved().items[0].customizationSnapshot;
        expect(snap.stages).toEqual([
          {
            groupId: 'gCarne',
            groupName: 'Carne',
            options: [
              {
                optionId: 'optPicanha',
                name: 'Picanha',
                quantity: 2,
                unitPrice: 15,
                totalPrice: 30,
              },
            ],
          },
        ]);
      });

      it('grupo dividido em várias etapas aplica a cota grátis uma vez só', async () => {
        const opts = [molho(1), molho(2), molho(3)];
        const stages = opts.map((o) => ({
          groupId: 'gMolhos',
          options: [{ optionId: o.id, quantity: 2 }],
        }));
        // 6 molhos, 2 grátis: 4 x R$ 3 = R$ 12
        const bad = await run({ options: opts }, customItem(25, stages));
        expect(bad.error).toBeInstanceOf(BadRequestException);
        expect(bad.error?.message).toContain('mudou');

        const ok = await run({ options: opts }, customItem(37, stages));
        expect(ok.error).toBeNull();
        const snap = ok.saved().items[0].customizationSnapshot;
        expect(snap.totalAdditions).toBe(12);
        expect(snap.stages).toHaveLength(1);
        expect(snap.stages[0].options.map((o: Fields) => o.totalPrice)).toEqual(
          [0, 6, 6],
        );
      });

      it('etapa sem groupId não estende a cota de um grupo a opções de outro', async () => {
        const stages = [
          {
            options: [
              { optionId: 'optMolho1', quantity: 1 },
              { optionId: 'optPicanha', quantity: 1 },
            ],
          },
        ];
        const bad = await run(
          { options: [molho(1), picanha] },
          customItem(25, stages),
        );
        expect(bad.error?.message).toContain('mudou');
        const ok = await run(
          { options: [molho(1), picanha] },
          customItem(40, stages),
        );
        expect(ok.error).toBeNull();
      });

      it('opção de grupo não ligado ao produto é recusada', async () => {
        const stages = [
          {
            groupId: 'gCarne',
            options: [{ optionId: 'optPicanha', quantity: 1 }],
          },
        ];
        const res = await run(
          {
            options: [picanha],
            productCompositions: [
              { productId: 'pMarmita', groupId: 'gMolhos', group: gMolhos },
            ],
          },
          customItem(40, stages),
        );
        expect(res.error).toBeInstanceOf(BadRequestException);
        expect(res.error?.message).toContain('não pertencem a este produto');
        expect(res.saveWithStockDecrement).not.toHaveBeenCalled();
      });

      it('maxQuantity do grupo (e customMaxQuantity da ligação) é conferido no servidor', async () => {
        const opts = [molho(1), molho(2)];
        const stages = [
          {
            groupId: 'gMolhos',
            options: [
              { optionId: 'optMolho1', quantity: 2 },
              { optionId: 'optMolho2', quantity: 1 },
            ],
          },
        ];
        const res = await run(
          {
            options: opts,
            productCompositions: [
              {
                productId: 'pMarmita',
                groupId: 'gMolhos',
                customMaxQuantity: 2,
                group: gMolhos,
              },
            ],
          },
          customItem(28, stages),
        );
        expect(res.error).toBeInstanceOf(BadRequestException);
        expect(res.error?.message).toContain('no máximo 2 escolha');
        expect(res.saveWithStockDecrement).not.toHaveBeenCalled();
      });

      it('maxQuantityPerItem é conferido mesmo somando a opção repetida em várias etapas', async () => {
        const stages = [
          {
            groupId: 'gCarne',
            options: [{ optionId: 'optPicanha', quantity: 2 }],
          },
          {
            groupId: 'gCarne',
            options: [{ optionId: 'optPicanha', quantity: 1 }],
          },
        ];
        const res = await run({ options: [picanha] }, customItem(70, stages));
        expect(res.error).toBeInstanceOf(BadRequestException);
        expect(res.error?.message).toContain('no máximo 2 unidade');
      });

      it('isCustomized=false com snapshot: snapshot do cliente é descartado', async () => {
        const stages = [
          {
            groupId: 'gCarne',
            groupName: 'Carne',
            options: [{ optionId: 'x', name: 'Picanha 400g', quantity: 3 }],
          },
        ];
        const ok = await run(
          { options: [picanha] },
          customItem(25, stages, { isCustomized: false }),
        );
        expect(ok.error).toBeNull();
        expect(ok.saved().items[0].isCustomized).toBeFalsy();
        expect(ok.saved().items[0].customizationSnapshot).toBeUndefined();
      });

      it('isCustomized=true em produto que não aceita montagem é recusado', async () => {
        const stages = [
          {
            groupId: 'gCarne',
            options: [{ optionId: 'optPicanha', quantity: 1 }],
          },
        ];
        const res = await run(
          {
            options: [picanha],
            products: {
              pMarmita: product({
                id: 'pMarmita',
                title: 'Marmita',
                price: 25,
              }),
            },
          },
          customItem(40, stages),
        );
        expect(res.error).toBeInstanceOf(BadRequestException);
        expect(res.error?.message).toContain('não aceita montagem');
      });
    });

    it('desconto Pix só até o percentual configurado pela loja', async () => {
      const ok = await createPublic(
        {},
        order({ paymentMethod: 'pix', paymentDiscount: 5, totalOrder: 105 }), // 5% de 100
      );
      expect(ok.error).toBeNull();
      expect(ok.saved().totalOrder).toBe(105);

      const bad = await createPublic(
        {},
        order({ paymentMethod: 'pix', paymentDiscount: 50, totalOrder: 60 }),
      );
      expect(bad.error).toBeInstanceOf(BadRequestException);

      const semPix = await createPublic(
        {},
        order({ paymentMethod: 'credit', paymentDiscount: 5, totalOrder: 105 }),
      );
      expect(semPix.error).toBeInstanceOf(BadRequestException);
    });

    it('desconto de fidelidade: recusado sem benefício, aceito até o saldo de cashback', async () => {
      const claim = {
        receiptDiscount: 20,
        totalOrder: 90,
        redeemedReward: { rewardType: 'CASHBACK', rewardTitle: 'Cashback' },
      };
      const sem = await createPublic({}, order(claim));
      expect(sem.error).toBeInstanceOf(BadRequestException);

      const com = await createPublic(
        {
          program: { isActive: true, pointsRedemptionValue: 0.05 },
          card: { status: 'ACTIVE', cashbackBalance: 20, pointsBalance: 0 },
        },
        order(claim),
      );
      expect(com.error).toBeNull();
      expect(com.saved().totalOrder).toBe(90);

      const alem = await createPublic(
        {
          program: { isActive: true },
          card: { status: 'ACTIVE', cashbackBalance: 5, pointsBalance: 0 },
        },
        order(claim),
      );
      expect(alem.error).toBeInstanceOf(BadRequestException);
    });

    it('cupom vem do servidor: o desconto enviado pelo cliente sem cupom é ignorado', async () => {
      // cliente tenta um desconto de cupom sem informar cupom
      const forjado = await createPublic(
        {},
        order({ couponDiscount: 50, totalOrder: 60 }),
      );
      expect(forjado.error).toBeInstanceOf(BadRequestException); // total não confere (desconto não existe)

      const real = await createPublic(
        { coupon: { discountAmount: 5 } },
        order({ couponTitle: 'PROMO5', totalOrder: 105 }),
      );
      expect(real.error).toBeNull();
      expect(real.saved().couponDiscount).toBe(5);
      expect(real.saved().totalOrder).toBe(105);
    });

    it('item sem produto/combo e quantidade inválida são recusados', async () => {
      const semProduto = await createPublic(
        {},
        order({
          items: [{ productName: 'X', quantity: 1, price: 1 }],
          itemsTotal: 1,
          freight: 0,
          totalOrder: 1,
        }),
      );
      expect(semProduto.error).toBeInstanceOf(BadRequestException);
      const qtd = await createPublic(
        {},
        order({
          items: [item({ quantity: 0 })],
          itemsTotal: 0,
          freight: 0,
          totalOrder: 0,
        }),
      );
      expect(qtd.error).toBeInstanceOf(BadRequestException);
    });

    it('frete "a combinar" (-1) entra como zero', async () => {
      const { error, saved } = await createPublic(
        { settings: { deliveryType: 'TO_COMBINE' } },
        order({ freight: -1, totalOrder: 100 }),
      );
      expect(error).toBeNull();
      expect(saved().totalOrder).toBe(100);
    });
  });

  describe('o painel (admin) não muda de comportamento', () => {
    it('sem o modo público o use case segue aceitando o total enviado', async () => {
      const { useCase, saveWithStockDecrement } = build();
      await useCase
        .execute(order({ totalOrder: 123.45 }) as never)
        .catch(() => undefined);
      expect(saveWithStockDecrement.mock.calls[0][0].totalOrder).toBe(123.45);
    });
  });
});
