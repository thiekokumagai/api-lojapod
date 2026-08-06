import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class PayCourierUseCase {
  constructor(private prisma: PrismaService) {}

  async execute(data: { courierId: string; amount: number; description?: string }) {
    if (!data.courierId || !data.amount) {
      throw new BadRequestException('CourierId and amount are required');
    }
    
    // Buscar o caixa atual aberto
    const activeRegister = await this.prisma.cashRegister.findFirst({
      where: {
        endDate: { gte: new Date() },
        startDate: { lte: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!activeRegister) {
      throw new BadRequestException('Nenhum caixa aberto para o dia de hoje. Abra um caixa para poder registrar o pagamento.');
    }

    const courier = await this.prisma.courier.findUnique({ where: { id: data.courierId } });
    if (!courier) throw new BadRequestException('Motoboy não encontrado');

    const desc = data.description || `Pagamento Motoboy: ${courier.name}`;

    // 1. Criar transação de Courier
    const courierTx = await this.prisma.courierTransaction.create({
      data: {
        courierId: data.courierId,
        type: 'PAYMENT',
        amount: data.amount,
        description: desc,
      }
    });

    // 2. Criar transação de Saída no Caixa
    await this.prisma.cashTransaction.create({
      data: {
        cashRegisterId: activeRegister.id,
        type: 'OUTFLOW',
        amount: data.amount,
        category: 'MOTOBOY',
        description: desc,
      }
    });

    return courierTx;
  }
}
