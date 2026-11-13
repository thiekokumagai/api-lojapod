import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { IOrdersRepository } from '../../domain/repositories/iorders.repository';
import {
  AWAITING_ONLINE_PAYMENT_WHERE,
  UNPAID_ONLINE_CARD_TIMEOUT_MINUTES,
} from '../../domain/utils/awaiting-online-payment';
import { EventsGateway } from '../../../events/events.gateway';

/**
 * Cancela pedidos de cartão online que não foram pagos dentro do prazo e devolve o estoque.
 * O pedido aparece no painel desde a criação, então o cancelamento é avisado ao painel.
 */
@Injectable()
export class UnpaidOnlineOrdersCronService {
  private readonly logger = new Logger(UnpaidOnlineOrdersCronService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersRepository: IOrdersRepository,
    private readonly eventsGateway: EventsGateway,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cancelExpiredUnpaidOrders() {
    if (this.running) return;
    this.running = true;

    try {
      const cutoff = new Date(
        Date.now() - UNPAID_ONLINE_CARD_TIMEOUT_MINUTES * 60 * 1000,
      );
      const expired = await this.prisma.order.findMany({
        where: {
          ...AWAITING_ONLINE_PAYMENT_WHERE,
          status: { not: 'CANCELLED' },
          createdAt: { lt: cutoff },
        },
        select: { id: true, orderNumber: true },
        take: 100,
      });

      for (const order of expired) {
        try {
          // Confere de novo logo antes de cancelar, caso o pagamento tenha chegado agora
          const fresh = await this.prisma.order.findUnique({
            where: { id: order.id },
            select: { paymentStatus: true, status: true },
          });
          if (
            !fresh ||
            fresh.paymentStatus === 'PAID' ||
            fresh.status === 'CANCELLED'
          )
            continue;

          const cancelled = await this.ordersRepository.cancelAndRestoreStock(order.id);
          try {
            this.eventsGateway.notifyOrderUpdated(cancelled);
            this.eventsGateway.server?.emit('products.refresh');
          } catch (wsErr) {
            this.logger.error('Erro ao avisar painel do cancelamento automático:', wsErr);
          }
          this.logger.log(
            `Pedido #${order.orderNumber} cancelado: cartão online sem pagamento em ${UNPAID_ONLINE_CARD_TIMEOUT_MINUTES} min`,
          );
        } catch (err) {
          this.logger.error(
            `Erro ao cancelar pedido não pago #${order.orderNumber}:`,
            err,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        'Erro no cron de pedidos de cartão online não pagos:',
        err,
      );
    } finally {
      this.running = false;
    }
  }
}
