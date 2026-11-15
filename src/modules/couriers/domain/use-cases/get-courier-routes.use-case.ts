import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';

const MAX_IDS = 100;

/**
 * Resposta enxuta para o mapa de entregas: para cada lançamento de taxa pedido, o motoboy e os pedidos
 * (id, número e status) — sem o histórico inteiro do motoboy.
 */
@Injectable()
export class GetCourierRoutesUseCase {
  constructor(private prisma: PrismaService) {}

  async execute(rawIds: string[] | string | undefined, storeId?: string) {
    const list = Array.isArray(rawIds) ? rawIds : typeof rawIds === 'string' ? rawIds.split(',') : [];
    const ids = Array.from(new Set(list.map((id) => id.trim()).filter(Boolean))).slice(0, MAX_IDS);
    if (ids.length === 0) return [];

    const transactions = await this.prisma.courierTransaction.findMany({
      where: { id: { in: ids }, type: 'FEE', ...(storeId ? { storeId } : {}) },
      select: {
        id: true,
        amount: true,
        courier: { select: { id: true, name: true } },
        orders: { select: { id: true, orderNumber: true, status: true }, orderBy: { orderNumber: 'asc' } },
      },
    });

    return transactions.map((t) => ({
      id: t.id,
      amount: Number(t.amount),
      courierId: t.courier?.id ?? null,
      courierName: t.courier?.name ?? null,
      orders: t.orders,
    }));
  }
}
