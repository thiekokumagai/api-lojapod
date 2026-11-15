import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { EventsGateway } from '../../../events/events.gateway';
import { roundMoney } from '../utils/courier-fee';

const MAX_FEE = 100000;

/**
 * Ajusta o valor de uma taxa de rota (FEE). Só altera o valor: o vínculo com os pedidos e o saldo do motoboy
 * (que é a soma dos lançamentos) seguem a partir do novo valor.
 */
@Injectable()
export class AdjustCourierFeeUseCase {
  constructor(private prisma: PrismaService, private eventsGateway: EventsGateway) {}

  async execute(data: { transactionId: string; amount: number; storeId?: string }) {
    // Escrita só com loja vinculada: sem ela não dá para garantir que o lançamento é da loja de quem pede.
    if (!data.storeId) {
      throw new ForbiddenException('Usuário sem loja vinculada não pode ajustar a taxa do motoboy.');
    }
    const amount = Number(data.amount);
    if (data.amount === null || data.amount === undefined || !Number.isFinite(amount) || amount < 0 || amount > MAX_FEE) {
      throw new BadRequestException('Informe um valor válido para a taxa (zero ou mais).');
    }

    const transaction = await this.prisma.courierTransaction.findUnique({ where: { id: data.transactionId } });
    // Lançamento de outra loja (ou de loja não identificada) é tratado como inexistente.
    if (!transaction || transaction.storeId !== data.storeId) {
      throw new NotFoundException('Transação não encontrada');
    }
    if (transaction.type !== 'FEE') {
      throw new BadRequestException('Só é possível ajustar o valor de uma taxa de corrida.');
    }

    const updated = await this.prisma.courierTransaction.update({
      where: { id: transaction.id },
      data: { amount: roundMoney(amount) },
    });
    this.eventsGateway.notifyOrderUpdated({ id: 'route_updated' });
    return updated;
  }
}
