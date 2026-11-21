import { ConflictException, ForbiddenException } from '@nestjs/common';
import { StoresController } from './infrastructure/controllers/stores.controller';
import { StoresService } from './domain/services/stores.service';
import type { JwtPayload } from '../auth/infrastructure/types/jwt-payload.type';

describe('Stores (Super Admin) — businessType + Opção B', () => {
  const superAdmin: JwtPayload = {
    sub: 'super-1',
    email: 'super@lojapod.com',
    role: 'SUPER_ADMIN',
    storeId: null,
  };

  const storeAdmin: JwtPayload = {
    sub: 'admin-1',
    email: 'admin@loja.com',
    role: 'ADMIN',
    storeId: 'store-1',
  };

  const makeSetup = (opts?: {
    currentBusinessType?: 'POD' | 'FOOD' | 'ACAI';
    customizableCount?: number;
  }) => {
    const existingStore = {
      id: 'store-1',
      subdomain: 'demo',
      title: 'Loja Demo',
      adminEmail: 'admin@loja.com',
      businessType: opts?.currentBusinessType ?? 'POD',
      isActive: true,
    };

    const tx = {
      product: { updateMany: jest.fn().mockResolvedValue({ count: opts?.customizableCount ?? 0 }) },
      store: {
        update: jest.fn().mockImplementation(async ({ data }: any) => ({
          ...existingStore,
          ...data,
        })),
      },
    };

    const prisma = {
      store: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.id === 'store-1') return existingStore;
          return null;
        }),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 'store-new',
          ...data,
        })),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({
          ...existingStore,
          ...data,
        })),
      },
      storeSubscription: { upsert: jest.fn().mockResolvedValue({}) },
      storeSettings: {
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        upsert: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      product: {
        count: jest.fn().mockResolvedValue(opts?.customizableCount ?? 0),
      },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
    };

    const service = new StoresService(prisma as any, {} as any);
    const controller = new StoresController(service);
    return { controller, service, prisma, tx };
  };

  it('SUPER_ADMIN cria loja com businessType FOOD', async () => {
    const { controller, prisma } = makeSetup();

    const created = await controller.createStore(
      {
        title: 'Marmitaria Central',
        subdomain: 'marmitaria',
        adminEmail: 'dono@marmitaria.com',
        businessType: 'FOOD',
      },
      superAdmin,
    );

    expect(created.businessType).toBe('FOOD');
    expect(prisma.store.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ businessType: 'FOOD' }),
      }),
    );
  });

  it('ADMIN comum recebe 403 ao tentar alterar businessType ou forceDisableCustomizations em PUT /stores/:id', async () => {
    const { controller, prisma } = makeSetup({ currentBusinessType: 'POD' });

    await expect(
      controller.updateStore(
        'store-1',
        { businessType: 'ACAI' },
        storeAdmin,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      controller.updateStore(
        'store-1',
        { forceDisableCustomizations: true },
        storeAdmin,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it('SUPER_ADMIN troca segmento de POD para ACAI com sucesso', async () => {
    const { controller, prisma } = makeSetup({ currentBusinessType: 'POD' });

    const updated = await controller.updateStore(
      'store-1',
      { businessType: 'ACAI' },
      superAdmin,
    );

    expect(updated.businessType).toBe('ACAI');
    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: expect.objectContaining({ businessType: 'ACAI' }),
    });
  });

  it('SUPER_ADMIN trocando FOOD para POD com produtos personalizáveis bloqueia com 409 sem flag', async () => {
    const { controller, prisma } = makeSetup({
      currentBusinessType: 'FOOD',
      customizableCount: 3,
    });

    try {
      await controller.updateStore(
        'store-1',
        { businessType: 'POD' },
        superAdmin,
      );
      fail('Deveria lançar ConflictException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toEqual(
        expect.objectContaining({
          code: 'CUSTOMIZABLE_PRODUCTS_EXIST',
          customizableProductsCount: 3,
        }),
      );
    }

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it('SUPER_ADMIN trocando FOOD para POD com forceDisableCustomizations: true desmarca só produtos dessa loja em transação', async () => {
    const { controller, prisma, tx } = makeSetup({
      currentBusinessType: 'FOOD',
      customizableCount: 3,
    });

    const updated = await controller.updateStore(
      'store-1',
      { businessType: 'POD', forceDisableCustomizations: true },
      superAdmin,
    );

    expect(updated.businessType).toBe('POD');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1', isCustomizable: true },
      data: { isCustomizable: false },
    });
    expect(tx.store.update).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: expect.objectContaining({ businessType: 'POD' }),
    });
  });
});
