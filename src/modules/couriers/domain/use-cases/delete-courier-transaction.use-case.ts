import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { EventsGateway } from '../../../events/events.gateway';

// Pedido nesses status = o motoboy já saiu ou entregou: apagar a taxa tiraria o que ele já trabalhou.
const STARTED_STATUSES = ['DISPATCHED', 'COMPLETED'] as const;

@Injectable()
export class DeleteCourierTransactionUseCase {
  constructor(private prisma: PrismaService, private eventsGateway: EventsGateway) {}

  async execute(transactionId: string, storeId?: string) {
    const transaction = await this.prisma.courierTransaction.findUnique({
      where: { id: transactionId }
    });

    // Com loja identificada, lançamento de outra loja é tratado como inexistente.
    if (!transaction || (storeId && transaction.storeId !== storeId)) {
      throw new NotFoundException('Transação não encontrada');
    }

    // Taxa de rota que já tem pedido enviado ou entregue não pode ser excluída (o motoboy já saiu).
    if (transaction.type === 'FEE') {
      const startedOrders = await this.prisma.order.findMany({
        where: {
          courierTransactionId: transaction.id,
          status: { in: [...STARTED_STATUSES] },
        },
        select: { orderNumber: true },
        orderBy: { orderNumber: 'asc' },
      });
      if (startedOrders.length > 0) {
        const numbers = startedOrders.map((o) => `#${o.orderNumber}`).join(', ');
        throw new ConflictException(
          `Não é possível excluir esta rota: ela tem pedido já enviado ou entregue (${numbers}). ` +
            'Se um pedido foi cancelado, ajuste o valor da taxa em vez de excluir.',
        );
      }
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
    this.eventsGateway.notifyOrderUpdated({ id: 'route_deleted', storeId: transaction.storeId });

    return { success: true };
  }
}
