import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { EventsGateway } from '../../../events/events.gateway';

@Injectable()
export class DeleteCourierTransactionUseCase {
  constructor(private prisma: PrismaService, private eventsGateway: EventsGateway) {}

  async execute(transactionId: string) {
    const transaction = await this.prisma.courierTransaction.findUnique({
      where: { id: transactionId }
    });

    if (!transaction) {
      throw new NotFoundException('Transação não encontrada');
    }

    // Se foi um pagamento, excluímos também a transação do caixa correspondente.
    if (transaction.type === 'PAYMENT') {
      const cashTxs = await this.prisma.cashTransaction.findMany({
        where: {
          category: 'MOTOBOY',
          description: transaction.description,
          type: 'OUTFLOW',
        },
      });
      const cashTx = cashTxs.find(tx => Number(tx.amount) === Number(transaction.amount));
      if (cashTx) {
        await this.prisma.cashTransaction.delete({ where: { id: cashTx.id } });
      }
    }
    await this.prisma.courierTransaction.delete({
      where: { id: transactionId }
    });
    this.eventsGateway.notifyOrderUpdated({ id: 'route_deleted' });

    return { success: true };
  }
}
