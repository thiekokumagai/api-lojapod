import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';

interface AnalyzePurchaseRequest {
  meses?: number;
  categoria?: string;
  dias_cobertura?: number;
  valor?: number;
}

@Injectable()
export class AnalyzePurchaseUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(params: AnalyzePurchaseRequest) {
    const meses = params.meses && params.meses > 0 ? Number(params.meses) : 3;
    const diasCobertura = params.dias_cobertura && params.dias_cobertura > 0 ? Number(params.dias_cobertura) : 30;

    // 1. Calculate budget (orçamento)
    const entryTransactions = await this.prisma.investmentTransaction.aggregate({
      _sum: { amount: true },
      where: { type: 'ENTRY' },
    });
    const outflowTransactions = await this.prisma.investmentTransaction.aggregate({
      _sum: { amount: true },
      where: { type: 'OUTFLOW' },
    });

    const entryTotal = Number(entryTransactions._sum.amount || 0);
    const outflowTotal = Number(outflowTransactions._sum.amount || 0);
    
    let orcamentoDisponivel = 0;
    if (params.valor !== undefined && params.valor > 0) {
      orcamentoDisponivel = Number(params.valor);
    } else {
      orcamentoDisponivel = entryTotal - outflowTotal;
    }

    let categoriasFiltro: string[] = [];
    if (params.categoria) {
      categoriasFiltro = params.categoria.split(',').map(c => c.trim()).filter(Boolean);
    }

    if (orcamentoDisponivel <= 0) {
      return {
        periodo_analisado: `${meses} meses`,
        orcamento_disponivel: 0,
        total_itens: 0,
        valor_total_sugerido: 0,
        alerta: '⚠️ Orçamento zerado.',
        itens: [],
      };
    }

    // 2. Start date
    const dataInicio = new Date();
    dataInicio.setMonth(dataInicio.getMonth() - meses);

