import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  countPeriodDays,
  resolvePreviousPeriod,
} from '../../../dashboard/domain/utils/period.util';
import { buildSalesChart } from '../../../dashboard/domain/utils/sales-chart.util';
import { calculateOrderItemsProfit, resolveItemUnitCost } from '../../../dashboard/domain/utils/sales-profit.util';
import { formatPaymentMethodLabel } from '../../../orders/domain/utils/payment-method-label';
import { ReportFiltersDto } from '../../infrastructure/dtos/report-filters.dto';
import {
  ORDERS_LIST_LIMIT,
  buildOrderWhere,
  resolveReportPeriod,
  matchesPaymentFilter,
  orderDiscounts,
  pct,
  round2,
} from '../utils/report-orders.util';

export interface SalesReportInput extends ReportFiltersDto {
  storeId?: string;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  DISPATCHED: 'Saiu para entrega',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
};

const MODALITY_LABEL: Record<string, string> = {
  DELIVERY: 'Entrega',
  STORE_PICKUP: 'Retirada na loja',
};

interface Bucket {
  key: string;
  label: string;
  pedidos: number;
  valor: number;
}

function toBuckets(map: Map<string, Bucket>, total: number) {
  return Array.from(map.values())
    .sort((a, b) => b.valor - a.valor)
    .map((b) => ({
      chave: b.key,
      nome: b.label,
      pedidos: b.pedidos,
      valor: round2(b.valor),
      percentual: pct(b.valor, total),
    }));
}

function addToBucket(
  map: Map<string, Bucket>,
  key: string,
  label: string,
  valor: number,
) {
  const cur = map.get(key) ?? { key, label, pedidos: 0, valor: 0 };
  cur.pedidos += 1;
  cur.valor += valor;
  map.set(key, cur);
}

@Injectable()
export class GetSalesReportUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: SalesReportInput) {
    // Sem loja o filtro some e os números somariam todas as lojas.
    if (!input.storeId) {
      throw new ForbiddenException(
        'Usuário sem loja vinculada não pode consultar relatórios.',
      );
    }
    const storeId = input.storeId;
    const { start, end } = resolveReportPeriod(input.startDate, input.endDate);

    const orders = (
      await this.prisma.order.findMany({
        where: buildOrderWhere(storeId, start, end, input),
        orderBy: { createdAt: 'desc' },
        select: {
          orderNumber: true,
          createdAt: true,
          customerName: true,
          totalOrder: true,
          freight: true,
          couponFreightDiscount: true,
          couponDiscount: true,
          paymentDiscount: true,
          receiptDiscount: true,
          cardFee: true,
          paymentMethod: true,
          paymentStatus: true,
          status: true,
          deliveryModality: true,
          items: {
            select: {
              price: true,
              quantity: true,
              isCombo: true,
              comboId: true,
              comboSnapshot: true,
              customizationSnapshot: true,
              product: { select: { costPrice: true } },
            },
          },
        },
      })
    ).filter((o) => matchesPaymentFilter(o.paymentMethod, input.paymentMethod));

    let faturamento = 0;
    let itensVendidos = 0;
    let freteCobrado = 0;
    let descontos = 0;
    let taxaCartao = 0;
    let recebido = 0;
    let aReceber = 0;
    let pedidosPagos = 0;
    const byPayment = new Map<string, Bucket>();
    const byModality = new Map<string, Bucket>();
    const byStatus = new Map<string, Bucket>();
    const chartOrders: { createdAt: Date; vendas: number; lucro: number }[] = [];

