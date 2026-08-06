import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { IFixedCostsRepository } from '../repositories/ifixed-costs.repository';

import { PrismaService } from '../../../../../prisma/prisma.service';
import { EventsGateway } from '../../../events/events.gateway';

@Injectable()
export class DeleteCashTransactionUseCase {
  constructor(
    private readonly repository: IFixedCostsRepository,
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async execute(id: string) {
    const transaction = await this.repository.findTransactionById(id);
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.cashRegisterId) {
      const activeCashRegister = await this.repository.findActiveCashRegister();
      if (
        !activeCashRegister ||
        activeCashRegister.id !== transaction.cashRegisterId
      ) {
        throw new BadRequestException(
          'Cannot delete transaction of a closed cash register',
        );
      }
    }

    if (transaction.category === 'MOTOBOY' && transaction.type === 'OUTFLOW') {
      const courierTxs = await this.prisma.courierTransaction.findMany({
        where: {
          type: 'PAYMENT',
          description: transaction.description,
        },
      });
      const courierTx = courierTxs.find(tx => Number(tx.amount) === Number(transaction.amount));
      if (courierTx) {
        await this.prisma.courierTransaction.delete({ where: { id: courierTx.id } });
        this.eventsGateway.notifyOrderUpdated({ id: 'route_deleted' });
      }
    }

    return this.repository.deleteTransaction(id);
  }
}
