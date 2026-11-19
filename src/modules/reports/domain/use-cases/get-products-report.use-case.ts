import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { ReportFiltersDto } from '../../infrastructure/dtos/report-filters.dto';
import {
  IDLE_DAYS_DEFAULT,
  PRODUCTS_LIST_LIMIT,
  buildOrderWhere,
  resolveReportPeriod,
  matchesPaymentFilter,
  orderDiscounts,
  round2,
} from '../utils/report-orders.util';
import {
  expandOrderSales,
  marginPct,
  productSaleProfit,
} from '../utils/product-sales.util';

export interface ProductsReportInput extends ReportFiltersDto {
  storeId?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Até onde olhar para trás ao procurar a última venda de um produto dentro de um box. */
const COMBO_LAST_SALE_LOOKBACK_DAYS = 365;

interface ProductMeta {
  title: string;
  categoryId: string | null;
  categoryTitle: string;
  imageUrl?: string;
  stock: number;
  costPrice: number | null;
  price: number | null;
  deleted: boolean;
  createdAt: Date;
}

interface ProductAgg {
  id: string;
  title: string;
  avulsas: number;
  emCombos: number;
  receita: number;
  descontos: number;
  /** Receita líquida e lucro só das vendas com custo; base da margem. */
  costedNet: number;
  profit: number;
  hasCosted: boolean;
  missingCost: boolean;
}

interface ComboAgg {
  id: string;
  title: string;
  quantidade: number;
  receita: number;
  costedNet: number;
  profit: number;
  hasCosted: boolean;
  missingCost: boolean;
  composicao: string | null;
}

/** "2x Café, 1x Filtro": como o box foi montado na venda mais recente lida. */
function describeComposition(snapshot: unknown): string | null {
  const items = (snapshot as { items?: { productName?: string; quantity?: number }[] })
    ?.items;
  if (!Array.isArray(items) || items.length === 0) return null;
  return items
    .map((c) => `${Number(c.quantity) || 1}x ${c.productName || 'Produto'}`)
    .join(', ');
}

@Injectable()
export class GetProductsReportUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: ProductsReportInput) {
    // Sem loja o filtro some e os números somariam todas as lojas.
    if (!input.storeId) {
      throw new ForbiddenException(
        'Usuário sem loja vinculada não pode consultar relatórios.',
      );
    }
    const storeId = input.storeId;
    const { start, end } = resolveReportPeriod(input.startDate, input.endDate);
    const idleDays = input.idleDays ?? IDLE_DAYS_DEFAULT;

