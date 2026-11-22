import { resolveCustomizedAllowedPrices } from './order-customization';

describe('resolveCustomizedAllowedPrices — cálculo server-side de custo (unitCost e totalCost)', () => {
  it('grava unitCost e totalCost de opções pagas e grátis/inclusas pelo banco e ignora custo enviado pelo cliente', async () => {
    const prisma = {
      compositionOption: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'opt-arroz',
            groupId: 'grp-1',
            name: 'Arroz',
            price: 3,
            costPrice: 1.2,
            maxQuantityPerItem: 2,
            sortOrder: 0,
            group: { id: 'grp-1', name: 'Acompanhamentos', maxQuantity: 5, freeQuantity: 1 },
          },
          {
            id: 'opt-bacon',
            groupId: 'grp-1',
            name: 'Bacon Extra',
            price: 5,
            costPrice: 1.75,
            maxQuantityPerItem: 3,
            sortOrder: 1,
            group: { id: 'grp-1', name: 'Acompanhamentos', maxQuantity: 5, freeQuantity: 1 },
          },
        ]),
      },
      productComposition: {
        findMany: jest.fn().mockResolvedValue([
          {
            productId: 'prod-1',
            groupId: 'grp-1',
            sortOrder: 0,
            customMaxQuantity: 5,
            customFreeQuantity: 1,
            group: { id: 'grp-1', name: 'Acompanhamentos', maxQuantity: 5, freeQuantity: 1 },
          },
        ]),
      },
    };

    const result = await resolveCustomizedAllowedPrices(
      { id: 'prod-1', storeId: 's1', title: 'X-Bacon', price: 25, isCustomizable: true },
      {
        customizationSnapshot: {
          totalCost: 0.01, // tentativa do cliente de adulterar custo — deve ser ignorada
          stages: [
            {
              options: [
                { optionId: 'opt-arroz', quantity: 1, unitCost: 0, totalCost: 0 },
                { optionId: 'opt-bacon', quantity: 2, unitCost: 0, totalCost: 0 },
              ],
            },
          ],
        },
      },
      prisma as never,
      's1',
    );

    // Arroz é grátis para o cliente (1 slot grátis -> totalPrice = 0), mas custa 1.20 para o restaurante.
    // Bacon x2 custa 2 * 1.75 = 3.50. Total de custo = 4.70.
    expect(result.sanitizedSnapshot.totalAdditions).toBe(10);
    expect(result.sanitizedSnapshot.totalCost).toBe(4.7);
    expect(result.sanitizedSnapshot.stages[0].options).toEqual([
      expect.objectContaining({
        optionId: 'opt-arroz',
        quantity: 1,
        totalPrice: 0,
        unitCost: 1.2,
        totalCost: 1.2,
      }),
      expect.objectContaining({
        optionId: 'opt-bacon',
        quantity: 2,
        totalPrice: 10,
        unitCost: 1.75,
        totalCost: 3.5,
      }),
    ]);
  });
});
