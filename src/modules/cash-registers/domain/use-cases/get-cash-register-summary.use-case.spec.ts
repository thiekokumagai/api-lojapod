import { GetCashRegisterSummaryUseCase } from './get-cash-register-summary.use-case';
import { ICashRegistersRepository } from '../repositories/icash-registers.repository';
import { IOrdersRepository } from '../../../orders/domain/repositories/iorders.repository';
import { CashRegister } from '../entities/cash-register.entity';
import { Order } from '../../../orders/domain/entities/order.entity';
import { NotFoundException } from '@nestjs/common';

describe('GetCashRegisterSummaryUseCase', () => {
  let useCase: GetCashRegisterSummaryUseCase;
  let mockCashRepo: jest.Mocked<ICashRegistersRepository>;
  let mockOrdersRepo: jest.Mocked<IOrdersRepository>;
  let mockPrisma: any;

  const mockRegister = {
    id: 'register-1',
    title: 'Caixa de Teste',
    operatorId: 'operator-1',
    status: 'CLOSED' as any,
    openingBalance: 100,
    closingBalance: 250,
    startDate: new Date('2026-05-23T10:00:00Z'),
    endDate: new Date('2026-05-23T22:00:00Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as CashRegister;

  const mockOrders = [
    new Order({
      id: 'order-1',
      totalReceived: 100,
      cardFee: 5,
      paymentMethod: 'Cartão de Crédito',
    }),
    new Order({
      id: 'order-2',
      totalReceived: 50,
      cardFee: 0,
      paymentMethod: 'PIX',
    }),
  ];

  beforeEach(() => {
    mockCashRepo = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<ICashRegistersRepository>;

    mockOrdersRepo = {
      findPaidOrdersByPaymentDateRange: jest.fn(),
    } as unknown as jest.Mocked<IOrdersRepository>;

    mockPrisma = {
      cashTransaction: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    useCase = new GetCashRegisterSummaryUseCase(
      mockCashRepo,
      mockOrdersRepo,
      mockPrisma,
    );
  });

  it('should throw NotFoundException if cash register does not exist', async () => {
    mockCashRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute('invalid-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should calculate gross, card fees, net, and totals by method', async () => {
    mockCashRepo.findById.mockResolvedValue(mockRegister);
    mockOrdersRepo.findPaidOrdersByPaymentDateRange.mockResolvedValue(
      mockOrders,
    );

    const result = await useCase.execute('register-1');

    expect(result.cashRegister).toEqual(mockRegister);
    expect(result.summary).toEqual({
      totalReceived: 150,
      totalGross: 150,
      totalCardFees: 5,
      totalEntries: 0,
      totalOutflows: 0,
      motoboyOutflows: 0,
      partnersOutflows: 0,
      thiekoOutflows: 0,
      muriloOutflows: 0,
      marketingOutflows: 0,
      totalInvestment: 0,
      totalProductCost: 0,
      totalNet: 145,
      orderCount: 2,
      totalsByMethod: {
        'Cartão de Crédito': 100,
        PIX: 50,
      },
    });

    expect(
      mockOrdersRepo.findPaidOrdersByPaymentDateRange,
    ).toHaveBeenCalled();
  });

  it('should exclude INVESTMENT, MOTOBOY, MARKETING, and PARTNERS from totalOutflows', async () => {
    mockCashRepo.findById.mockResolvedValue(mockRegister);
    mockOrdersRepo.findPaidOrdersByPaymentDateRange.mockResolvedValue([]);
    mockPrisma.cashTransaction.findMany.mockResolvedValue([
      { type: 'OUTFLOW', category: 'INVESTMENT', amount: 100, description: 'Investimento em Maquinário' },
      { type: 'OUTFLOW', category: 'MOTOBOY', amount: 50, description: 'Frete Motoboy' },
      { type: 'OUTFLOW', category: 'MARKETING', amount: 40, description: 'Anúncios Instagram' },
      { type: 'OUTFLOW', category: 'PARTNERS', amount: 200, description: 'Retirada Thieko' },
      { type: 'OUTFLOW', category: 'GENERAL', amount: 30, description: 'Material de Limpeza' },
    ]);

    const result = await useCase.execute('register-1');

    expect(result.summary.totalOutflows).toBe(30);
    expect(result.summary.totalInvestment).toBe(100);
    expect(result.summary.motoboyOutflows).toBe(50);
    expect(result.summary.marketingOutflows).toBe(40);
    expect(result.summary.partnersOutflows).toBe(200);
    expect(result.summary.thiekoOutflows).toBe(200);
    expect(result.summary.totalNet).toBe(-420);
  });
});
