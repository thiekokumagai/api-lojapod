import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  calculateBreakEven,
  prorateFixedCosts,
} from '../../../dashboard/domain/utils/diagnosis.util';
import {
  countPeriodDays,
} from '../../../dashboard/domain/utils/period.util';
import { buildSalesChart } from '../../../dashboard/domain/utils/sales-chart.util';
import {
  calculateOrderItemsProfit,
  resolveItemUnitCost,
} from '../../../dashboard/domain/utils/sales-profit.util';
import { formatPaymentMethodLabel } from '../../../orders/domain/utils/payment-method-label';
import { ReportFiltersDto } from '../../infrastructure/dtos/report-filters.dto';
import {
  buildOrderWhere,
  resolveReportPeriod,
  matchesPaymentFilter,
  orderDiscounts,
  pct,
  round2,
} from '../utils/report-orders.util';

export interface FinancialReportInput extends ReportFiltersDto {
  storeId?: string;
}

@Injectable()
export class GetFinancialReportUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: FinancialReportInput) {
    // Sem loja o filtro some e os números somariam todas as lojas.
    if (!input.storeId) {
      throw new ForbiddenException(
        'Usuário sem loja vinculada não pode consultar relatórios.',
      );
    }
    const storeId = input.storeId;
    const { start, end } = resolveReportPeriod(input.startDate, input.endDate);
    const dias = countPeriodDays(start, end);

