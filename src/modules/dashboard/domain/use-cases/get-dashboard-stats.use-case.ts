import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';

import {
  resolveDashboardPeriod,
  resolvePreviousPeriod,
} from '../utils/period.util';
import { buildSalesChart, withPreviousSales } from '../utils/sales-chart.util';
import {
  RankingSortBy,
  calculateOrderItemsProfit,
  resolveItemUnitCost,
} from '../utils/sales-profit.util';
import {
  addVariationSale,
  toVariationList,
  type VariationSale,
} from '../utils/variation-sales.util';

export interface DashboardStatsFilters {
  storeId?: string;
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  sortBy?: RankingSortBy;
  /** false = não calcula `comparacao` (consulta extra). Padrão: true. */
  withComparison?: boolean;
  /** Quantos produtos o ranking devolve (1 a RANKING_MAX_LIMIT). Padrão: 5. */
  limit?: number;
}

export const RANKING_DEFAULT_LIMIT = 5;
export const RANKING_MAX_LIMIT = 100;
const MISSING_COST_LIST_LIMIT = 20;

interface RankingEntry {
  id: string;
  title: string;
  categoryTitle: string;
  quantity: number;
  totalRevenue: number;
  imageUrl?: string;
  /** Receita líquida (após descontos) só das vendas com custo; base da margem. */
  costedNetRevenue: number;
  profit: number;
  hasCostedSales: boolean;
  missingCost: boolean;
  /** Quantidade e faturamento por variação (texto gravado no item do pedido). */
  variations: Map<string, VariationSale>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const marginOf = (profit: number, base: number) =>
  base > 0 ? Number(((profit / base) * 100).toFixed(1)) : null;

function toRankingItem(e: RankingEntry) {
  return {
    id: e.id,
    title: e.title,
    categoryTitle: e.categoryTitle,
    quantity: e.quantity,
    totalRevenue: round2(e.totalRevenue),
    // Receita líquida (após descontos) das vendas com custo; base da margem.
    receitaLiquida: round2(e.costedNetRevenue),
    imageUrl: e.imageUrl,
    // lucro/margem null = nenhuma venda com custo cadastrado (não é 100%).
    lucro: e.hasCostedSales ? round2(e.profit) : null,
    margem: e.hasCostedSales ? marginOf(e.profit, e.costedNetRevenue) : null,
    semCusto: e.missingCost,
    // Só vem quando o produto vendeu com variação; soma bate com quantity/totalRevenue.
    variacoes: toVariationList(e.variations),
  };
}

function rankingValue(
  e: ReturnType<typeof toRankingItem>,
  sortBy: RankingSortBy,
): number | null {
  switch (sortBy) {
    case 'revenue':
      return e.totalRevenue;
    case 'profit':
      return e.lucro;
    case 'margin':
      return e.margem;
    default:
      return e.quantity;
  }
}

@Injectable()
export class GetDashboardStatsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(filters: DashboardStatsFilters) {
    // Sem loja o filtro some e os números somariam todas as lojas.
    if (!filters.storeId) {
      throw new ForbiddenException(
        'Usuário sem loja vinculada não pode consultar o dashboard.',
      );
    }

    const { start, end } = resolveDashboardPeriod(
      filters.startDate,
      filters.endDate,
    );

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
        items: {
          include: {
            product: {
              include: {
                images: {
                  orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
                  take: 1,
                },
                category: true,
              },
            },
            combo: { include: { category: true } },
          },
        },
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
    
    const allActiveProducts = await this.prisma.product.findMany({
      where: { ...baseProductWhere, isVisible: true },
      include: {
        items: true
      }
    });

    const produtosAtivos = allActiveProducts.length;

    let qtdTotalEstoque = 0;
    let custoProdAtivos = 0;
    let vendaTotalEstoque = 0;

    for (const prod of allActiveProducts) {
      const price = Number(prod.price || 0);
      const cost = Number(prod.costPrice || 0);
      
      let prodTotalStock = 0;
      if (prod.items && prod.items.length > 0) {
        prodTotalStock = prod.items.reduce((sum, item) => sum + (item.stock || 0), 0);
      }
      
      qtdTotalEstoque += prodTotalStock;
      custoProdAtivos += (cost * prodTotalStock);
      vendaTotalEstoque += (price * prodTotalStock);
    }
    
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

    // 4. Lucro bruto (cards) e ranking de produtos.
    // Cards: todas as vendas do período. Ranking: respeita categoryId.
    let totalDescontos = 0;
    let totalTaxaCartao = 0;
    let receitaItens = 0;
    let custoTotal = 0;
    let lucroBruto = 0;
    let receitaComCusto = 0;
    let receitaSemCusto = 0;
    const semCustoMap = new Map<string, string>();
    const productSalesMap = new Map<string, RankingEntry>();
    const chartOrders: { createdAt: Date; vendas: number; lucro: number }[] = [];