    for (const o of orders) {
      const total = Number(o.totalOrder);
      faturamento += total;
      descontos += orderDiscounts(o);
      taxaCartao += Number(o.cardFee || 0);
      freteCobrado += Math.max(
        0,
        Number(o.freight || 0) - Number(o.couponFreightDiscount || 0),
      );
      if (o.paymentStatus === 'PAID') {
        recebido += total;
        pedidosPagos += 1;
      } else {
        aReceber += total;
      }

      const payLabel = formatPaymentMethodLabel(o.paymentMethod);
      addToBucket(byPayment, payLabel, payLabel, total);
      addToBucket(
        byModality,
        o.deliveryModality,
        MODALITY_LABEL[o.deliveryModality] ?? o.deliveryModality,
        total,
      );
      addToBucket(byStatus, o.status, STATUS_LABEL[o.status] ?? o.status, total);

      // Lucro do pedido só para o gráfico (mesma regra do Dashboard)
      const profits = calculateOrderItemsProfit({
        discounts: orderDiscounts(o),
        cardFee: Number(o.cardFee || 0),
        items: o.items.map((it) => ({
          price: Number(it.price),
          quantity: it.quantity,
          unitCost: resolveItemUnitCost(it),
        })),
      });
      let lucro = 0;
      o.items.forEach((it, idx) => {
        itensVendidos += it.quantity;
        lucro += profits[idx].profit ?? 0;
      });
      chartOrders.push({ createdAt: o.createdAt, vendas: total, lucro });
    }

    // Cancelados do período (fora dos totais), só quando o filtro não pede um status
    const cancelados = input.status
      ? null
      : await this.prisma.order.aggregate({
          where: {
            storeId,
            createdAt: { gte: start, lte: end },
            status: 'CANCELLED',
          },
          _count: { _all: true },
          _sum: { totalOrder: true },
        });

    // Período anterior equivalente (mesmo tamanho), para mostrar a variação
    const previous = resolvePreviousPeriod(start, end);
    let comparacao: {
      faturamento: number;
      pedidos: number;
      ticketMedio: number;
    } | null = null;
    if (previous) {
      const prevOrders = (
        await this.prisma.order.findMany({
          where: buildOrderWhere(storeId, previous.start, previous.end, input),
          select: { totalOrder: true, paymentMethod: true },
        })
      ).filter((o) => matchesPaymentFilter(o.paymentMethod, input.paymentMethod));
      const prevTotal = prevOrders.reduce((s, o) => s + Number(o.totalOrder), 0);
      comparacao = {
        faturamento: round2(prevTotal),
        pedidos: prevOrders.length,
        ticketMedio:
          prevOrders.length > 0 ? round2(prevTotal / prevOrders.length) : 0,
      };
    }

    const pedidos = orders.length;
    return {
      periodo: {
        inicio: start.toISOString(),
        fim: end.toISOString(),
        dias: countPeriodDays(start, end),
      },
      resumo: {
        pedidos,
        faturamento: round2(faturamento),
        ticketMedio: pedidos > 0 ? round2(faturamento / pedidos) : 0,
        itensVendidos,
        freteCobrado: round2(freteCobrado),
        descontos: round2(descontos),
        taxaCartao: round2(taxaCartao),
        pedidosPagos,
        recebido: round2(recebido),
        aReceber: round2(aReceber),
        cancelados: cancelados
          ? {
              pedidos: cancelados._count._all,
              valor: round2(Number(cancelados._sum.totalOrder || 0)),
            }
          : null,
      },
      comparacao,
      serie: buildSalesChart(chartOrders, start, end),
      porPagamento: toBuckets(byPayment, faturamento),
      porEntrega: toBuckets(byModality, faturamento),
      porStatus: toBuckets(byStatus, faturamento),
      pedidos: orders.slice(0, ORDERS_LIST_LIMIT).map((o) => ({
        numero: o.orderNumber,
        data: o.createdAt.toISOString(),
        cliente: o.customerName,
        total: round2(Number(o.totalOrder)),
        pagamento: formatPaymentMethodLabel(o.paymentMethod),
        statusPagamento: o.paymentStatus,
        status: o.status,
        entrega: MODALITY_LABEL[o.deliveryModality] ?? o.deliveryModality,
      })),
      listaTruncada: orders.length > ORDERS_LIST_LIMIT,
    };
  }
}
