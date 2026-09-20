import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { IOrdersRepository } from '../repositories/iorders.repository';
import { Order } from '../entities/order.entity';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { EventsGateway } from '../../../events/events.gateway';

@Injectable()
export class CancelOrderUseCase {
  constructor(
    private readonly ordersRepository: IOrdersRepository,
    private readonly eventsGateway: EventsGateway,
    private readonly prisma: PrismaService,
  ) {}

  async execute(id: string): Promise<Order> {
    const order = await this.ordersRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    try {
      const canceledOrder = await this.ordersRepository.cancelAndRestoreStock(id);
      
      // Notify client front to update catalog since stock changed
      this.eventsGateway.server.emit('products.refresh');
      this.eventsGateway.notifyOrderUpdated(canceledOrder);
      // Atualiza estado de alerta caso estoque tenha sido restabelecido
      try {
        const rawIds = (canceledOrder.items || []).map((i) => i.productId);
        const uniqueIds = Array.from(new Set(rawIds.filter(Boolean))) as string[];
        for (const prodId of uniqueIds) {
          const product = await this.prisma.product.findUnique({
            where: { id: prodId },
            include: { items: true },
          });
          if (!product) continue;
          const totalStock = product.items.reduce((acc, item) => acc + item.stock, 0);
          const minStock = product.minStock ?? Math.max(3, Math.ceil((product.dailyRunRate ?? 0) * 7));
          if (totalStock > minStock && product.stockAlertState !== 'OK') {
            await this.prisma.product.update({
              where: { id: product.id },
              data: { stockAlertState: 'OK' },
            });
          }
        }
      } catch (err) {
        console.error('[CancelOrder] Erro ao restaurar estado de alerta:', err);
      }
      return canceledOrder;
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }
}