    for (const order of orders) {
      const items = order.items ?? [];
      let orderLucro = 0;
      const profits = calculateOrderItemsProfit({
        discounts:
          Number(order.couponDiscount || 0) +
          Number(order.paymentDiscount || 0) +
          Number(order.receiptDiscount || 0),
        cardFee: Number(order.cardFee || 0),
        items: items.map((item) => ({
          price: Number(item.price),
          quantity: item.quantity,
          unitCost: resolveItemUnitCost(item),
        })),
      });

      items.forEach((item, idx) => {
        const calc = profits[idx];
        const isCombo = item.isCombo || !!item.comboId;
        const itemId =
          (isCombo ? item.comboId : item.productId) ||
          item.productId ||
          item.productName ||
          'removed';
        const title =
          item.productName ||
          (isCombo ? item.combo?.name : item.product?.title) ||
          'Produto Removido';

        totalDescontos += calc.discount;
        receitaItens += calc.revenue;
        if (calc.profit === null || calc.cost === null) {
          receitaSemCusto += calc.netRevenue;
          semCustoMap.set(itemId, title);
        } else {
          totalTaxaCartao += calc.cardFee;
          custoTotal += calc.cost;
          lucroBruto += calc.profit;
          orderLucro += calc.profit;
          receitaComCusto += calc.netRevenue;
        }

        const inCategory =
          !filters.categoryId ||
          item.product?.categoryId === filters.categoryId ||
          item.combo?.categoryId === filters.categoryId;
        if (!inCategory) return;

        let entry = productSalesMap.get(itemId);
        if (!entry) {
          let mainImage: string | undefined = undefined;
          let categoryTitle = 'Sem Categoria';

          if (isCombo && item.combo) {
            mainImage = item.combo.imageUrl || undefined;
            categoryTitle = item.combo.category?.title || 'Sem Categoria';
          } else if (item.product) {
            mainImage = item.product.images?.[0]?.url;
            categoryTitle = item.product.category?.title || 'Sem Categoria';
          }

          entry = {
            id: itemId,
            title,
            categoryTitle,
            quantity: 0,
            totalRevenue: 0,
            imageUrl: mainImage,
            costedNetRevenue: 0,
            profit: 0,
            hasCostedSales: false,
            missingCost: false,
            variations: new Map(),
          };
          productSalesMap.set(itemId, entry);
        }

        entry.quantity += item.quantity;
        entry.totalRevenue += calc.revenue;
        // Combo não tem variação própria (as escolhas ficam nos itens do combo).
        addVariationSale(
          entry.variations,
          item.isCombo || item.comboId ? null : item.variation,
          item.quantity,
          calc.revenue,
        );
        if (calc.profit === null) {
          entry.missingCost = true;
        } else {
          entry.hasCostedSales = true;
          entry.profit += calc.profit;
          entry.costedNetRevenue += calc.netRevenue;
        }
      });

      chartOrders.push({
        createdAt: order.createdAt,
        vendas: Number(order.totalOrder),
        lucro: orderLucro,
      });
    }

    const sortBy = filters.sortBy ?? 'quantity';
    const rankingLimit = Math.min(
      RANKING_MAX_LIMIT,
      Math.max(1, Math.floor(filters.limit ?? RANKING_DEFAULT_LIMIT)),
    );
    const bestSellers = Array.from(productSalesMap.values())
      .map(toRankingItem)
      .sort((a, b) => {
        const va = rankingValue(a, sortBy);
        const vb = rankingValue(b, sortBy);
        // Sem valor (sem custo) vai para o fim nos critérios de lucro/margem.
        if (va === null && vb === null) return b.quantity - a.quantity;
        if (va === null) return 1;
        if (vb === null) return -1;
        return vb - va || b.quantity - a.quantity;
      })
      .slice(0, rankingLimit);

    const previous =
      filters.withComparison === false ? null : resolvePreviousPeriod(start, end);
    const previousPeriod = previous
      ? await this.summarizePeriod(filters.storeId, previous.start, previous.end)
      : null;
    const comparacao = previousPeriod?.summary ?? null;

    // Gráfico: faturamento e lucro de cada ponto, mais o faturamento do ponto
    // equivalente no período anterior (linha pontilhada na tela).
    const chartData = withPreviousSales(
      buildSalesChart(chartOrders, start, end),
      previous && previousPeriod
        ? buildSalesChart(previousPeriod.serie, previous.start, previous.end)
        : null,
    );

