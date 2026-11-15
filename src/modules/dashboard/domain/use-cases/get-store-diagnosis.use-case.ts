import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { ABANDONED_AFTER_MINUTES } from '../../../analytics/abandoned-carts.service';
import {
  buildDiagnosisItems,
  calculateBreakEven,
  prorateFixedCosts,
} from '../utils/diagnosis.util';
import { countPeriodDays, resolveDashboardPeriod } from '../utils/period.util';
import { GetDashboardStatsUseCase } from './get-dashboard-stats.use-case';
import { GetStockOpportunitiesUseCase } from './get-stock-opportunities.use-case';

export interface StoreDiagnosisFilters {
  storeId?: string;
  startDate?: string;
  endDate?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class GetStoreDiagnosisUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly getDashboardStats: GetDashboardStatsUseCase,
    private readonly getStockOpportunities: GetStockOpportunitiesUseCase,
  ) {}

  async execute(filters: StoreDiagnosisFilters) {
    // Sem loja o filtro some e os números somariam todas as lojas.
    if (!filters.storeId) {
      throw new ForbiddenException(
        'Usuário sem loja vinculada não pode consultar o diagnóstico.',
      );
    }
    const storeId = filters.storeId;
    const { start, end } = resolveDashboardPeriod(
      filters.startDate,
      filters.endDate,
    );
    const dias = countPeriodDays(start, end);

    const idleBefore = new Date(Date.now() - ABANDONED_AFTER_MINUTES * 60_000);
    const abandonedUntil = idleBefore < end ? idleBefore : end;

    const [stats, orders, cancelled, abandonedCarts, fixedCosts, stock] =
      await Promise.all([
        this.getDashboardStats.execute({
          storeId,
          startDate: filters.startDate,
          endDate: filters.endDate,
          sortBy: 'quantity',
          withComparison: false,
        }),
        this.prisma.order.findMany({
          where: {
            storeId,
            createdAt: { gte: start, lte: end },
            status: { not: 'CANCELLED' },
          },
          select: {
            couponDiscount: true,
            paymentDiscount: true,
            receiptDiscount: true,
            cardFee: true,
            paymentMethod: true,
            freight: true,
            couponFreightDiscount: true,
            uberDeliveryFee: true,
            coupon: { select: { title: true } },
            courierTransaction: {
              select: {
                type: true,
                amount: true,
                // Só pedidos não cancelados dividem o custo da rota
                _count: {
                  select: {
                    orders: { where: { status: { not: 'CANCELLED' } } },
                  },
                },
              },
            },
          },
        }),
        this.prisma.order.aggregate({
          where: {
            storeId,
            createdAt: { gte: start, lte: end },
            status: 'CANCELLED',
          },
          _count: { _all: true },
          _sum: { totalOrder: true },
        }),
        this.prisma.cartDraft.findMany({
          where: {
            storeId,
            customerPhone: { not: null },
            contactedAt: null,
            updatedAt: { gte: start, lte: abandonedUntil },
            session: { isConverted: false },
          },
          select: { totalAmount: true },
        }),
        this.prisma.fixedCost.findMany({ where: { storeId } }),
        this.getStockOpportunities.execute({ storeId }),
      ]);

    // Descontos, taxa de cartão, cupom que mais custou e frete: tudo dos pedidos válidos
    let descontos = 0;
    let cardFeeTotal = 0;
    const cardFeeByMethod = new Map<string, number>();
    const couponMap = new Map<string, { amount: number; orders: number }>();
    let freightLoss = 0;
    let freightOrdersWithLoss = 0;
    let freightOrdersChecked = 0;

    for (const order of orders) {
      const coupon = Number(order.couponDiscount || 0);
      descontos +=
        coupon +
        Number(order.paymentDiscount || 0) +
        Number(order.receiptDiscount || 0);

      const fee = Number(order.cardFee || 0);
      if (fee > 0) {
        cardFeeTotal += fee;
        cardFeeByMethod.set(
          order.paymentMethod,
          (cardFeeByMethod.get(order.paymentMethod) ?? 0) + fee,
        );
      }

      if (coupon > 0 && order.coupon?.title) {
        const cur = couponMap.get(order.coupon.title) ?? {
          amount: 0,
          orders: 0,
        };
        cur.amount += coupon;
        cur.orders += 1;
        couponMap.set(order.coupon.title, cur);
      }

      // Frete pago: Uber, ou motoboy (taxa do lote dividida entre os pedidos dele)
      const ct = order.courierTransaction;
      const courierShare =
        ct && ct.type === 'FEE' && ct._count.orders > 0
          ? Number(ct.amount) / ct._count.orders
          : null;
      const paid =
        order.uberDeliveryFee !== null && order.uberDeliveryFee !== undefined
          ? Number(order.uberDeliveryFee)
          : courierShare;
      if (paid !== null) {
        freightOrdersChecked += 1;
        const charged = Math.max(
          0,
          Number(order.freight || 0) - Number(order.couponFreightDiscount || 0),
        );
        if (paid > charged) {
          freightLoss += paid - charged;
          freightOrdersWithLoss += 1;
        }
      }
    }

    const topCouponEntry = Array.from(couponMap).sort(
      (a, b) => b[1].amount - a[1].amount,
    )[0];

    // Resultado: lucro bruto (já líquido de descontos e taxa) menos custos fixos do período
    const fixed = prorateFixedCosts(
      fixedCosts.map((c) => ({
        name: c.name,
        value: Number(c.value),
        repeats: c.repeats,
        createdAt: c.createdAt,
      })),
      dias,
      start,
      end,
    );
    const lucroBruto = stats.stats.lucroBruto;
    const lucroLiquido = round2(lucroBruto - fixed.total);
    const receitaLiquidaItens =
      stats.stats.receitaItens - stats.stats.descontosConcedidos;
    const breakEven = calculateBreakEven({
      fixedCosts: fixed.total,
      marginRatio:
        stats.stats.margemBruta !== null ? stats.stats.margemBruta / 100 : null,
      netRevenuePerOrder:
        stats.stats.totalPedidos > 0
          ? receitaLiquidaItens / stats.stats.totalPedidos
          : null,
    });

    const itens = buildDiagnosisItems({
      receitaItens: stats.stats.receitaItens,
      resultado: {
        lucroBruto,
        custosFixos: fixed.total,
        lucroLiquido,
        breakEvenRevenue: breakEven.revenue,
      },
      descontos: {
        total: descontos,
        topCoupon: topCouponEntry
          ? {
              title: topCouponEntry[0],
              amount: topCouponEntry[1].amount,
              orders: topCouponEntry[1].orders,
            }
          : null,
      },
      cardFee: {
        total: cardFeeTotal,
        byMethod: Array.from(cardFeeByMethod, ([method, amount]) => ({
          method,
          amount,
        })),
      },
      freight: {
        loss: freightLoss,
        ordersWithLoss: freightOrdersWithLoss,
        ordersChecked: freightOrdersChecked,
      },
      abandoned: {
        count: abandonedCarts.length,
        amount: abandonedCarts.reduce(
          (sum, c) => sum + Number(c.totalAmount || 0),
          0,
        ),
      },
      cancelled: {
        count: cancelled._count._all,
        amount: Number(cancelled._sum.totalOrder || 0),
        validCount: orders.length,
      },
      stock: {
        stagnantCapital: stock.kpis.stagnantCapital,
        stagnantCount: stock.kpis.stagnantCount,
        outOfStockCount: stock.kpis.outOfStockCount,
      },
      conversion: {
        visitas: stats.stats.visitas,
        conversao: stats.stats.conversao,
      },
      topProducts: stats.bestSellers.map((b) => ({
        title: b.title,
        quantity: b.quantity,
        lucro: b.lucro,
        margem: b.margem,
        receitaLiquida: b.receitaLiquida,
      })),
      semCusto: {
        count: stats.semCusto.count,
        receitaLiquida: stats.semCusto.receitaLiquida,
      },
    });

    return {
      periodo: { dias },
      resultado: {
        lucroBruto,
        custosFixos: fixed.total,
        lucroLiquido,
        // Custo fixo cadastrado é mensal; o valor do período é proporcional (mensal × dias/30).
        custosFixosProporcionais: true,
        pontoEquilibrioReceita: breakEven.revenue,
        pontoEquilibrioPedidos: breakEven.orders,
        receitaLiquidaItens: round2(receitaLiquidaItens),
        pedidos: stats.stats.totalPedidos,
      },
      custosFixosPorItem: fixed.items,
      itens,
    };
  }
}
