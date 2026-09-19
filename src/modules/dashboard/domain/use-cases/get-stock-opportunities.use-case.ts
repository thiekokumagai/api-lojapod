import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { ComputeStockIntelligenceUseCase } from '../../../products/domain/use-cases/compute-stock-intelligence.use-case';

export interface OpportunityCard {
  id: string;
  type: 'trending_up' | 'trending_down' | 'low_margin' | 'stagnant' | 'high_potential';
  title: string;
  subtitle: string;
  badge: string;
  variant: 'success' | 'warning' | 'danger' | 'info' | 'purple';
  productId: string;
  productTitle: string;
  categoryName: string;
  metricLabel: string;
  metricValue: string;
  actionText: string;
  actionUrl: string;
}

export interface StockRiskKPIs {
  criticalCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  stagnantCount: number;
  stagnantCapital: number;
  totalActiveProducts: number;
  totalStockQuantity: number;
  totalStockCost: number;
}

export interface StockOpportunitiesResponse {
  kpis: StockRiskKPIs;
  criticalProducts: Array<{
    id: string;
    title: string;
    category: string;
    stock: number;
    minStock: number;
    coverageDays: number | null;
    dailyRunRate: number;
    costPrice: number;
    price: number;
  }>;
  stagnantProducts: Array<{
    id: string;
    title: string;
    category: string;
    stock: number;
    daysWithoutSales: number;
    costPrice: number;
    totalStagnantValue: number;
  }>;
  opportunities: OpportunityCard[];
}

export interface GetStockOpportunitiesFilters {
  storeId?: string;
}