    // 3. Find grouped orders
    const groupedOrderItems = await this.prisma.orderItem.groupBy({
      by: ['productId', 'productItemId', 'variation'],
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

    // 3.1 Tendência recente (últimos 15 dias)
    const dataTendencia = new Date();
    dataTendencia.setDate(dataTendencia.getDate() - 15);
    const groupedRecentOrderItems = await this.prisma.orderItem.groupBy({
      by: ['productId', 'productItemId', 'variation'],
      _sum: { quantity: true },
      where: {
        order: {
          createdAt: { gte: dataTendencia },
          status: { not: 'CANCELLED' },
        },
        productId: { not: null },
      },
    });

    // 4. Fetch Products and current stock
    const productIds = Array.from(new Set(groupedOrderItems.map(g => g.productId as string)));
    
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        category: true,
        items: true,
      },
    });

    // Consolida agrupamentos pelo produto / variação única para evitar duplicidades
    interface ConsolidatedGroup {
      productId: string;
      productItemId?: string | null;
      variation?: string | null;
      quantitySold: number;
      recentSold: number;
    }

    const consolidatedMap = new Map<string, ConsolidatedGroup>();

    for (const group of groupedOrderItems) {
      if (!group.productId) continue;
      const product = products.find(p => p.id === group.productId);
      if (!product) continue;

      const hasMultipleItems = product.items && product.items.length > 1;
      const key = (hasMultipleItems && group.productItemId)
        ? `${group.productId}_${group.productItemId}`
        : group.productId;

      const recentGroup = groupedRecentOrderItems.find(
        g =>
          g.productId === group.productId &&
          g.productItemId === group.productItemId &&
          g.variation === group.variation,
      );
      const recentSold = recentGroup?._sum?.quantity || 0;

      const existing = consolidatedMap.get(key);
      if (existing) {
        existing.quantitySold += group._sum.quantity || 0;
        existing.recentSold += recentSold;
      } else {
        consolidatedMap.set(key, {
          productId: group.productId,
          productItemId: group.productItemId,
          variation: group.variation,
          quantitySold: group._sum.quantity || 0,
          recentSold,
        });
      }
    }

    const relatorio: Record<string, any>[] = [];

    for (const item of consolidatedMap.values()) {
      const product = products.find(p => p.id === item.productId);
      if (!product) continue;

      const category = product.category;
      const quantitySold = item.quantitySold;
      let currentStock = 0;

      if (item.productItemId) {
        const pItem = product.items.find(i => i.id === item.productItemId);
        if (pItem) currentStock = pItem.stock;
      } else {
        currentStock = product.items.reduce((acc, i) => acc + i.stock, 0);
      }

      const costPrice = Number(product.costPrice || 0);
      const salePrice = Number(product.promotionalPrice || product.price || 0);

      let description = product.title;
      let variation = item.variation || '';

      let mediaMensal = quantitySold / Math.max(meses, 1);
      const mediaRecente = (item.recentSold / 15) * 30;

      if (mediaRecente > mediaMensal) {
        mediaMensal = (mediaMensal + mediaRecente * 2) / 3;
      }

      const isCoil =
        category &&
        (category.title.toLowerCase().includes('resistência') ||
          category.title.toLowerCase().includes('coil'));
      if (isCoil) {
        mediaMensal *= 2;
        description = description
          .replace(/\b(Resistência\/Coilhead|Resistência\/Coil)\b/gi, '')
          .trim();
      }

      const isJuice =
        category &&
        (category.title.toLowerCase().includes('juice') ||
          category.title.toLowerCase().includes('pod'));
      if (isJuice) {
        description = description
          .replace(/\b(30ml|35\/50mg|35mg|50mg|20mg)\b/gi, '')
          .trim();
      }
      description = description.replace(/\s{2,}/g, ' ').trim();

      const estoqueDesejado = Math.ceil((mediaMensal / 30) * diasCobertura);
      const quantidadeSugerida = Math.max(0, estoqueDesejado - currentStock);
      const valorTotalSugerido = quantidadeSugerida * costPrice;

      const margem =
        salePrice > 0 ? ((salePrice - costPrice) / salePrice) * 100 : 0;

      let prioridade = 'baixa';
      if (mediaMensal >= 15 && margem >= 40) prioridade = 'alta';
      else if (mediaMensal >= 5 && margem >= 25) prioridade = 'media';

      relatorio.push({
        id_produto: product.id,
        descricao: description,
        variacao: variation,
        quantidade_vendida: quantitySold,
        valor_custo: costPrice,
        valor_venda: salePrice,
        estoque_atual: currentStock,
        media_mensal: Number(mediaMensal.toFixed(1)),
        tendencia_recente: Number(mediaRecente.toFixed(1)),
        cobertura_dias: diasCobertura,
        quantidade_sugerida: quantidadeSugerida,
        valor_total_sugerido: Number(valorTotalSugerido.toFixed(2)),
        margem_percentual: Number(margem.toFixed(1)),
        prioridade,
        id_categoria: category?.id || '',
        categoria: category?.title || '',
        external_id_categoria: category?.externalId || '',
      });
    }

    // 5. Filtra compra
    let relatorioCompras = relatorio.filter(p => p.quantidade_sugerida > 0);

    if (categoriasFiltro.length > 0) {
      relatorioCompras = relatorioCompras.filter(p => {
         return categoriasFiltro.includes(p.id_categoria) || categoriasFiltro.includes(p.external_id_categoria);
      });
    }

    // Ordenação
    relatorioCompras.sort((a, b) => {
      const ordem = { alta: 3, media: 2, baixa: 1 } as Record<string, number>;
      const cmp = ordem[b.prioridade] - ordem[a.prioridade];
      if (cmp === 0) {
        return b.quantidade_vendida - a.quantidade_vendida;
      }
      return cmp;
    });

    // 6. Orçamento
    let valorAcumulado = 0;
    const finalItems: Record<string, any>[] = [];

    for (const item of relatorioCompras) {
      if (valorAcumulado + item.valor_total_sugerido > orcamentoDisponivel) {
        break;
      }
      valorAcumulado += item.valor_total_sugerido;
      finalItems.push(item);
    }

    // 7. Retorno
    return {
      periodo_analisado: `${meses} meses`,
      orcamento_disponivel: Number(orcamentoDisponivel.toFixed(2)),
      total_itens: finalItems.length,
      valor_total_sugerido: Number(valorAcumulado.toFixed(2)),
      itens: finalItems,
    };
  }
}
