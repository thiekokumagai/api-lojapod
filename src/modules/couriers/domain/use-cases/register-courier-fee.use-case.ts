import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { EventsGateway } from '../../../events/events.gateway';

@Injectable()
export class RegisterCourierFeeUseCase {
  constructor(private prisma: PrismaService, private eventsGateway: EventsGateway) {}

  async execute(data: { courierId: string; amount: number; description: string; orderIds?: string[] }) {
    if (!data.courierId || !data.amount) {
      throw new Error('CourierId and amount are required');
    }
    
    const transaction = await this.prisma.courierTransaction.create({
      data: {
        courierId: data.courierId,
        type: 'FEE',
        amount: data.amount,
        description: data.description,
      }
    });

    if (data.orderIds && data.orderIds.length > 0) {
      await this.prisma.order.updateMany({
        where: {
          id: { in: data.orderIds }
        },
        data: {
          courierTransactionId: transaction.id
        }
      });
      this.eventsGateway.notifyOrderUpdated({ id: 'route_updated' });
    }

    return transaction;
  }
}