    const [products, rawOrders, combos] = await Promise.all([
      this.prisma.product.findMany({
        where: { storeId },
        select: {
          id: true,
          title: true,
          categoryId: true,
          costPrice: true,
          price: true,
          deletedAt: true,
          createdAt: true,
          category: { select: { title: true } },
          images: {
            orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
            take: 1,
            select: { url: true },
          },
          items: { select: { stock: true } },
        },
      }),
      this.prisma.order.findMany({
        where: buildOrderWhere(storeId, start, end, input),
        select: {
          couponDiscount: true,
          paymentDiscount: true,
          receiptDiscount: true,
          cardFee: true,
          paymentMethod: true,
          items: {
            select: {
              productId: true,
              productName: true,
              price: true,
              quantity: true,
              isCombo: true,
              comboId: true,
              comboSnapshot: true,
              product: { select: { costPrice: true } },
            },
          },
        },
      }),
      this.prisma.combo.findMany({
        where: { storeId },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          categoryId: true,
          category: { select: { title: true } },
        },
      }),
    ]);

    const metaById = new Map<string, ProductMeta>();
    for (const p of products) {
      metaById.set(p.id, {
        title: p.title,
        categoryId: p.categoryId,
        categoryTitle: p.category?.title ?? 'Sem categoria',
        imageUrl: p.images[0]?.url,
        stock: p.items.reduce((s, i) => s + (i.stock || 0), 0),
        costPrice: p.costPrice ? Number(p.costPrice) : null,
        price: p.price ? Number(p.price) : null,
        deleted: !!p.deletedAt,
        createdAt: p.createdAt,
      });
    }
    const comboMeta = new Map(combos.map((c) => [c.id, c]));

    const categoryFilter = input.categoryId;
    const productInCategory = (id: string | null) =>
      !categoryFilter || (id !== null && metaById.get(id)?.categoryId === categoryFilter);
    const comboInCategory = (id: string | null) =>
      !categoryFilter || (id !== null && comboMeta.get(id)?.categoryId === categoryFilter);

    // 1. Vende: abre cada pedido em unidades de produto e em linhas de box
    const productAgg = new Map<string, ProductAgg>();
    const comboAgg = new Map<string, ComboAgg>();

    for (const order of rawOrders.filter((o) =>
      matchesPaymentFilter(o.paymentMethod, input.paymentMethod),
    )) {
      const expanded = expandOrderSales({
        discounts: orderDiscounts(order),
        cardFee: Number(order.cardFee || 0),
        items: order.items.map((it) => ({
          productId: it.productId,
          productName: it.productName,
          price: Number(it.price),
          quantity: it.quantity,
          isCombo: it.isCombo,
          comboId: it.comboId,
          comboSnapshot: it.comboSnapshot,
          product: it.product,
        })),
      });

      for (const sale of expanded.products) {
        if (!productInCategory(sale.productId)) continue;
        const key = sale.productId ?? `nome:${sale.title}`;
        let agg = productAgg.get(key);
        if (!agg) {
          agg = {
            id: key,
            title: metaById.get(sale.productId ?? '')?.title ?? sale.title,
            avulsas: 0,
            emCombos: 0,
            receita: 0,
            descontos: 0,
            costedNet: 0,
            profit: 0,
            hasCosted: false,
            missingCost: false,
          };
          productAgg.set(key, agg);
        }
        if (sale.kind === 'DIRECT') agg.avulsas += sale.units;
        else agg.emCombos += sale.units;
        agg.receita += sale.revenue;
        agg.descontos += sale.discount;
        const profit = productSaleProfit(sale);
        if (profit === null) {
          agg.missingCost = true;
        } else {
          agg.hasCosted = true;
          agg.profit += profit;
          agg.costedNet += sale.revenue - sale.discount;
        }
      }

      for (const line of expanded.combos) {
        if (!comboInCategory(line.comboId)) continue;
        const key = line.comboId ?? `nome:${line.title}`;
        let agg = comboAgg.get(key);
        if (!agg) {
          agg = {
            id: key,
            title: comboMeta.get(line.comboId ?? '')?.name ?? line.title,
            quantidade: 0,
            receita: 0,
            costedNet: 0,
            profit: 0,
            hasCosted: false,
            missingCost: false,
            composicao: null,
          };
          comboAgg.set(key, agg);
        }
        agg.quantidade += line.quantity;
        agg.receita += line.revenue;
        if (line.profit === null) {
          agg.missingCost = true;
        } else {
          agg.hasCosted = true;
          agg.profit += line.profit;
          agg.costedNet += line.revenue - line.discount;
        }
      }
    }

    // Composição do box: vem do snapshot de qualquer venda dele no período
    for (const order of rawOrders) {
      for (const it of order.items) {
        const agg = it.comboId ? comboAgg.get(it.comboId) : undefined;
        if (agg && !agg.composicao) agg.composicao = describeComposition(it.comboSnapshot);
      }
    }

    const produtos = Array.from(productAgg.values())
      .map((a) => {
        const meta = metaById.get(a.id);
        const total = a.avulsas + a.emCombos;
        return {
          id: a.id,
          titulo: a.title,
          categoria: meta?.categoryTitle ?? 'Sem categoria',
          imagem: meta?.imageUrl,
          unidadesAvulsas: a.avulsas,
          unidadesEmCombos: a.emCombos,
          unidadesTotais: total,
          receita: round2(a.receita),
          receitaLiquida: round2(a.costedNet),
          lucro: a.hasCosted ? round2(a.profit) : null,
          margem: a.hasCosted ? marginPct(a.profit, a.costedNet) : null,
          semCusto: a.missingCost,
          estoque: meta?.stock ?? null,
        };
      })
      .sort((a, b) => b.unidadesTotais - a.unidadesTotais || b.receita - a.receita)
      .slice(0, PRODUCTS_LIST_LIMIT);

    const boxes = Array.from(comboAgg.values())
      .map((a) => {
        const meta = comboMeta.get(a.id);
        return {
          id: a.id,
          titulo: a.title,
          categoria: meta?.category?.title ?? 'Sem categoria',
          imagem: meta?.imageUrl ?? undefined,
          quantidade: a.quantidade,
          receita: round2(a.receita),
          receitaLiquida: round2(a.costedNet),
          lucro: a.hasCosted ? round2(a.profit) : null,
          margem: a.hasCosted ? marginPct(a.profit, a.costedNet) : null,
          semCusto: a.missingCost,
          composicao: a.composicao,
        };
      })
      .sort((a, b) => b.quantidade - a.quantidade || b.receita - a.receita);

    const allRows = Array.from(productAgg.values());
    const unidadesAvulsas = allRows.reduce((s, a) => s + a.avulsas, 0);
    const unidadesEmCombos = allRows.reduce((s, a) => s + a.emCombos, 0);
    const combosVendidos = boxes.reduce((s, b) => s + b.quantidade, 0);
    const lucroTotal = allRows.reduce((s, a) => s + (a.hasCosted ? a.profit : 0), 0);
    const liquidaComCusto = allRows.reduce((s, a) => s + a.costedNet, 0);

    const parados = await this.findIdleProducts(
      storeId,
      metaById,
      idleDays,
      categoryFilter,
    );

    return {
      periodo: { inicio: start.toISOString(), fim: end.toISOString() },
      resumo: {
        // Unidades reais de produto: avulsas + as que saíram dentro de boxes.
        unidadesTotais: unidadesAvulsas + unidadesEmCombos,
        unidadesAvulsas,
        unidadesEmCombos,
        combosVendidos,
        // Como o Dashboard conta hoje: cada box vale 1.
        itensContandoBoxComoUm: unidadesAvulsas + combosVendidos,
        produtosDistintos: allRows.length,
        receita: round2(allRows.reduce((s, a) => s + a.receita, 0)),
        lucro: round2(lucroTotal),
        margem: marginPct(lucroTotal, liquidaComCusto),
        produtosSemCusto: allRows.filter((a) => a.missingCost).length,
      },
      produtos,
      combos: boxes,
      listaTruncada: productAgg.size > PRODUCTS_LIST_LIMIT,
      parados,
    };
  }

  /**
   * Produtos com estoque que não venderam (avulsos nem dentro de box) nos últimos `idleDays` dias.
   * Independe do período do filtro: "parado" é uma situação de hoje.
   */
  private async findIdleProducts(
    storeId: string,
    metaById: Map<string, ProductMeta>,
    idleDays: number,
    categoryId?: string,
  ) {
    const now = Date.now();
    const windowStart = new Date(now - idleDays * DAY_MS);
    const validOrder = { storeId, status: { not: 'CANCELLED' as const } };

    const recent = await this.prisma.orderItem.findMany({
      where: { order: { ...validOrder, createdAt: { gte: windowStart } } },
      select: { productId: true, comboSnapshot: true },
    });
    const soldRecently = new Set<string>();
    for (const it of recent) {
      if (it.productId) soldRecently.add(it.productId);
      const comps = (it.comboSnapshot as { items?: { productId?: string }[] } | null)?.items;
      if (Array.isArray(comps)) {
        for (const c of comps) if (c.productId) soldRecently.add(c.productId);
      }
    }

    const candidates = Array.from(metaById.entries()).filter(
      ([id, m]) =>
        !m.deleted &&
        m.stock > 0 &&
        !soldRecently.has(id) &&
        (!categoryId || m.categoryId === categoryId),
    );

    const lastSale = new Map<string, Date>();
    if (candidates.length > 0) {
      const ids = candidates.map(([id]) => id);
      const direct = await this.prisma.orderItem.findMany({
        where: { productId: { in: ids }, order: validOrder },
        select: { productId: true, order: { select: { createdAt: true } } },
        orderBy: { order: { createdAt: 'desc' } },
        distinct: ['productId'],
      });
      for (const d of direct) {
        if (d.productId && d.order?.createdAt) lastSale.set(d.productId, d.order.createdAt);
      }

      // Vendas dentro de box também contam como venda do produto
      const wanted = new Set(ids);
      const viaCombo = await this.prisma.orderItem.findMany({
        where: {
          comboId: { not: null },
          order: {
            ...validOrder,
            createdAt: { gte: new Date(now - COMBO_LAST_SALE_LOOKBACK_DAYS * DAY_MS) },
          },
        },
        select: { comboSnapshot: true, order: { select: { createdAt: true } } },
        orderBy: { order: { createdAt: 'desc' } },
      });
      for (const it of viaCombo) {
        const comps = (it.comboSnapshot as { items?: { productId?: string }[] } | null)?.items;
        if (!Array.isArray(comps) || !it.order?.createdAt) continue;
        for (const c of comps) {
          if (!c.productId || !wanted.has(c.productId)) continue;
          const cur = lastSale.get(c.productId);
          if (!cur || cur < it.order.createdAt) lastSale.set(c.productId, it.order.createdAt);
        }
      }
    }

    const itens = candidates
      .map(([id, m]) => {
        const last = lastSale.get(id);
        const reference = last ?? m.createdAt;
        const capital = m.costPrice !== null ? m.costPrice * m.stock : null;
        return {
          id,
          titulo: m.title,
          categoria: m.categoryTitle,
          imagem: m.imageUrl,
          estoque: m.stock,
          preco: m.price,
          custoUnitario: m.costPrice,
          capitalParado: capital === null ? null : round2(capital),
          ultimaVenda: last ? last.toISOString() : null,
          nuncaVendeu: !last,
          diasSemVender: Math.max(0, Math.floor((now - reference.getTime()) / DAY_MS)),
        };
      })
      .sort(
        (a, b) =>
          (b.capitalParado ?? -1) - (a.capitalParado ?? -1) ||
          b.diasSemVender - a.diasSemVender,
      );

    return {
      diasSemVender: idleDays,
      quantidade: itens.length,
      capitalParado: round2(itens.reduce((s, i) => s + (i.capitalParado ?? 0), 0)),
      semCusto: itens.filter((i) => i.capitalParado === null).length,
      itens: itens.slice(0, PRODUCTS_LIST_LIMIT),
    };
  }
}
