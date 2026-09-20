import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';

export interface ComputeStockIntelligenceOptions {
  storeId?: string;
}

@Injectable()
export class ComputeStockIntelligenceUseCase {
  private readonly logger = new Logger(ComputeStockIntelligenceUseCase.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(options?: ComputeStockIntelligenceOptions) {
    const storeId = options?.storeId;
    this.logger.log(
      `Iniciando cálculo de inteligência de estoque e saídas${storeId ? ` (Loja: ${storeId})` : ' (Global)'}...`,
    );

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const orderWhereLast30d: Record<string, unknown> = {
      createdAt: { gte: thirtyDaysAgo },
      status: { not: 'CANCELLED' },
      ...(storeId ? { storeId } : {}),
    };

    const orderWherePrev30d: Record<string, unknown> = {
      createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
      status: { not: 'CANCELLED' },
      ...(storeId ? { storeId } : {}),
    };

    // 1. Agrupar vendas dos últimos 30 dias
    const salesLast30d = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      _sum: { quantity: true },
      where: {
        order: orderWhereLast30d,
        productId: { not: null },
      },
    });

    const last30dMap = new Map<string, number>();
    for (const item of salesLast30d) {
      if (item.productId) {
        last30dMap.set(item.productId, item._sum.quantity || 0);
      }
    }

    // 2. Agrupar vendas do período anterior (31 a 60 dias atrás)
    const salesPrev30d = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      _sum: { quantity: true },
      where: {
        order: orderWherePrev30d,
        productId: { not: null },
      },
    });

    const prev30dMap = new Map<string, number>();
    for (const item of salesPrev30d) {
      if (item.productId) {
        prev30dMap.set(item.productId, item._sum.quantity || 0);
      }
    }

    // 3. Descobrir a data da última venda de cada produto
    const latestSales = await this.prisma.orderItem.findMany({
      where: {
        order: {
          status: { not: 'CANCELLED' },
          ...(storeId ? { storeId } : {}),
        },
        productId: { not: null },
      },
      select: {
        productId: true,
        order: { select: { createdAt: true } },
      },
      orderBy: { order: { createdAt: 'desc' } },
      distinct: ['productId'],
    });

    const lastSaleDateMap = new Map<string, Date>();
    for (const sale of latestSales) {
      if (sale.productId && sale.order?.createdAt) {
        lastSaleDateMap.set(sale.productId, sale.order.createdAt);
      }
    }

    // 4. Buscar produtos com itens de estoque
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        ...(storeId ? { storeId } : {}),
      },
      include: { items: true },
    });

    let criticalCount = 0;
    let outOfStockCount = 0;
    let stagnantCount = 0;
    let stagnantCapital = 0;

    const BATCH_SIZE = 50;
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (prod) => {
          const totalStock = prod.items.reduce((acc, item) => acc + item.stock, 0);
          const soldLast30 = last30dMap.get(prod.id) || 0;
          const soldPrev30 = prev30dMap.get(prod.id) || 0;

          const dailyRunRate = Number((soldLast30 / 30).toFixed(2));
          let coverageDays: number | null = null;
          if (dailyRunRate > 0) {
            coverageDays = Math.round(totalStock / dailyRunRate);
          } else if (totalStock > 0) {
            coverageDays = 999;
          } else {
            coverageDays = 0;
          }

          const lastSale = lastSaleDateMap.get(prod.id) || prod.createdAt;
          const daysWithoutSales = Math.max(
            0,
            Math.floor((now.getTime() - new Date(lastSale).getTime()) / (1000 * 60 * 60 * 24)),
          );

          let growthPercentage = 0;
          if (soldPrev30 > 0) {
            growthPercentage = Number((((soldLast30 - soldPrev30) / soldPrev30) * 100).toFixed(1));
          } else if (soldLast30 > 0) {
            growthPercentage = 100;
          }

          // Estoque mínimo: 7 dias de cobertura baseado na taxa de venda real (mínimo 3 unidades)
          const minStock = prod.minStock ?? Math.max(3, Math.ceil(dailyRunRate * 7));
          let stockAlertState = 'OK';

          if (totalStock === 0) {
            stockAlertState = 'OUT_OF_STOCK';
            outOfStockCount++;
          } else if (coverageDays !== null && coverageDays <= 3) {
            stockAlertState = 'CRITICAL';
            criticalCount++;
          } else if (totalStock <= minStock) {
            stockAlertState = 'LOW_STOCK';
          }

          if (daysWithoutSales >= 45 && totalStock > 0) {
            stagnantCount++;
            const cost = Number(prod.costPrice || 0);
            stagnantCapital += cost * totalStock;
          }

          await this.prisma.product.update({
            where: { id: prod.id },
            data: {
              dailyRunRate,
              coverageDays,
              daysWithoutSales,
              growthPercentage,
              stockAlertState,
            },
          });
        }),
      );
    }

    this.logger.log(
      `Cálculo concluído para ${products.length} produtos. Críticos: ${criticalCount}, Zerados: ${outOfStockCount}, Parados: ${stagnantCount} (R$ ${stagnantCapital.toFixed(2)})`,
    );

    return {
      totalProducts: products.length,
      criticalCount,
      outOfStockCount,
      stagnantCount,
      stagnantCapital: Number(stagnantCapital.toFixed(2)),
    };
  }
}
