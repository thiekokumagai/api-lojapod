import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class ProductsRankingCronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProductsRankingCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    this.updateBestSellers().catch((err) => {
      this.logger.error('Failed to run initial best sellers update on bootstrap', err);
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async updateBestSellers() {
    this.logger.log('Starting Best Sellers ranking update...');

    try {
      // 1. Zerar todos os flags de produtos e combos
      await Promise.all([
        this.prisma.product.updateMany({
          data: { isBestSeller: false },
        }),
        this.prisma.combo.updateMany({
          data: { isBestSeller: false },
        }),
      ]);

      // 2. Definir período de 3 meses para trás
      const dataInicio = new Date();
      dataInicio.setMonth(dataInicio.getMonth() - 3);

      // 3. Buscar categorias configuradas para serem ignoradas no Best Seller
      const categoriasIgnore = await this.prisma.category.findMany({
        where: { excludeFromBestSeller: true },
      });
      const categoriasIgnoreIds = categoriasIgnore.map((c) => c.id);

      // 4. Buscar agrupamento de pedidos de produtos
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

      // 5. Buscar tendência recente de produtos (últimos 15 dias)
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
      const productIds = Array.from(new Set(groupedOrderItems.map((g) => g.productId as string)));
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, categoryId: true },
      });

      const categoryWinners: Record<string, { productId: string; score: number }> = {};

      for (const group of groupedOrderItems) {
        const product = products.find((p) => p.id === group.productId);
        if (!product) continue;

        const categoryId = product.categoryId;
        if (categoriasIgnoreIds.includes(categoryId)) {
          continue; // Pular se for da categoria ignorada
        }

        const quantitySold = group._sum.quantity || 0;
        let mediaMensal = quantitySold / 3;

        // Tendência recente
        const recentGroup = groupedRecentOrderItems.find((g) => g.productId === group.productId);
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

      const topProductIds = Object.values(categoryWinners).map((w) => w.productId);

      if (topProductIds.length > 0) {
        // 7. Atualizar os top produtos
        await this.prisma.product.updateMany({
          where: { id: { in: topProductIds } },
          data: { isBestSeller: true },
        });
      }

      // ============================================
      // CÁLCULO DE MAIS VENDIDOS PARA COMBOS
      // ============================================
      const groupedComboOrderItems = await this.prisma.orderItem.groupBy({
        by: ['comboId'],
        _sum: {
          quantity: true,
        },
        where: {
          order: {
            createdAt: { gte: dataInicio },
            status: { not: 'CANCELLED' },
          },
          comboId: { not: null },
        },
      });

      const groupedRecentComboOrderItems = await this.prisma.orderItem.groupBy({
        by: ['comboId'],
        _sum: { quantity: true },
        where: {
          order: {
            createdAt: { gte: dataTendencia },
            status: { not: 'CANCELLED' },
          },
          comboId: { not: null },
        },
      });

      const comboIds = Array.from(new Set(groupedComboOrderItems.map((g) => g.comboId as string)));
      const combos = await this.prisma.combo.findMany({
        where: { id: { in: comboIds }, isActive: true },
        select: { id: true, categoryId: true },
      });

      const comboWinners: Record<string, { comboId: string; score: number }> = {};

      for (const group of groupedComboOrderItems) {
        const combo = combos.find((c) => c.id === group.comboId);
        if (!combo) continue;

        if (combo.categoryId && categoriasIgnoreIds.includes(combo.categoryId)) {
          continue;
        }

        const quantitySold = group._sum.quantity || 0;
        let mediaMensal = quantitySold / 3;

        const recentGroup = groupedRecentComboOrderItems.find((g) => g.comboId === group.comboId);
        const recentSold = recentGroup?._sum?.quantity || 0;
        const mediaRecente = (recentSold / 15) * 30;

        if (mediaRecente > mediaMensal) {
          mediaMensal = (mediaMensal + mediaRecente * 2) / 3;
        }

        const groupKey = combo.categoryId || '__combos_general__';
        if (!comboWinners[groupKey] || mediaMensal > comboWinners[groupKey].score) {
          comboWinners[groupKey] = {
            comboId: combo.id,
            score: mediaMensal,
          };
        }
      }

      const topComboIds = Object.values(comboWinners).map((w) => w.comboId);

      // Se nenhum combo pontuou pelos pedidos detalhados, verifica pelo totalSold acumulado
      if (topComboIds.length === 0) {
        const topComboByTotalSold = await this.prisma.combo.findFirst({
          where: {
            isActive: true,
            totalSold: { gt: 0 },
            ...(categoriasIgnoreIds.length > 0
              ? { OR: [{ categoryId: null }, { categoryId: { notIn: categoriasIgnoreIds } }] }
              : {}),
          },
          orderBy: { totalSold: 'desc' },
          select: { id: true },
        });

        if (topComboByTotalSold) {
          topComboIds.push(topComboByTotalSold.id);
        }
      }

      if (topComboIds.length > 0) {
        await this.prisma.combo.updateMany({
          where: { id: { in: topComboIds } },
          data: { isBestSeller: true },
        });
      }

      this.logger.log(
        `Best Sellers update completed. ${topProductIds.length} products and ${topComboIds.length} combos updated.`,
      );
    } catch (error) {
      this.logger.error('Failed to update Best Sellers ranking', error);
    }
  }
}
