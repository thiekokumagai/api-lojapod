import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class GetCourierUseCase {
  constructor(private prisma: PrismaService) {}

  async execute(id: string) {
    const courier = await this.prisma.courier.findUnique({
      where: { id },
      include: {
        transactions: {
          orderBy: { date: 'desc' }
        },
      }
    });

    if (!courier) {
      throw new NotFoundException('Motoboy não encontrado');
    }

    let balance = 0;
    courier.transactions.forEach(t => {
      if (t.type === 'FEE') balance += Number(t.amount);
      if (t.type === 'PAYMENT') balance -= Number(t.amount);
    });

    return {
      ...courier,
      balance,
    };
  }
}
