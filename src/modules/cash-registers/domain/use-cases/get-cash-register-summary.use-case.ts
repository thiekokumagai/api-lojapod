import { Injectable, NotFoundException } from '@nestjs/common';
import { ICashRegistersRepository } from '../repositories/icash-registers.repository';
import { IOrdersRepository } from '../../../orders/domain/repositories/iorders.repository';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class GetCashRegisterSummaryUseCase {
  constructor(
    private readonly cashRegistersRepo: ICashRegistersRepository,
    private readonly ordersRepo: IOrdersRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(id: string): Promise<any> {
    const register = await this.cashRegistersRepo.findById(id);
    if (!register) {
      throw new NotFoundException(`CashRegister with ID ${id} not found`);
    }

    const startOfDay = new Date(register.startDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(register.endDate);
    endOfDay.setHours(23, 59, 59, 999);

    const orders = await this.ordersRepo.findPaidOrdersByPaymentDateRange(
      startOfDay,
      endOfDay,
    );

    const transactions = await this.prisma.cashTransaction.findMany({
      where: { cashRegisterId: id },
      orderBy: { date: 'desc' },
    });

    let totalReceived = 0;
    let totalCardFees = 0;
    let totalProductCost = 0;
    const totalsByMethod: Record<string, number> = {};

    for (const order of orders) {
      totalReceived += order.totalReceived;
      totalCardFees += order.cardFee || 0;
      
      for (const item of order.items || []) {
        totalProductCost += (item.costPrice || 0) * item.quantity;
      }

      const method = order.paymentMethod || 'Outros';
      totalsByMethod[method] =
        (totalsByMethod[method] || 0) + order.totalReceived;
    }

    let totalEntries = 0;
    let totalOutflows = 0;
    let motoboyOutflows = 0;
    let partnersOutflows = 0;
    let thiekoOutflows = 0;
    let muriloOutflows = 0;
    let marketingOutflows = 0;
    let totalInvestment = 0;

    for (const tx of transactions) {
      if (tx.type === 'ENTRY') {
        totalEntries += Number(tx.amount);
      } else if (tx.type === 'OUTFLOW') {
        const descLower = tx.description ? tx.description.toLowerCase() : '';
        const isInvestment = tx.category === 'INVESTMENT' || descLower.includes('investimento');
        const isMotoboy = tx.category === 'MOTOBOY';
        const isMarketing = tx.category === 'MARKETING' || descLower.includes('marketing');
        const isPartners = tx.category === 'PARTNERS' || descLower.includes('thieko') || descLower.includes('murilo');

        if (isInvestment) {
          totalInvestment += Number(tx.amount);
        } else if (isMotoboy) {
          motoboyOutflows += Number(tx.amount);
        } else if (isMarketing) {
          marketingOutflows += Number(tx.amount);
        } else if (isPartners) {
          partnersOutflows += Number(tx.amount);
          if (descLower.includes('thieko')) {
            thiekoOutflows += Number(tx.amount);
          }
          if (descLower.includes('murilo')) {
            muriloOutflows += Number(tx.amount);
          }
        } else {
          totalOutflows += Number(tx.amount);
        }
      }
    }

    // Faturamento bruto comercial das vendas + entradas manuais
    let totalGross = totalReceived + totalEntries;

    // Arredonda para evitar problemas matemáticos de ponto flutuante
    totalReceived = Math.round(totalReceived * 100) / 100;
    totalCardFees = Math.round(totalCardFees * 100) / 100;
    totalEntries = Math.round(totalEntries * 100) / 100;
    totalOutflows = Math.round(totalOutflows * 100) / 100;
    motoboyOutflows = Math.round(motoboyOutflows * 100) / 100;
    partnersOutflows = Math.round(partnersOutflows * 100) / 100;
    thiekoOutflows = Math.round(thiekoOutflows * 100) / 100;
    muriloOutflows = Math.round(muriloOutflows * 100) / 100;
    marketingOutflows = Math.round(marketingOutflows * 100) / 100;
    totalGross = Math.round(totalGross * 100) / 100;

    // Saldo Líquido de Caixa = Faturamento Comercial Bruto + Entradas Manuais - Taxas Cartão - Saídas/Custos Fixos - Investimentos - Motoboy - Marketing - Sócios
    const totalNet =
      Math.round((totalGross - totalCardFees - totalOutflows - totalInvestment - motoboyOutflows - marketingOutflows - partnersOutflows) * 100) / 100;
    
    totalInvestment = Math.round(totalInvestment * 100) / 100;
    totalProductCost = Math.round(totalProductCost * 100) / 100;

    return {
      cashRegister: register,
      summary: {
        totalReceived, // Mantido para retrocompatibilidade
        totalGross,
        totalCardFees,
        totalEntries,
        totalOutflows,
        motoboyOutflows,
        partnersOutflows,
        thiekoOutflows,
        muriloOutflows,
        marketingOutflows,
        totalNet,
        totalInvestment,
        totalProductCost,
        totalsByMethod,
        orderCount: orders.length,
      },
      orders,
      transactions,
    };
  }
}
