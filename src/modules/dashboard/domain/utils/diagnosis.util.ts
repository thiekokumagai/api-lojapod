// Regras do "Diagnóstico": transforma números da loja numa lista de vazamentos
// ordenada por gravidade e por quanto cada um custou em R$ no período.
// Tudo aqui é função pura (sem banco) para ser testável.
// Os valores são estimativas gerenciais, não contabilidade.

export type DiagnosisSeverity = 'critical' | 'warning' | 'info' | 'ok';

export interface DiagnosisItem {
  id: string;
  severity: DiagnosisSeverity;
  title: string;
  detail: string;
  /** Quanto custou (ou pode custar) no período, em R$. null = sem valor em R$. */
  amount: number | null;
  /** true quando o valor é uma estimativa/potencial, não algo já perdido. */
  estimated: boolean;
  actionLabel?: string;
  actionUrl?: string;
}

/** Limites fixos (em %). Ajustáveis no futuro; hoje são constantes. */
export const DIAGNOSIS_THRESHOLDS = {
  discountWarningPct: 8,
  discountCriticalPct: 15,
  cardFeeWarningPct: 3,
  cardFeeCriticalPct: 5,
  cancelWarningPct: 5,
  cancelCriticalPct: 10,
  freightCriticalPct: 3,
  minProductMarginPct: 10,
  lowConversionPct: 1,
} as const;

/** Custo fixo cadastrado vale por mês; períodos curtos usam a fração dos dias. */
const DAYS_IN_MONTH = 30;

const round2 = (n: number) => Math.round(n * 100) / 100;

export const formatBRL = (n: number) =>
  `R$ ${n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const pct = (part: number, total: number) =>
  total > 0 ? (part / total) * 100 : 0;

const fmtPct = (n: number) =>
  `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

/* ------------------------------ Custos fixos ------------------------------ */

export interface FixedCostInput {
  name: string;
  value: number;
  repeats: boolean;
  createdAt: Date;
}

export interface FixedCostsPeriod {
  total: number;
  /** Valor de cada custo dentro do período, do maior para o menor. */
  items: { name: string; value: number }[];
}

/**
 * Custo fixo que se repete: valor mensal × dias/30 (proporcional).
 * Custo avulso (não repete): entra inteiro só se foi cadastrado dentro do período.
 */
export function prorateFixedCosts(
  costs: FixedCostInput[],
  days: number,
  start: Date,
  end: Date,
): FixedCostsPeriod {
  const byName = new Map<string, number>();

  for (const cost of costs) {
    const value = Number(cost.value) || 0;
    let inPeriod = 0;
    if (cost.repeats) {
      inPeriod = (value * days) / DAYS_IN_MONTH;
    } else if (cost.createdAt >= start && cost.createdAt <= end) {
      inPeriod = value;
    }
    if (inPeriod > 0) {
      byName.set(cost.name, (byName.get(cost.name) ?? 0) + inPeriod);
    }
  }

  const items = Array.from(byName, ([name, value]) => ({
    name,
    value: round2(value),
  })).sort((a, b) => b.value - a.value);

  return {
    total: round2(items.reduce((sum, i) => sum + i.value, 0)),
    items,
  };
}

/* ---------------------------- Ponto de equilíbrio -------------------------- */

export interface BreakEven {
  /** Receita dos itens (após descontos) necessária para cobrir os custos fixos. */
  revenue: number | null;
  /** Pedidos necessários, na média de receita por pedido do período. */
  orders: number | null;
}

/**
 * Receita necessária = custos fixos / margem bruta (como fração, 0 a 1).
 * Sem margem positiva (ou sem custos cadastrados) não há como calcular: null.
 */
export function calculateBreakEven(input: {
  fixedCosts: number;
  marginRatio: number | null;
  netRevenuePerOrder: number | null;
}): BreakEven {
  const { fixedCosts, marginRatio, netRevenuePerOrder } = input;
  if (marginRatio === null || marginRatio <= 0) {
    return { revenue: null, orders: null };
  }
  const revenue = round2(fixedCosts / marginRatio);
  const orders =
    netRevenuePerOrder && netRevenuePerOrder > 0
      ? Math.ceil(revenue / netRevenuePerOrder)
      : null;
  return { revenue, orders };
}

