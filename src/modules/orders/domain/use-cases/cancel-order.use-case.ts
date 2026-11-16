import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { IOrdersRepository } from '../repositories/iorders.repository';
import { Order } from '../entities/order.entity';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { EventsGateway } from '../../../events/events.gateway';
import { LoyaltyService } from '../../../loyalty/domain/loyalty.service';
import { buildCancelImpact, loadOrderRoute, OrderRouteInfo } from '../../../couriers/domain/utils/courier-fee';

@Injectable()
export class CancelOrderUseCase {
  constructor(
    private readonly ordersRepository: IOrdersRepository,
    private readonly eventsGateway: EventsGateway,
    private readonly prisma: PrismaService,
    private readonly loyaltyService: LoyaltyService,
  ) {}

  async execute(
    id: string,
    currentUser?: { storeId?: string | null; role?: string } | null,
  ): Promise<Order> {
    const storeFilter =
      currentUser && currentUser.role !== 'SUPER_ADMIN'
        ? currentUser.storeId ?? '__NO_STORE__'
        : undefined;

    const order = await this.ordersRepository.findById(id, storeFilter);
    if (
      !order ||
      (currentUser &&
        currentUser.role !== 'SUPER_ADMIN' &&
        (!currentUser.storeId || order.storeId !== currentUser.storeId))
    ) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    // Rota do motoboy lida ANTES de cancelar: a parte do pedido na taxa depende de quantos pedidos ativos a rota tinha.
    let route: OrderRouteInfo | null = null;
    try {
      route = await loadOrderRoute(this.prisma, id);
    } catch (routeErr) {
      console.error('[CancelOrder] Erro ao ler a rota do motoboy do pedido:', routeErr);
    }

    try {
      const canceledOrder = await this.ordersRepository.cancelAndRestoreStock(id);

      // Reverte resgates ou pontuações de fidelidade vinculadas ao pedido cancelado
      try {
        await this.loyaltyService.revertOrderLoyalty(id);
      } catch (loyaltyErr) {
        console.error('[CancelOrder] Erro ao reverter fidelidade do pedido:', loyaltyErr);
      }
      
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
      // Depois do aviso por socket de propósito: o impacto vai só na resposta para o admin que cancelou.
      canceledOrder.courierImpact = buildCancelImpact(route);
      return canceledOrder;
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }
}
