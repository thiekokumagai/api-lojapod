import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';

export interface DashboardStatsFilters {
  storeId?: string;
  startDate?: string;
  endDate?: string;
  categoryId?: string;
}

@Injectable()
export class GetDashboardStatsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(filters: DashboardStatsFilters) {
    let start: Date;
    let end: Date;

    if (filters.startDate && filters.endDate) {
      start = new Date(filters.startDate);
      end = new Date(filters.endDate);
    } else {
      // Default to "Hoje" (Today) in local/server time
      const today = new Date();
      start = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        0,
        0,
        0,
        0,
      );
      end = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        23,
        59,
        59,
        999,
      );
    }

    // 1. Fetch Orders within range that are not CANCELLED
    const orders = await this.prisma.order.findMany({
      where: {
        ...(filters.storeId && { storeId: filters.storeId }),
        createdAt: {
          gte: start,
          lte: end,
        },
        status: {
          not: 'CANCELLED',
        },
      },
      include: {
        items: true,
      },
    });

    // 2. Compute Core KPIs
    let totalVendas = 0;
    const totalPedidos = orders.length;
    let totalProdutosVendidos = 0;

    for (const order of orders) {
      totalVendas += Number(order.totalOrder);
      if (order.items) {
        for (const item of order.items) {
          totalProdutosVendidos += item.quantity;
        }
      }
    }

    const ticketMedio = totalPedidos > 0 ? totalVendas / totalPedidos : 0;

    // 2.5 Count Active and Inactive Products
    const baseProductWhere = {
      ...(filters.storeId && { storeId: filters.storeId }),
      ...(filters.categoryId && { categoryId: filters.categoryId }),
      deletedAt: null
    };
    
    const produtosAtivos = await this.prisma.product.count({
      where: { ...baseProductWhere, isVisible: true },
    });
    
    const produtosInativos = await this.prisma.product.count({
      where: { ...baseProductWhere, isVisible: false },
    });

    // 2.6 Fetch Analytics (Behavior)
    const sessions = await this.prisma.storeSession.findMany({
      where: {
        ...(filters.storeId && { storeId: filters.storeId }),
        createdAt: {
          gte: start,
          lte: end,
        }
      }
    });

    const visitas = sessions.length;
    let tempoMedio = 0;
    if (visitas > 0) {
      const totalSeconds = sessions.reduce((sum, s) => sum + s.durationSeconds, 0);
      tempoMedio = Math.floor(totalSeconds / visitas / 60); // in minutes
    }
    
    // Simplistic conversion: total orders / total visitors
    let conversao = 0;
    if (visitas > 0) {
      conversao = Number(((totalPedidos / visitas) * 100).toFixed(1));
    }

    const abandonos = sessions.length === 0 ? 0 : await this.prisma.cartDraft.count({
      where: {
        sessionId: {
          in: sessions.map(s => s.sessionId),
        },
        updatedAt: {
          gte: start,
          lte: end,
        }
      }
    });

    // 3. Dynamic Chart Data based on time range
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    let chartData: { name: string; vendas: number }[] = [];

    // Local timezone for date string representation formatting
    const timeZone = 'America/Campo_Grande';

    if (diffDays <= 1) {
      // "Hoje" -> Group by Hour (24h)
      chartData = Array.from({ length: 24 }, (_, i) => ({
        name: `${String(i).padStart(2, '0')}h`,
        vendas: 0,
      }));

      const hourFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        hourCycle: 'h23',
      });

      for (const order of orders) {
        const localHour = parseInt(hourFormatter.format(order.createdAt), 10);
        if (localHour >= 0 && localHour < 24) {
          chartData[localHour].vendas += Number(order.totalOrder);
        }
      }
    } else if (diffDays <= 7) {
      // "7 dias" -> Group by Day of the week
      const dateMap = new Map<string, { name: string; vendas: number }>();

      const current = new Date(start);
      const endTimestamp = end.getTime();
      while (current.getTime() <= endTimestamp + 60000) {
        const dateStr = current.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          timeZone,
        });
        const rawWeekday = current.toLocaleDateString('pt-BR', {
          weekday: 'short',
          timeZone,
        });
        const cleanWeekday = rawWeekday.replace('.', '');
        const weekday =
          cleanWeekday.charAt(0).toUpperCase() + cleanWeekday.slice(1);
        const name = `${weekday} (${dateStr})`;

        dateMap.set(dateStr, { name, vendas: 0 });
        current.setDate(current.getDate() + 1);
      }

      for (const order of orders) {
        const dateStr = order.createdAt.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          timeZone,
        });
        const item = dateMap.get(dateStr);
        if (item) {
          item.vendas += Number(order.totalOrder);
        }
      }

      chartData = Array.from(dateMap.values());
    } else if (diffDays <= 31) {
      // "30 dias" -> Group by Days of Month
      const dateMap = new Map<string, { name: string; vendas: number }>();

      const current = new Date(start);
      const endTimestamp = end.getTime();
      while (current.getTime() <= endTimestamp + 60000) {
        const dateStr = current.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          timeZone,
        });
        dateMap.set(dateStr, { name: dateStr, vendas: 0 });
        current.setDate(current.getDate() + 1);
      }

      for (const order of orders) {
        const dateStr = order.createdAt.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          timeZone,
        });
        const item = dateMap.get(dateStr);
        if (item) {
          item.vendas += Number(order.totalOrder);
        }
      }

      chartData = Array.from(dateMap.values());
    } else {
      // "6 meses" / "Ano" -> Group by Month
      const monthMap = new Map<
        string,
        { name: string; vendas: number; sortKey: string }
      >();

      const yearFormatter = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        timeZone,
      });
      const monthFormatter = new Intl.DateTimeFormat('en-US', {
        month: '2-digit',
        timeZone,
      });

      const current = new Date(start);
      const endTimestamp = end.getTime();
      while (current.getTime() <= endTimestamp + 60000) {
        const monthStr = current
          .toLocaleDateString('pt-BR', {
            month: 'short',
            year: '2-digit',
            timeZone,
          })
          .replace('.', '');
        const sortKey = `${yearFormatter.format(current)}-${monthFormatter.format(current)}`;
        if (!monthMap.has(sortKey)) {
          monthMap.set(sortKey, { name: monthStr, vendas: 0, sortKey });
        }
        current.setMonth(current.getMonth() + 1);
      }

      for (const order of orders) {
        const sortKey = `${yearFormatter.format(order.createdAt)}-${monthFormatter.format(order.createdAt)}`;
        const item = monthMap.get(sortKey);
        if (item) {
          item.vendas += Number(order.totalOrder);
        }
      }

      chartData = Array.from(monthMap.values())
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .map(({ name, vendas }) => ({ name, vendas }));
    }

    // 4. Best-Selling Products (Optionally filtered by categoryId)
    const orderItems = orders.length === 0 ? [] : await this.prisma.orderItem.findMany({
      where: {
        orderId: {
          in: orders.map(o => o.id),
        },
        ...(filters.categoryId && {
          product: {
            categoryId: filters.categoryId,
          },
        }),
      },
      include: {
        product: {
          include: {
            images: true,
            category: true,
          },
        },
      },
    });

    const productSalesMap = new Map<
      string,
      {
        id: string;
        title: string;
        categoryTitle: string;
        quantity: number;
        totalRevenue: number;
        imageUrl?: string;
      }
    >();

    for (const item of orderItems) {
      const productId = item.productId || 'removed';
      const existing = productSalesMap.get(productId);
      const quantity = item.quantity;
      const revenue = Number(item.price) * quantity;

      if (existing) {
        existing.quantity += quantity;
        existing.totalRevenue += revenue;
      } else {
        const mainImage =
          item.product && item.product.images && item.product.images.length > 0
            ? item.product.images[0].url
            : undefined;

        productSalesMap.set(productId, {
          id: productId,
          title:
            item.productName || (item.product?.title ?? 'Produto Removido'),
          categoryTitle: item.product?.category?.title ?? 'Sem Categoria',
          quantity,
          totalRevenue: revenue,
          imageUrl: mainImage,
        });
      }
    }

    const bestSellers = Array.from(productSalesMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    return {
      stats: {
        totalVendas,
        totalPedidos,
        ticketMedio,
        totalProdutosVendidos,
        produtosAtivos,
        produtosInativos,
        visitas,
        conversao,
        tempoMedio,
        abandonos,
      },
      chartData,
      bestSellers,
    };
  }
}
