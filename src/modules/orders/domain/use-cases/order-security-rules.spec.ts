import { ReceiveOrderUseCase } from './receive-order.use-case';
import { CancelOrderUseCase } from './cancel-order.use-case';
import { UpdateOrderStatusUseCase } from './update-order-status.use-case';
import { RevertReceiveOrderUseCase } from './revert-receive-order.use-case';
import { Order, OrderStatus, PaymentStatus } from '../entities/order.entity';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';

describe('Regras de Segurança de Pedidos (Lojapod API)', () => {
  const events = () => ({
    server: { emit: jest.fn() },
    notifyOrderUpdated: jest.fn(),
  }) as any;

  const loyalty = () => ({
    processOrderCompleted: jest.fn().mockResolvedValue(undefined),
    revertOrderLoyalty: jest.fn().mockResolvedValue(undefined),
  }) as any;

  const settings = () => ({
    get: jest.fn().mockResolvedValue({ paymentRules: [] }),
  }) as any;

  const makeOrder = (overrides: Partial<Order> = {}) =>
    new Order({
      id: 'order-1',
      storeId: 'store-A',
      orderNumber: 101,
      customerName: 'Cliente Teste',
      customerPhone: '11999999999',
      itemsTotal: 100,
      freight: 10,
      totalOrder: 110,
      totalReceived: 0,
      cardFee: 0,
      paymentType: 'entrega',
      paymentMethod: 'Dinheiro',
      status: OrderStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PENDING,
      ...overrides,
    });

  describe('Filtro de loja nas escritas de pedido', () => {
    it('receber pedido de outra loja deve lançar NotFoundException (404)', async () => {
      const order = makeOrder({ storeId: 'store-B' });
      const repo = {
        findById: jest.fn().mockImplementation(async (id: string, storeId?: string) => {
          if (storeId && order.storeId !== storeId) return null;
          return order;
        }),
        save: jest.fn().mockImplementation(async (o) => o),
      } as any;

      const uc = new ReceiveOrderUseCase(repo, settings(), events(), loyalty());
      const user = { storeId: 'store-A', role: 'ADMIN' };

      await expect(
        uc.execute('order-1', { totalReceived: 110 }, user),
      ).rejects.toThrow(NotFoundException);
    });

    it('cancelar pedido de outra loja deve lançar NotFoundException (404)', async () => {
      const order = makeOrder({ storeId: 'store-B' });
      const repo = {
        findById: jest.fn().mockImplementation(async (id: string, storeId?: string) => {
          if (storeId && order.storeId !== storeId) return null;
          return order;
        }),
        cancelAndRestoreStock: jest.fn(),
      } as any;
      const prisma = { order: { findUnique: jest.fn() }, product: { findUnique: jest.fn() } } as any;

      const uc = new CancelOrderUseCase(repo, events(), prisma, loyalty());
      const user = { storeId: 'store-A', role: 'ADMIN' };

      await expect(uc.execute('order-1', user)).rejects.toThrow(NotFoundException);
    });

    it('mudar status de pedido de outra loja deve lançar NotFoundException (404)', async () => {
      const order = makeOrder({ storeId: 'store-B' });
      const repo = {
        findById: jest.fn().mockImplementation(async (id: string, storeId?: string) => {
          if (storeId && order.storeId !== storeId) return null;
          return order;
        }),
        save: jest.fn(),
      } as any;
      const uber = {} as any;

      const uc = new UpdateOrderStatusUseCase(repo, settings(), events(), loyalty(), uber);
      const user = { storeId: 'store-A', role: 'ADMIN' };

      await expect(
        uc.execute('order-1', { status: OrderStatus.COMPLETED }, user),
      ).rejects.toThrow(NotFoundException);
    });

    it('usuário sem storeId e não SUPER_ADMIN deve levar NotFoundException (404)', async () => {
      const order = makeOrder({ storeId: 'store-A' });
      const repo = {
        findById: jest.fn().mockResolvedValue(order),
        save: jest.fn(),
      } as any;

      const uc = new ReceiveOrderUseCase(repo, settings(), events(), loyalty());
      const userWithoutStore = { storeId: null, role: 'USER' };

      await expect(
        uc.execute('order-1', { totalReceived: 110 }, userWithoutStore),
      ).rejects.toThrow(NotFoundException);
    });

    it('usuário SUPER_ADMIN sem storeId consegue operar pedidos de qualquer loja', async () => {
      const order = makeOrder({ storeId: 'store-A' });
      const repo = {
        findById: jest.fn().mockResolvedValue(order),
        save: jest.fn().mockImplementation(async (o) => o),
      } as any;

      const uc = new ReceiveOrderUseCase(repo, settings(), events(), loyalty());
      const superAdmin = { storeId: null, role: 'SUPER_ADMIN' };

      const res = await uc.execute('order-1', { totalReceived: 110 }, superAdmin);
      expect(res.paymentStatus).toBe(PaymentStatus.PAID);
    });
  });

  describe('Validação no servidor ao receber pedido', () => {
    it('desconto acima de itensTotal + frete deve lançar BadRequestException (400)', async () => {
      const order = makeOrder({ itemsTotal: 100, freight: 10 }); // max = 110
      const repo = {
        findById: jest.fn().mockResolvedValue(order),
        save: jest.fn(),
      } as any;

      const uc = new ReceiveOrderUseCase(repo, settings(), events(), loyalty());

      await expect(
        uc.execute('order-1', {
          receiptDiscount: 115,
          totalReceived: 0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('installments inválido (< 1 ou > 12) deve lançar BadRequestException (400)', async () => {
      const order = makeOrder({ itemsTotal: 100, freight: 10 });
      const repo = {
        findById: jest.fn().mockResolvedValue(order),
        save: jest.fn(),
      } as any;

      const uc = new ReceiveOrderUseCase(repo, settings(), events(), loyalty());

      await expect(
        uc.execute('order-1', {
          installments: 13,
          totalReceived: 110,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        uc.execute('order-1', {
          installments: 0,
          totalReceived: 110,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('totalReceived menor que o total calculado no servidor deve lançar BadRequestException (400)', async () => {
      const order = makeOrder({ itemsTotal: 100, freight: 10 }); // calculado: 110
      const repo = {
        findById: jest.fn().mockResolvedValue(order),
        save: jest.fn(),
      } as any;

      const uc = new ReceiveOrderUseCase(repo, settings(), events(), loyalty());

      await expect(
        uc.execute('order-1', {
          totalReceived: 100, // Menor que 110
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('forma de pagamento não permitida deve lançar BadRequestException (400)', async () => {
      const order = makeOrder({ itemsTotal: 100, freight: 10 });
      const repo = {
        findById: jest.fn().mockResolvedValue(order),
        save: jest.fn(),
      } as any;

      const uc = new ReceiveOrderUseCase(repo, settings(), events(), loyalty());

      await expect(
        uc.execute('order-1', {
          paymentMethod: 'metodo_inventado',
          totalReceived: 110,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Bloqueio de pedido já PAID e fluxo de Cancelar Recebimento + receber de novo', () => {
    it('receber pedido já PAID deve lançar ConflictException (409 "Pedido já recebido")', async () => {
      const order = makeOrder({ paymentStatus: PaymentStatus.PAID, totalReceived: 110 });
      const repo = {
        findById: jest.fn().mockResolvedValue(order),
        save: jest.fn(),
      } as any;

      const uc = new ReceiveOrderUseCase(repo, settings(), events(), loyalty());

      await expect(
        uc.execute('order-1', { totalReceived: 110 }),
      ).rejects.toThrow(ConflictException);

      try {
        await uc.execute('order-1', { totalReceived: 110 });
      } catch (err: any) {
        expect(err.message).toBe('Pedido já recebido');
      }
    });

    it('fluxo de Cancelar Recebimento (revertReceive) + receber de novo deve funcionar', async () => {
      const order = makeOrder({ paymentStatus: PaymentStatus.PAID, totalReceived: 110 });
      const repo = {
        findById: jest.fn().mockResolvedValue(order),
        save: jest.fn().mockImplementation(async (o) => o),
      } as any;

      const revertUc = new RevertReceiveOrderUseCase(repo, events(), loyalty(), settings());
      const receiveUc = new ReceiveOrderUseCase(repo, settings(), events(), loyalty());

      // 1. Reverte o recebimento
      const reverted = await revertUc.execute('order-1');
      expect(reverted.paymentStatus).toBe(PaymentStatus.PENDING);
      expect(reverted.totalReceived).toBe(0);

      // 2. Recebe de novo
      const receivedAgain = await receiveUc.execute('order-1', { totalReceived: 110 });
      expect(receivedAgain.paymentStatus).toBe(PaymentStatus.PAID);
      expect(receivedAgain.totalReceived).toBe(110);
    });
  });
});
