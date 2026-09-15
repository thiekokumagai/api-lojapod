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
      marketingOutflows: 0,
      totalInvestment: 0,
      totalProductCost: 0,
      totalNet: 145,
      totalNetProfit: 145,
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
      { type: 'OUTFLOW', category: 'PARTNERS', amount: 200, description: 'Retirada Sócios' },
      { type: 'OUTFLOW', category: 'GENERAL', amount: 30, description: 'Material de Limpeza' },
    ]);

    const result = await useCase.execute('register-1');

    expect(result.summary.totalOutflows).toBe(30);
    expect(result.summary.totalInvestment).toBe(100);
    expect(result.summary.motoboyOutflows).toBe(50);
    expect(result.summary.marketingOutflows).toBe(40);
    expect(result.summary.partnersOutflows).toBe(200);
    expect(result.summary.totalNet).toBe(-420);
    expect(result.summary.totalNetProfit).toBe(-420);
  });

  it('should calculate totalNetProfit according to investment vs product cost rules', async () => {
    mockCashRepo.findById.mockResolvedValue(mockRegister);
    // Order with 100 received, 0 card fee, product cost = 8
    mockOrdersRepo.findPaidOrdersByPaymentDateRange.mockResolvedValue([
      new Order({
        id: 'order-1',
        totalReceived: 100,
        cardFee: 0,
        items: [{ costPrice: 8, quantity: 1 } as any],
      }),
    ]);

    // Case A: Investment = 8 (Equal to product cost 8) -> deduction = 0 -> Net Profit = 100 - 8 = 92
    mockPrisma.cashTransaction.findMany.mockResolvedValue([
      { type: 'OUTFLOW', category: 'INVESTMENT', amount: 8, description: 'Investimento Estoque' },
    ]);

    let result = await useCase.execute('register-1');
    expect(result.summary.totalProductCost).toBe(8);
    expect(result.summary.totalInvestment).toBe(8);
    expect(result.summary.totalNetProfit).toBe(92);

    // Case B: Investment = 10 (> product cost 8) -> deduction = 10 - 8 = 2 -> Net Profit = 100 - 8 - 2 = 90
    mockPrisma.cashTransaction.findMany.mockResolvedValue([
      { type: 'OUTFLOW', category: 'INVESTMENT', amount: 10, description: 'Investimento Estoque' },
    ]);

    result = await useCase.execute('register-1');
    expect(result.summary.totalProductCost).toBe(8);
    expect(result.summary.totalInvestment).toBe(10);
    expect(result.summary.totalNetProfit).toBe(90);
  });
});