/* -------------------------------- Vazamentos ------------------------------- */

export interface DiagnosisInput {
  receitaItens: number;
  resultado: {
    lucroBruto: number;
    custosFixos: number;
    lucroLiquido: number;
    breakEvenRevenue: number | null;
  };
  descontos: {
    total: number;
    topCoupon: { title: string; amount: number; orders: number } | null;
  };
  cardFee: {
    total: number;
    byMethod: { method: string; amount: number }[];
  };
  freight: { loss: number; ordersWithLoss: number; ordersChecked: number };
  abandoned: { count: number; amount: number };
  cancelled: { count: number; amount: number; validCount: number };
  stock: {
    stagnantCapital: number;
    stagnantCount: number;
    outOfStockCount: number;
  };
  conversion: { visitas: number; conversao: number };
  /** Produtos mais vendidos (com lucro/margem já calculados). */
  topProducts: {
    title: string;
    quantity: number;
    lucro: number | null;
    margem: number | null;
    receitaLiquida: number;
  }[];
  semCusto: { count: number; receitaLiquida: number };
}

const SEVERITY_ORDER: Record<DiagnosisSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  ok: 3,
};

export function sortDiagnosisItems(items: DiagnosisItem[]): DiagnosisItem[] {
  return [...items].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return (b.amount ?? -1) - (a.amount ?? -1);
  });
}