    const [rawOrders, fixedCosts, cashTransactions, cancelados] =
      await Promise.all([
        this.prisma.order.findMany({
          where: buildOrderWhere(storeId, start, end, input),
          select: {
            createdAt: true,
            totalOrder: true,
            freight: true,
            couponFreightDiscount: true,
            couponDiscount: true,
            paymentDiscount: true,
            receiptDiscount: true,
            cardFee: true,
            paymentMethod: true,
            paymentStatus: true,
            uberDeliveryFee: true,
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
            items: {
              select: {
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
        this.prisma.fixedCost.findMany({ where: { storeId } }),
        this.prisma.cashTransaction.findMany({
          where: { storeId, date: { gte: start, lte: end } },
          select: { type: true, category: true, amount: true },
        }),
        input.status
          ? Promise.resolve(null)
          : this.prisma.order.aggregate({
              where: {
                storeId,
                createdAt: { gte: start, lte: end },
                status: 'CANCELLED',
              },
              _count: { _all: true },
              _sum: { totalOrder: true },
            }),
      ]);

    const orders = rawOrders.filter((o) =>
      matchesPaymentFilter(o.paymentMethod, input.paymentMethod),
    );

    let receitaItens = 0;
    let descontos = 0;
    let taxaCartao = 0;
    let custoProdutos = 0;
    let lucroBruto = 0;
    let receitaComCusto = 0;
    let receitaSemCusto = 0;
    let freteCobrado = 0;
    let fretePago = 0;
    let pedidosComFretePago = 0;
    let faturamento = 0;
    let recebido = 0;
    let aReceber = 0;
    const porPagamento = new Map<
      string,
      { pedidos: number; valor: number; taxa: number }
    >();
    const chartOrders: { createdAt: Date; vendas: number; lucro: number }[] = [];

    for (const o of orders) {
      const total = Number(o.totalOrder);
      faturamento += total;
      if (o.paymentStatus === 'PAID') recebido += total;
      else aReceber += total;

      const fee = Number(o.cardFee || 0);
      taxaCartao += fee;
      const payLabel = formatPaymentMethodLabel(o.paymentMethod);
      const pay = porPagamento.get(payLabel) ?? { pedidos: 0, valor: 0, taxa: 0 };
      pay.pedidos += 1;
      pay.valor += total;
      pay.taxa += fee;
      porPagamento.set(payLabel, pay);

      freteCobrado += Math.max(
        0,
        Number(o.freight || 0) - Number(o.couponFreightDiscount || 0),
      );
      const ct = o.courierTransaction;
      const courierShare =
        ct && ct.type === 'FEE' && ct._count.orders > 0
          ? Number(ct.amount) / ct._count.orders
          : null;
      const paid =
        o.uberDeliveryFee !== null && o.uberDeliveryFee !== undefined
          ? Number(o.uberDeliveryFee)
          : courierShare;
      if (paid !== null) {
        fretePago += paid;
        pedidosComFretePago += 1;
      }

      // Mesma regra do Dashboard: lucro só dos itens com custo cadastrado
      const discounts = orderDiscounts(o);
      descontos += discounts;
      const profits = calculateOrderItemsProfit({
        discounts,
        cardFee: fee,
        items: o.items.map((it) => ({
          price: Number(it.price),
          quantity: it.quantity,
          unitCost: resolveItemUnitCost(it),
        })),
      });
      let orderLucro = 0;
      profits.forEach((calc) => {
        receitaItens += calc.revenue;
        if (calc.profit === null || calc.cost === null) {
          receitaSemCusto += calc.netRevenue;
        } else {
          custoProdutos += calc.cost;
          lucroBruto += calc.profit;
          orderLucro += calc.profit;
          receitaComCusto += calc.netRevenue;
        }
      });
      chartOrders.push({ createdAt: o.createdAt, vendas: total, lucro: orderLucro });
    }

    // Custo fixo cadastrado é mensal; no período entra proporcional (mensal × dias/30)
    const fixos = prorateFixedCosts(
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
    const lucroLiquido = round2(lucroBruto - fixos.total);
    const receitaLiquidaItens = receitaItens - descontos;
    const margemBruta =
      receitaComCusto > 0
        ? Number(((lucroBruto / receitaComCusto) * 100).toFixed(1))
        : null;
    const equilibrio = calculateBreakEven({
      fixedCosts: fixos.total,
      marginRatio: margemBruta !== null ? margemBruta / 100 : null,
      netRevenuePerOrder:
        orders.length > 0 ? receitaLiquidaItens / orders.length : null,
    });

    // Caixa: o que realmente entrou e saiu nos caixas do período
    let entradas = 0;
    let saidas = 0;
    const saidasPorCategoria = new Map<string, number>();
    for (const t of cashTransactions) {
      const amount = Number(t.amount);
      if (t.type === 'ENTRY') {
        entradas += amount;
      } else {
        saidas += amount;
        const cat = t.category || 'GENERAL';
        saidasPorCategoria.set(cat, (saidasPorCategoria.get(cat) ?? 0) + amount);
      }
    }

    return {
      periodo: {
        inicio: start.toISOString(),
        fim: end.toISOString(),
        dias,
      },
      resultado: {
        pedidos: orders.length,
        faturamento: round2(faturamento),
        receitaItens: round2(receitaItens),
        descontos: round2(descontos),
        receitaLiquidaItens: round2(receitaLiquidaItens),
        custoProdutos: round2(custoProdutos),
        taxaCartao: round2(taxaCartao),
        lucroBruto: round2(lucroBruto),
        margemBruta,
        custosFixos: fixos.total,
        // Custo fixo do período é proporcional (mensal × dias/30), não o que foi pago.
        custosFixosProporcionais: true,
        lucroLiquido,
        margemLiquida: pct(lucroLiquido, receitaComCusto),
        pontoEquilibrioReceita: equilibrio.revenue,
        pontoEquilibrioPedidos: equilibrio.orders,
        receitaSemCusto: round2(receitaSemCusto),
      },
      custosFixosPorItem: fixos.items,
      // Frete é informativo: não entra no lucro (igual ao Dashboard)
      frete: {
        cobrado: round2(freteCobrado),
        pago: round2(fretePago),
        saldo: round2(freteCobrado - fretePago),
        pedidosComFretePago,
      },
      recebimentos: {
        recebido: round2(recebido),
        aReceber: round2(aReceber),
        cancelados: cancelados
          ? {
              pedidos: cancelados._count._all,
              valor: round2(Number(cancelados._sum.totalOrder || 0)),
            }
          : null,
      },
      porPagamento: Array.from(porPagamento, ([nome, v]) => ({
        nome,
        pedidos: v.pedidos,
        valor: round2(v.valor),
        taxaCartao: round2(v.taxa),
        percentual: pct(v.valor, faturamento),
      })).sort((a, b) => b.valor - a.valor),
      caixa: {
        entradas: round2(entradas),
        saidas: round2(saidas),
        saldo: round2(entradas - saidas),
        saidasPorCategoria: Array.from(saidasPorCategoria, ([categoria, valor]) => ({
          categoria,
          valor: round2(valor),
        })).sort((a, b) => b.valor - a.valor),
      },
      serie: buildSalesChart(chartOrders, start, end),
    };
  }
}
