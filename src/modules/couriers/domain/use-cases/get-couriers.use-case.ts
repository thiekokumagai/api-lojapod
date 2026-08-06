import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class GetCouriersUseCase {
  constructor(private prisma: PrismaService) {}

  async execute() {
    const couriers = await this.prisma.courier.findMany({
      orderBy: { name: 'asc' },
      include: {
        transactions: true,
      }
    });

    return couriers.map(courier => {
      let balance = 0;
      courier.transactions.forEach(t => {
        if (t.type === 'FEE') balance += Number(t.amount);
        if (t.type === 'PAYMENT') balance -= Number(t.amount);
      });
      return {
        ...courier,
        balance,
      };
    });
  }
}