export function buildDiagnosisItems(input: DiagnosisInput): DiagnosisItem[] {
  const T = DIAGNOSIS_THRESHOLDS;
  const items: DiagnosisItem[] = [];

  // 1. Resultado do período (lucro líquido) / ponto de equilíbrio
  const { resultado } = input;
  if (resultado.custosFixos <= 0) {
    items.push({
      id: 'resultado',
      severity: 'info',
      title: 'Sem custos fixos cadastrados',
      detail:
        'Sem os custos fixos não dá para saber se a loja está no lucro ou no prejuízo. Cadastre aluguel, internet, salários etc.',
      amount: null,
      estimated: false,
      actionLabel: 'Cadastrar custos fixos',
      actionUrl: '/financeiro/custos-fixos',
    });
  } else if (resultado.lucroLiquido < 0) {
    const falta = round2(-resultado.lucroLiquido);
    const equilibrio =
      resultado.breakEvenRevenue !== null
        ? ` Para empatar, é preciso vender ${formatBRL(resultado.breakEvenRevenue)} em itens no período.`
        : '';
    items.push({
      id: 'resultado',
      severity: 'critical',
      title: 'Abaixo do ponto de equilíbrio',
      detail: `O lucro bruto (${formatBRL(resultado.lucroBruto)}) não cobre os custos fixos (${formatBRL(resultado.custosFixos)}).${equilibrio}`,
      amount: falta,
      estimated: true,
      actionLabel: 'Ver custos fixos',
      actionUrl: '/financeiro/custos-fixos',
    });
  } else {
    items.push({
      id: 'resultado',
      severity: 'ok',
      title: 'Acima do ponto de equilíbrio',
      detail: `Lucro líquido de ${formatBRL(resultado.lucroLiquido)} depois dos custos fixos.`,
      amount: null,
      estimated: true,
    });
  }

  // 2. Campeões de venda com margem baixa ou negativa
  const lowMargin = input.topProducts.filter(
    (p) => p.margem !== null && p.margem < T.minProductMarginPct,
  );
  if (lowMargin.length > 0) {
    // Quanto faltou de lucro para esses produtos chegarem à margem mínima
    const gap = lowMargin.reduce((sum, p) => {
      const target = (T.minProductMarginPct / 100) * p.receitaLiquida;
      return sum + Math.max(0, target - (p.lucro ?? 0));
    }, 0);
    const worst = lowMargin
      .map((p) => `${p.title} (${fmtPct(p.margem as number)})`)
      .join(', ');
    const hasLoss = lowMargin.some((p) => (p.margem as number) <= 0);
    items.push({
      id: 'margem-baixa',
      severity: hasLoss ? 'critical' : 'warning',
      title: `${lowMargin.length} ${lowMargin.length === 1 ? 'campeão de venda' : 'campeões de venda'} com margem abaixo de ${T.minProductMarginPct}%`,
      detail: `${worst}. Vendem bastante mas deixam pouco (ou negativo) de lucro. Valor = lucro que faltou para chegar a ${T.minProductMarginPct}% de margem.`,
      amount: round2(gap),
      estimated: true,
      actionLabel: 'Ajustar preços',
      actionUrl: '/produtos',
    });
  } else {
    items.push({
      id: 'margem-baixa',
      severity: 'ok',
      title: 'Margem dos mais vendidos',
      detail: `Nenhum dos mais vendidos com custo cadastrado tem margem abaixo de ${T.minProductMarginPct}%.`,
      amount: null,
      estimated: false,
    });
  }

  // 3. Descontos
  const discountPct = pct(input.descontos.total, input.receitaItens);
  const couponText = input.descontos.topCoupon
    ? ` O cupom que mais custou foi "${input.descontos.topCoupon.title}": ${formatBRL(input.descontos.topCoupon.amount)} em ${input.descontos.topCoupon.orders} ${input.descontos.topCoupon.orders === 1 ? 'pedido' : 'pedidos'}.`
    : '';
  items.push({
    id: 'descontos',
    severity:
      discountPct >= T.discountCriticalPct
        ? 'critical'
        : discountPct >= T.discountWarningPct
          ? 'warning'
          : 'ok',
    title: `Descontos = ${fmtPct(discountPct)} das vendas`,
    detail: `Cupons e descontos de pagamento e recibo somaram ${formatBRL(input.descontos.total)}.${couponText}`,
    amount: round2(input.descontos.total),
    estimated: false,
    actionLabel: 'Ver cupons',
    actionUrl: '/cupons',
  });

  // 4. Taxa de cartão
  const feePct = pct(input.cardFee.total, input.receitaItens);
  const topMethod = [...input.cardFee.byMethod].sort(
    (a, b) => b.amount - a.amount,
  )[0];
  items.push({
    id: 'taxa-cartao',
    severity:
      feePct >= T.cardFeeCriticalPct
        ? 'critical'
        : feePct >= T.cardFeeWarningPct
          ? 'warning'
          : 'ok',
    title: `Taxa de cartão = ${fmtPct(feePct)} das vendas`,
    detail: `${formatBRL(input.cardFee.total)} em taxas${topMethod ? `; a maior parte vem de ${topMethod.method} (${formatBRL(topMethod.amount)})` : ''}. Incentivar Pix reduz esse custo. A taxa só aparece depois que o pedido é recebido.`,
    amount: round2(input.cardFee.total),
    estimated: false,
  });

  // 5. Frete cobrado menor que o pago
  if (input.freight.ordersChecked > 0) {
    const freightPct = pct(input.freight.loss, input.receitaItens);
    items.push({
      id: 'frete',
      severity:
        input.freight.loss <= 0
          ? 'ok'
          : freightPct >= T.freightCriticalPct
            ? 'critical'
            : 'warning',
      title:
        input.freight.loss > 0
          ? 'Frete cobrado menor que o frete pago'
          : 'Frete cobrado cobre o frete pago',
      detail:
        input.freight.loss > 0
          ? `${input.freight.ordersWithLoss} de ${input.freight.ordersChecked} entregas com custo registrado (Uber ou motoboy) saíram mais caras do que o frete cobrado do cliente. Valor = soma da diferença.`
          : `${input.freight.ordersChecked} entregas com custo registrado, nenhuma no prejuízo.`,
      amount: input.freight.loss > 0 ? round2(input.freight.loss) : null,
      estimated: false,
      actionLabel: 'Rever taxa de entrega',
      actionUrl: '/configuracoes',
    });
  }

  // 6. Carrinhos abandonados com contato
  if (input.abandoned.count > 0) {
    items.push({
      id: 'carrinhos-abandonados',
      severity: 'warning',
      title: `${input.abandoned.count} ${input.abandoned.count === 1 ? 'carrinho abandonado' : 'carrinhos abandonados'} com contato`,
      detail:
        'Clientes que deixaram o telefone e ainda não foram chamados. Valor = soma dos carrinhos (potencial, não é perda certa).',
      amount: round2(input.abandoned.amount),
      estimated: true,
      actionLabel: 'Chamar no WhatsApp',
      actionUrl: '/carrinhos-abandonados',
    });
  }

  // 7. Cancelamentos
  const totalOrders = input.cancelled.count + input.cancelled.validCount;
  const cancelPct = pct(input.cancelled.count, totalOrders);
  items.push({
    id: 'cancelamentos',
    severity:
      cancelPct >= T.cancelCriticalPct
        ? 'critical'
        : cancelPct >= T.cancelWarningPct
          ? 'warning'
          : 'ok',
    title: `Cancelamentos = ${fmtPct(cancelPct)} dos pedidos`,
    detail: `${input.cancelled.count} ${input.cancelled.count === 1 ? 'pedido cancelado' : 'pedidos cancelados'}, somando ${formatBRL(input.cancelled.amount)}.`,
    amount: input.cancelled.count > 0 ? round2(input.cancelled.amount) : null,
    estimated: false,
    actionLabel: 'Ver pedidos',
    actionUrl: '/pedidos',
  });

  // 8. Estoque: capital parado e produtos zerados
  if (input.stock.stagnantCapital > 0) {
    items.push({
      id: 'capital-parado',
      severity: 'warning',
      title: 'Capital parado em estoque sem giro',
      detail: `${input.stock.stagnantCount} ${input.stock.stagnantCount === 1 ? 'produto parado' : 'produtos parados'} há mais de 45 dias, a custo.`,
      amount: round2(input.stock.stagnantCapital),
      estimated: false,
      actionLabel: 'Fazer promoção',
      actionUrl: '/produtos?status=stagnant',
    });
  }
  if (input.stock.outOfStockCount > 0) {
    items.push({
      id: 'estoque-zerado',
      severity: 'warning',
      title: `${input.stock.outOfStockCount} ${input.stock.outOfStockCount === 1 ? 'produto zerado' : 'produtos zerados'}`,
      detail:
        'Produto sem estoque não vende. O valor da venda perdida não é calculado (não há registro de por quanto tempo ficou zerado).',
      amount: null,
      estimated: false,
      actionLabel: 'Repor estoque',
      actionUrl: '/produtos?status=out_of_stock',
    });
  }

  // 9. Conversão
  if (input.conversion.visitas > 0) {
    const low = input.conversion.conversao < T.lowConversionPct;
    items.push({
      id: 'conversao',
      severity: low ? 'warning' : 'ok',
      title: `Conversão de ${fmtPct(input.conversion.conversao)}`,
      detail: low
        ? `${input.conversion.visitas} visitas e poucos pedidos. Vale revisar preços, frete e fotos dos produtos mais vistos.`
        : `${input.conversion.visitas} visitas no período.`,
      amount: null,
      estimated: false,
    });
  }

  // 10. Produtos sem custo
  if (input.semCusto.count > 0) {
    items.push({
      id: 'sem-custo',
      severity: 'info',
      title: `${input.semCusto.count} ${input.semCusto.count === 1 ? 'produto vendido sem custo cadastrado' : 'produtos vendidos sem custo cadastrado'}`,
      detail: `O lucro desses produtos não entra na conta (${formatBRL(input.semCusto.receitaLiquida)} em vendas). Sem o custo, o diagnóstico fica incompleto.`,
      amount: round2(input.semCusto.receitaLiquida),
      estimated: false,
      actionLabel: 'Cadastrar custo',
      actionUrl: '/produtos',
    });
  }

  return sortDiagnosisItems(items);
}