@Injectable()
export class GetStockOpportunitiesUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly computeStockIntelligenceUseCase: ComputeStockIntelligenceUseCase,
  ) {}

  async execute(filters?: GetStockOpportunitiesFilters): Promise<StockOpportunitiesResponse> {
    const storeId = filters?.storeId;

    // 1. Se não houver dados pré-calculados para esta loja, calcula sob demanda
    const sample = await this.prisma.product.findFirst({
      where: {
        deletedAt: null,
        dailyRunRate: { not: null },
        ...(storeId ? { storeId } : {}),
      },
    });

    if (!sample) {
      await this.computeStockIntelligenceUseCase.execute({ storeId });
    }

    // 2. Buscar produtos da loja
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        ...(storeId ? { storeId } : {}),
      },
      include: {
        category: true,
        items: true,
      },
    });

    let criticalCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let stagnantCount = 0;
    let stagnantCapital = 0;
    let totalStockQuantity = 0;
    let totalStockCost = 0;

    const criticalList: Array<{
      id: string;
      title: string;
      category: string;
      stock: number;
      minStock: number;
      coverageDays: number | null;
      dailyRunRate: number;
      costPrice: number;
      price: number;
    }> = [];

    const stagnantList: Array<{
      id: string;
      title: string;
      category: string;
      stock: number;
      daysWithoutSales: number;
      costPrice: number;
      totalStagnantValue: number;
    }> = [];

    const opportunities: OpportunityCard[] = [];

    for (const prod of products) {
      const stock = prod.items.reduce((acc, item) => acc + item.stock, 0);
      const minStock = prod.minStock ?? 5;
      const cost = Number(prod.costPrice || 0);
      const price = Number(prod.promotionalPrice || prod.price || 0);
      const categoryName = prod.category?.title || 'Geral';
      const daysWithoutSales = prod.daysWithoutSales ?? 0;
      const dailyRunRate = prod.dailyRunRate ?? 0;
      const coverageDays = prod.coverageDays ?? null;
      const growth = prod.growthPercentage ?? 0;

      if (prod.isVisible) {
        totalStockQuantity += stock;
        totalStockCost += cost * stock;
      }

      const isCritical =
        stock > 0 && (stock <= minStock || (coverageDays !== null && coverageDays <= 3));

      if (stock === 0) {
        outOfStockCount++;
      } else if (isCritical) {
        criticalCount++;
        criticalList.push({
          id: prod.id,
          title: prod.title,
          category: categoryName,
          stock,
          minStock,
          coverageDays,
          dailyRunRate,
          costPrice: cost,
          price,
        });
      }

      if (stock > 0 && stock <= minStock) {
        lowStockCount++;
      }

      const stagnantValue = cost * stock;
      if (stock > 0 && daysWithoutSales >= 45) {
        stagnantCount++;
        stagnantCapital += stagnantValue;
        stagnantList.push({
          id: prod.id,
          title: prod.title,
          category: categoryName,
          stock,
          daysWithoutSales,
          costPrice: cost,
          totalStagnantValue: Number(stagnantValue.toFixed(2)),
        });
      }

      const margin = price > 0 ? ((price - cost) / price) * 100 : 0;

      // 1. Oportunidade Ouro: Alta saída + Alta margem
      if (dailyRunRate >= 0.5 && margin >= 35 && stock > 0) {
        opportunities.push({
          id: `gold-${prod.id}`,
          type: 'high_potential',
          title: `${prod.title} é uma oportunidade`,
          subtitle: `Alta saída (${(dailyRunRate * 30).toFixed(0)} un/mês) + margem saudável de ${margin.toFixed(0)}%.`,
          badge: `Alta saída + ${margin.toFixed(0)}% margem`,
          variant: 'purple',
          productId: prod.id,
          productTitle: prod.title,
          categoryName,
          metricLabel: 'Margem de Lucro',
          metricValue: `${margin.toFixed(1)}%`,
          actionText: 'Ver compras sugeridas',
          actionUrl: '/investimentos/analise-compras',
        });
      }
      // 2. Aceleração de Vendas: Crescimento > 25%
      else if (growth >= 25 && dailyRunRate > 0.2) {
        opportunities.push({
          id: `trend-up-${prod.id}`,
          type: 'trending_up',
          title: `${prod.title} está vendendo muito`,
          subtitle: `Você vendeu ${growth > 100 ? 'mais que o dobro' : `${growth}% a mais`} que no mês anterior.`,
          badge: `+${growth}% de crescimento`,
          variant: 'success',
          productId: prod.id,
          productTitle: prod.title,
          categoryName,
          metricLabel: 'Crescimento',
          metricValue: `+${growth}%`,
          actionText: 'Garantir reposição',
          actionUrl: '/investimentos/analise-compras',
        });
      }
      // 3. Queda de Vendas: Queda > 25%
      else if (growth <= -25 && (dailyRunRate > 0 || stock > 0)) {
        opportunities.push({
          id: `trend-down-${prod.id}`,
          type: 'trending_down',
          title: `${prod.title} perdeu vendas`,
          subtitle: `Caiu ${Math.abs(growth)}% nos últimos 30 dias. Avalie concorrentes ou preço.`,
          badge: `${growth}% últimos 30d`,
          variant: 'warning',
          productId: prod.id,
          productTitle: prod.title,
          categoryName,
          metricLabel: 'Queda',
          metricValue: `${growth}%`,
          actionText: 'Ver detalhes do produto',
          actionUrl: `/produtos?search=${encodeURIComponent(prod.title)}`,
        });
      }

      // 4. Margem Baixa: Preço com margem < 15%
      if (price > 0 && cost > 0 && margin < 15 && stock > 0) {
        opportunities.push({
          id: `margin-${prod.id}`,
          type: 'low_margin',
          title: `${prod.title} com margem baixa`,
          subtitle: `Margem atual: ${margin.toFixed(1)}%. Custo consome quase todo o faturamento.`,
          badge: `Margem: ${margin.toFixed(1)}%`,
          variant: 'danger',
          productId: prod.id,
          productTitle: prod.title,
          categoryName,
          metricLabel: 'Margem Atual',
          metricValue: `${margin.toFixed(1)}%`,
          actionText: 'Ajustar preço de venda',
          actionUrl: `/produtos?search=${encodeURIComponent(prod.title)}`,
        });
      }

      // 5. Produto Parado de Alto Valor
      if (stock > 0 && daysWithoutSales >= 60 && stagnantValue >= 300) {
        opportunities.push({
          id: `stagnant-${prod.id}`,
          type: 'stagnant',
          title: `${prod.title} está parado`,
          subtitle: `R$ ${stagnantValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} investidos e nenhuma venda há ${daysWithoutSales} dias.`,
          badge: `R$ ${stagnantValue.toFixed(0)} parado`,
          variant: 'info',
          productId: prod.id,
          productTitle: prod.title,
          categoryName,
          metricLabel: 'Dias Parado',
          metricValue: `${daysWithoutSales} dias`,
          actionText: 'Criar promoção / queima',
          actionUrl: `/produtos?search=${encodeURIComponent(prod.title)}`,
        });
      }
    }

    criticalList.sort((a, b) => (a.coverageDays ?? 999) - (b.coverageDays ?? 999));
    stagnantList.sort((a, b) => b.totalStagnantValue - a.totalStagnantValue);

    opportunities.sort((a, b) => {
      const priority = {
        high_potential: 1,
        trending_up: 2,
        stagnant: 3,
        low_margin: 4,
        trending_down: 5,
      };
      return priority[a.type] - priority[b.type];
    });

    return {
      kpis: {
        criticalCount,
        lowStockCount,
        outOfStockCount,
        stagnantCount,
        stagnantCapital: Number(stagnantCapital.toFixed(2)),
        totalActiveProducts: products.filter((p) => p.isVisible).length,
        totalStockQuantity,
        totalStockCost: Number(totalStockCost.toFixed(2)),
      },
      criticalProducts: criticalList.slice(0, 10),
      stagnantProducts: stagnantList.slice(0, 10),
      opportunities: opportunities.slice(0, 12),
    };
  }
}
