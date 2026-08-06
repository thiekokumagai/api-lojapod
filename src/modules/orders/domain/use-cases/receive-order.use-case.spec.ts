import { ReceiveOrderUseCase } from './receive-order.use-case';
import { IOrdersRepository } from '../repositories/iorders.repository';
import { ISettingsRepository } from '../../../settings/domain/repositories/isettings.repository';
import { Order, OrderStatus, PaymentStatus } from '../entities/order.entity';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { StoreSettings } from '../../../settings/domain/entities/store-settings.entity';

describe('ReceiveOrderUseCase', () => {
  let receiveOrderUseCase: ReceiveOrderUseCase;
  let mockOrdersRepository: jest.Mocked<IOrdersRepository>;
  let mockSettingsRepository: jest.Mocked<ISettingsRepository>;

  const mockSettings: StoreSettings = {
    id: 'settings-1',
    paymentRules: [
      {
        paymentMethod: 'credit',
        type: 'charge',
        value: 5,
        parcelaMin: 1,
        parcelaMax: 12,
      },
      {
        paymentMethod: 'pix',
        type: 'discount',
        value: 10,
        parcelaMin: 0,
        parcelaMax: 0,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as StoreSettings;

  const mockOrder = new Order({
    id: 'order-1',
    orderNumber: 100,
    customerName: 'Cliente Teste',
    customerPhone: '11999999999',
    itemsTotal: 100,
    freight: 10,
    totalOrder: 110,
    totalReceived: 0,
    cardFee: 0,
    paymentType: 'Cartão',
    paymentMethod: 'Cartão de Crédito',
    status: OrderStatus.CONFIRMED,
    paymentStatus: PaymentStatus.PENDING,
  });

  beforeEach(() => {
    mockOrdersRepository = {
      findById: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<IOrdersRepository>;

    mockSettingsRepository = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ISettingsRepository>;

    const mockEventsGateway = {
      emitOrderUpdated: jest.fn(),
      emitOrderCreated: jest.fn(),
    } as any;

    receiveOrderUseCase = new ReceiveOrderUseCase(
      mockOrdersRepository,
      mockSettingsRepository,
      mockEventsGateway,
    );
  });

  it('should throw NotFoundException if order does not exist', async () => {
    mockOrdersRepository.findById.mockResolvedValue(null);

    await expect(
      receiveOrderUseCase.execute('invalid-id', { totalReceived: 110 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException if order is cancelled', async () => {
    const cancelledOrder = new Order({
      ...mockOrder,
      status: OrderStatus.CANCELLED,
    });
    mockOrdersRepository.findById.mockResolvedValue(cancelledOrder);

    await expect(
      receiveOrderUseCase.execute('order-1', { totalReceived: 110 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should receive payment for PIX with discount and update totalOrder', async () => {
    mockOrdersRepository.findById.mockResolvedValue(mockOrder);
    mockSettingsRepository.get.mockResolvedValue(mockSettings);
    mockOrdersRepository.save.mockImplementation(async (o) => o);

    const result = await receiveOrderUseCase.execute('order-1', {
      paymentMethod: 'PIX',
      paymentDiscount: 11, // 10% of 110
      totalReceived: 99,
    });

    expect(result.paymentStatus).toBe(PaymentStatus.PAID);
    expect(result.paymentDiscount).toBe(11);
    expect(result.totalReceived).toBe(99);
    expect(result.totalOrder).toBe(99); // 100 + 10 - 11
    expect(mockOrdersRepository.save).toHaveBeenCalledTimes(1);
  });

  it('should receive payment for credit card with surcharge and dynamic cardFee calculation', async () => {
    mockOrdersRepository.findById.mockResolvedValue(mockOrder);
    mockSettingsRepository.get.mockResolvedValue(mockSettings);
    mockOrdersRepository.save.mockImplementation(async (o) => o);

    const result = await receiveOrderUseCase.execute('order-1', {
      paymentMethod: 'Cartão de Crédito',
      installments: 3,
      installmentSurcharge: 5.5, // 5% of 110
      totalReceived: 115.5,
    });

    expect(result.paymentStatus).toBe(PaymentStatus.PAID);
    expect(result.installmentSurcharge).toBe(5.5);
    expect(result.totalReceived).toBe(115.5);
    expect(result.totalOrder).toBe(115.5); // 100 + 10 + 5.5
    expect(result.cardFee).toBe(5.78); // 5% of 115.5 is 5.775, rounded to 5.78
    expect(mockOrdersRepository.save).toHaveBeenCalledTimes(1);
  });
});
