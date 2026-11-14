/* O guard lê os metadados do método do controller; o método nunca é chamado */
/* eslint-disable @typescript-eslint/unbound-method */
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../auth/infrastructure/guards/jwt-auth.guard';
import { PERMISSIONS_KEY } from '../auth/infrastructure/decorators/permissions.decorator';
import { AbandonedCartsController } from './abandoned-carts.controller';

type StaffCheck = {
  assertStaffAccess(
    context: unknown,
    user: { sub: string; storeId?: string | null },
  ): Promise<void>;
};

const guardWith = (permissions: string[]) => {
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ storeId: 'store-A', permissions, role: 'USER' }),
    },
  };
  return new JwtAuthGuard(
    new Reflector(),
    prisma as never,
    {} as never,
  ) as unknown as StaffCheck;
};

const contextFor = (handler: () => unknown, method = 'GET') => ({
  getHandler: () => handler,
  getClass: () => AbandonedCartsController,
  switchToHttp: () => ({ getRequest: () => ({ method }) }),
});

const proto = AbandonedCartsController.prototype;

describe('AbandonedCartsController: quem vê o telefone completo da lista', () => {
  it('a rota exige login e a permissão abandoned_carts', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      AbandonedCartsController,
    ) as unknown[];

    expect(guards).toContain(JwtAuthGuard);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AbandonedCartsController),
    ).toEqual(['abandoned_carts']);
  });

  it('funcionário sem a permissão não acessa a lista nem o botão de WhatsApp', async () => {
    const guard = guardWith(['dashboard', 'orders']);
    const user = { sub: 'staff-sem-permissao', storeId: 'store-A' };

    await expect(
      guard.assertStaffAccess(contextFor(proto.list), user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guard.assertStaffAccess(contextFor(proto.whatsapp, 'POST'), user),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('funcionário com a permissão acessa a lista', async () => {
    const guard = guardWith(['abandoned_carts']);
    const user = { sub: 'staff-com-permissao', storeId: 'store-A' };

    await expect(
      guard.assertStaffAccess(contextFor(proto.list), user),
    ).resolves.toBeUndefined();
  });
});