    return {
      // Mesmas métricas no período anterior equivalente (ver resolvePreviousPeriod).
      comparacao,
      stats: {
        totalVendas,
        totalPedidos,
        ticketMedio,
        totalProdutosVendidos,
        produtosAtivos,
        produtosInativos,
        qtdTotalEstoque,
        custoProdAtivos,
        vendaTotalEstoque,
        visitas,
        conversao,
        tempoMedio,
        abandonos,
        // Lucro bruto = itens - descontos - custo - taxa de cartão. Frete fora.
        // Considera só os itens com custo cadastrado (ver semCusto).
        lucroBruto: round2(lucroBruto),
        margemBruta: marginOf(lucroBruto, receitaComCusto),
        custoProdutosVendidos: round2(custoTotal),
        descontosConcedidos: round2(totalDescontos),
        taxaCartao: round2(totalTaxaCartao),
        receitaItens: round2(receitaItens),
        receitaComCusto: round2(receitaComCusto),
      },
      semCusto: {
        count: semCustoMap.size,
        receitaLiquida: round2(receitaSemCusto),
        produtos: Array.from(semCustoMap, ([id, title]) => ({ id, title })).slice(
          0,
          MISSING_COST_LIST_LIMIT,
        ),
      },
      chartData,
      bestSellers,
    };
  }

  /**
   * KPIs de vendas e comportamento de um período, para comparação. Mesmas regras dos
   * cards (CANCELLED fora, lucro só de itens com custo), sem ranking nem estoque.
   */
  private async summarizePeriod(storeId: string, start: Date, end: Date) {
    const [orders, sessions] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          storeId,
          createdAt: { gte: start, lte: end },
          status: { not: 'CANCELLED' },
        },
        select: {
          createdAt: true,
          totalOrder: true,
          couponDiscount: true,
          paymentDiscount: true,
          receiptDiscount: true,
          cardFee: true,
          items: {
            select: {
              price: true,
              quantity: true,
              isCombo: true,
              comboId: true,
              comboSnapshot: true,
              customizationSnapshot: true,
              weightKg: true,
              product: { select: { costPrice: true } },
            },
          },
        },
      }),
      this.prisma.storeSession.findMany({
        where: { storeId, createdAt: { gte: start, lte: end } },
        select: { sessionId: true },
      }),
    ]);

    let totalVendas = 0;
    let totalProdutosVendidos = 0;
    let lucroBruto = 0;
    let receitaComCusto = 0;
    const serie: { createdAt: Date; vendas: number; lucro: number }[] = [];

    for (const order of orders) {
      totalVendas += Number(order.totalOrder);
      const items = order.items ?? [];
      let orderLucro = 0;
      const profits = calculateOrderItemsProfit({
        discounts:
          Number(order.couponDiscount || 0) +
          Number(order.paymentDiscount || 0) +
          Number(order.receiptDiscount || 0),
        cardFee: Number(order.cardFee || 0),
        items: items.map((item) => ({
          price: Number(item.price),
          quantity: item.quantity,
          unitCost: resolveItemUnitCost(item),
        })),
      });
      items.forEach((item, idx) => {
        totalProdutosVendidos += item.quantity;
        const calc = profits[idx];
        if (calc.profit !== null && calc.cost !== null) {
          lucroBruto += calc.profit;
          orderLucro += calc.profit;
          receitaComCusto += calc.netRevenue;
        }
      });
      serie.push({
        createdAt: order.createdAt,
        vendas: Number(order.totalOrder),
        lucro: orderLucro,
      });
    }

    const totalPedidos = orders.length;
    const visitas = sessions.length;
    const abandonos =
      visitas === 0
        ? 0
        : await this.prisma.cartDraft.count({
            where: {
              sessionId: { in: sessions.map((s) => s.sessionId) },
              updatedAt: { gte: start, lte: end },
            },
          });

    const summary = {
      inicio: start.toISOString(),
      fim: end.toISOString(),
      totalVendas: round2(totalVendas),
      totalPedidos,
      ticketMedio: totalPedidos > 0 ? round2(totalVendas / totalPedidos) : 0,
      totalProdutosVendidos,
      lucroBruto: round2(lucroBruto),
      margemBruta: marginOf(lucroBruto, receitaComCusto),
      visitas,
      conversao:
        visitas > 0 ? Number(((totalPedidos / visitas) * 100).toFixed(1)) : 0,
      abandonos,
    };

    // `serie` só alimenta o gráfico; não vai na resposta.
    return { summary, serie };
  }
}
