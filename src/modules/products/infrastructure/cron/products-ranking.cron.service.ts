import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class ProductsRankingCronService {
  private readonly logger = new Logger(ProductsRankingCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async updateBestSellers() {
    this.logger.log('Starting Best Sellers ranking update...');

    try {
      // 1. Zerar todos os flags
      await this.prisma.product.updateMany({
        data: { isBestSeller: false },
      });

      // 2. Definir período de 3 meses para trás
      const dataInicio = new Date();
      dataInicio.setMonth(dataInicio.getMonth() - 3);

      // 3. Buscar categorias configuradas para serem ignoradas no Best Seller
      const categoriasIgnore = await this.prisma.category.findMany({
        where: { excludeFromBestSeller: true },
      });
      const categoriasIgnoreIds = categoriasIgnore.map((c) => c.id);

      // 4. Buscar agrupamento de pedidos
      const groupedOrderItems = await this.prisma.orderItem.groupBy({
        by: ['productId'],
        _sum: {
          quantity: true,
        },
        where: {
          order: {
            createdAt: { gte: dataInicio },
            status: { not: 'CANCELLED' },
          },
          productId: { not: null },
        },
      });

      // 5. Buscar tendência recente (últimos 15 dias)
      const dataTendencia = new Date();
      dataTendencia.setDate(dataTendencia.getDate() - 15);
      const groupedRecentOrderItems = await this.prisma.orderItem.groupBy({
        by: ['productId'],
        _sum: { quantity: true },
        where: {
          order: {
            createdAt: { gte: dataTendencia },
            status: { not: 'CANCELLED' },
          },
          productId: { not: null },
        },
      });

      // 6. Buscar todos os produtos referenciados para descobrir a categoria
      const productIds = Array.from(new Set(groupedOrderItems.map(g => g.productId as string)));
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, categoryId: true },
      });

      const categoryWinners: Record<string, { productId: string; score: number }> = {};

      for (const group of groupedOrderItems) {
        const product = products.find(p => p.id === group.productId);
        if (!product) continue;

        const categoryId = product.categoryId;
        if (categoriasIgnoreIds.includes(categoryId)) {
          continue; // Pular se for da categoria ignorada
        }

        const quantitySold = group._sum.quantity || 0;
        let mediaMensal = quantitySold / 3;

        // Tendência recente
        const recentGroup = groupedRecentOrderItems.find(g => g.productId === group.productId);
        const recentSold = recentGroup?._sum?.quantity || 0;
        const mediaRecente = (recentSold / 15) * 30; // Projeção para 30 dias

        if (mediaRecente > mediaMensal) {
          mediaMensal = (mediaMensal + mediaRecente * 2) / 3;
        }

        // Determinar o vencedor da categoria
        if (!categoryWinners[categoryId] || mediaMensal > categoryWinners[categoryId].score) {
          categoryWinners[categoryId] = {
            productId: product.id,
            score: mediaMensal,
          };
        }
      }

      const topProductIds = Object.values(categoryWinners).map(w => w.productId);

      if (topProductIds.length > 0) {
        // 7. Atualizar os top produtos
        await this.prisma.product.updateMany({
          where: { id: { in: topProductIds } },
          data: { isBestSeller: true },
        });
      }

      this.logger.log(`Best Sellers update completed. ${topProductIds.length} products updated.`);
    } catch (error) {
      this.logger.error('Failed to update Best Sellers ranking', error);
    }
  }
}
