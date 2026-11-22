import {
  Injectable,
  BadRequestException,
  Inject,
  Optional,
} from '@nestjs/common';
import { IOrdersRepository } from '../repositories/iorders.repository';
import { Order } from '../entities/order.entity';
import { ValidateCouponUseCase } from '../../../coupons/domain/use-cases/validate-coupon.use-case';
import type { ICouponsRepository } from '../../../coupons/domain/repositories/icoupons.repository';
import { PushNotificationService } from '../../../../shared/services/push-notification.service';
import { IUsersRepository } from '../../../users/domain/repositories/iusers.repository';
import { PrintGateway } from '../../../print/print.gateway';
import { EventsGateway } from '../../../events/events.gateway';
import { TenantContextService } from '../../../tenant/tenant-context.service';
import { ISettingsRepository } from '../../../settings/domain/repositories/isettings.repository';
import type { StoreSettings } from '../../../settings/domain/entities/store-settings.entity';
import { pixTerminalPaymentType } from '../utils/pix-terminal';
import {
  resetNonProductCustomization,
  resolveCustomizedAllowedPrices,
} from '../utils/order-customization';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { LoyaltyService } from '../../../loyalty/domain/loyalty.service';
import { PublicFreightService } from '../services/public-freight.service';
import {
  TOTAL_TOLERANCE,
  assertPublicOrderTotals,
  loyaltyDiscountCap,
  orderBumpAllowedPrices,
  orderBumpTriggerMet,
  orderBumpUsable,
  pixDiscountPercent,
  productAllowedPrices,
  round2,
  unitPriceMatches,
} from '../utils/public-order-rules';

@Injectable()
export class CreateOrderUseCase {
  constructor(
    private readonly ordersRepository: IOrdersRepository,
    private readonly validateCouponUseCase: ValidateCouponUseCase,
    @Inject('ICouponsRepository')
    private readonly couponsRepository: ICouponsRepository,
    private readonly pushNotificationService: PushNotificationService,
    private readonly usersRepository: IUsersRepository,
    private readonly printGateway: PrintGateway,
    private readonly eventsGateway: EventsGateway,
    private readonly tenantContextService: TenantContextService,
    private readonly settingsRepository: ISettingsRepository,
    private readonly prisma: PrismaService,
    private readonly loyaltyService: LoyaltyService,
    // Só o pedido da loja pública (`publicOrder`) usa; opcional para os fluxos do painel e para os testes que não precisam de frete
    @Optional() private readonly publicFreight?: PublicFreightService,
  ) {}

  /**
   * `publicOrder: true` = pedido feito pela loja virtual (sem login). Nesse modo o servidor confere os preços
   * com o catálogo e limita descontos e total (ver `public-order-rules.ts`). O painel admin não usa esse modo.
   */
  async execute(
    data: Partial<Order> & {
      couponTitle?: string;
      showProductPrices?: boolean;
    },
    options: { publicOrder?: boolean } = {},
  ): Promise<Order> {
    try {
      let couponId: string | undefined = undefined;
      let freeShippingByCoupon = false;
      let couponDiscountValue = Number(data.couponDiscount) || 0;
      let couponFreightDiscountValue = Number(data.couponFreightDiscount) || 0;

      const storeId =
        data.storeId || this.tenantContextService.getStoreId() || undefined;

      // Formas de pagamento que mantêm o preço promocional (configurável na loja; padrão: só Pix)
      let promoPaymentMethods: string[] = ['pix'];
      let storeSettings: StoreSettings | null = null;
      try {
        storeSettings = await this.settingsRepository.get();
        if (Array.isArray(storeSettings?.promoPaymentMethods)) {
          promoPaymentMethods = storeSettings.promoPaymentMethods;
        }
      } catch (err) {
        // Mantém o padrão (apenas Pix)
      }
      const orderPaymentMethod = String(
        (data as any).paymentMethod || '',
      ).toLowerCase();

      // Validar combos e recalcular preços dos itens com base no banco de dados para segurança
      if (data.items && Array.isArray(data.items)) {
        for (const item of data.items) {
          if (typeof (item as any).observation === 'string') {
            const trimmedObs = (item as any).observation.trim();
            (item as any).observation = trimmedObs ? trimmedObs.slice(0, 300) : null;
          } else if ((item as any).observation !== undefined) {
            (item as any).observation = null;
          }
          // Montagem só existe em produto: combo ou item sem produto nunca leva snapshot (seria gravado cru e impresso)
          resetNonProductCustomization(item);
          if (options.publicOrder) {
            if (!item.isCombo && !item.comboId && !item.productId) {
              throw new BadRequestException('Item do pedido inválido.');
            }
            if (
              !Number.isInteger(Number(item.quantity)) ||
              Number(item.quantity) < 1
            ) {
              throw new BadRequestException(
                'Quantidade inválida em um dos itens.',
              );
            }
          }
          if (item.isCombo || item.comboId) {
            const comboId = item.comboId || item.productId;
            if (!comboId) {
              throw new BadRequestException('ID do combo não fornecido.');
            }

            const comboRecord = await this.prisma.combo.findUnique({
              where: { id: comboId },
              include: {
                items: {
                  include: {
                    product: {
                      include: {
                        images: {
                          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
                        },
                        items: true,
                      },
                    },
                    productItem: true,
                  },
                },
              },
            });

            if (!comboRecord) {
              throw new BadRequestException(
                `Combo "${item.productName}" não encontrado.`,
              );
            }

            if (!comboRecord.isActive) {
              throw new BadRequestException(
                `O combo "${comboRecord.name}" está inativo.`,
              );
            }

            const now = new Date();
            if (comboRecord.startDate && now < comboRecord.startDate) {
              throw new BadRequestException(
                `O combo "${comboRecord.name}" ainda não está disponível.`,
              );
            }
            if (comboRecord.endDate && now > comboRecord.endDate) {
              throw new BadRequestException(
                `O combo "${comboRecord.name}" não está mais disponível.`,
              );
            }

            if (
              comboRecord.maxPerOrder &&
              item.quantity > comboRecord.maxPerOrder
            ) {
              throw new BadRequestException(
                `Limite máximo de ${comboRecord.maxPerOrder} unidade(s) por pedido para o combo "${comboRecord.name}".`,
              );
            }

            if (
              comboRecord.maxTotalSales !== null &&
              comboRecord.maxTotalSales !== undefined
            ) {
              const remaining =
                comboRecord.maxTotalSales - comboRecord.totalSold;
              if (item.quantity > remaining) {
                throw new BadRequestException(
                  `O combo "${comboRecord.name}" possui apenas ${Math.max(0, remaining)} unidade(s) disponíveis para venda.`,
                );
              }
            }

            // Fixa o preço oficial do backend
            item.price = Number(comboRecord.price);
            item.isCombo = true;
            item.comboId = comboRecord.id;
            item.productName = comboRecord.name;
            item.productId = null;

            // Mapeia e valida cada componente do combo
            // Se o componente já tem variação fixa definida no combo: usa a fixa.
            // Se o componente não tem variação fixa: deve vir em item.comboSelections ou falhar se o produto exigir variação
            const clientSelections = Array.isArray(item.comboSelections)
              ? item.comboSelections
              : [];
            const snapshotItems: any[] = [];

            for (let i = 0; i < comboRecord.items.length; i++) {
              const ci = comboRecord.items[i];
              const p = ci.product;

              if (!p || p.isVisible === false) {
                throw new BadRequestException(
                  `O produto "${p?.title || 'Componente'}" do combo "${comboRecord.name}" está indisponível ou desativado.`,
                );
              }

              let resolvedProductItemId = ci.productItemId;
              let resolvedVariation = ci.variation;

              if (resolvedProductItemId) {
                // Variação fixa cadastrada no combo
                const pi = p.items?.find(
                  (itm: any) => itm.id === resolvedProductItemId,
                );
                if (!pi || (pi.stock ?? 0) < ci.quantity * item.quantity) {
                  throw new BadRequestException(
                    `Estoque insuficiente para a opção "${ci.variation || 'padrão'}" do produto "${p.title}" no combo "${comboRecord.name}".`,
                  );
                }
              } else if (
                p.items &&
                p.items.length > 0 &&
                p.items.some(
                  (itm: any) => itm.options && itm.options.length > 0,
                )
              ) {
                // Produto possui variações, cliente deve ter escolhido
                const chosen = clientSelections.find(
                  (cs: any) => cs.productId === ci.productId,
                );
                if (!chosen || (!chosen.productItemId && !chosen.variation)) {
                  throw new BadRequestException(
                    `Por favor, selecione a variação para o item "${p.title}" do combo "${comboRecord.name}".`,
                  );
                }

                // Validar se a variação escolhida pertence ao produto
                let matchedItem: any = null;
                if (chosen.productItemId) {
                  matchedItem = p.items.find(
                    (itm: any) => itm.id === chosen.productItemId,
                  );
                }
                if (!matchedItem && chosen.variation) {
                  const targetVar = chosen.variation.trim().toLowerCase();
                  matchedItem = p.items.find((itm: any) => {
                    const optVals = (itm.options || [])
                      .map((o: any) => o.option?.value?.trim()?.toLowerCase())
                      .filter(Boolean);
                    const joined = optVals.join(' - ');
                    return (
                      joined === targetVar ||
                      optVals.includes(targetVar) ||
                      targetVar.includes(joined)
                    );
                  });
                }

                if (!matchedItem) {
                  throw new BadRequestException(
                    `A variação "${chosen.variation || chosen.productItemId}" não pertence ao produto "${p.title}".`,
                  );
                }

                if ((matchedItem.stock ?? 0) < ci.quantity * item.quantity) {
                  throw new BadRequestException(
                    `A variação "${chosen.variation}" do produto "${p.title}" não possui estoque suficiente para o combo.`,
                  );
                }

                resolvedProductItemId = matchedItem.id;
                resolvedVariation =
                  chosen.variation ||
                  (matchedItem.options || [])
                    .map((o: any) => o.option?.value)
                    .join(' - ') ||
                  null;
              } else {
                // Produto simples sem variações
                const totalStock = (p.items || []).reduce(
                  (sum: number, itm: any) => sum + (itm.stock ?? 0),
                  0,
                );
                if (totalStock < ci.quantity * item.quantity) {
                  throw new BadRequestException(
                    `Estoque insuficiente para o produto "${p.title}" do combo "${comboRecord.name}".`,
                  );
                }
                if (p.items && p.items.length === 1) {
                  resolvedProductItemId = p.items[0].id;
                }
              }

              const promo = p?.promotionalPrice
                ? Number(p.promotionalPrice)
                : 0;
              const normal = p?.price ? Number(p.price) : 0;

              snapshotItems.push({
                productId: ci.productId,
                productItemId: resolvedProductItemId || null,
                quantity: ci.quantity,
                variation: resolvedVariation || null,
                productName: p?.title || 'Produto',
                productPrice: promo > 0 ? promo : normal,
                productCostPrice: p?.costPrice ? Number(p.costPrice) : 0,
              });
            }

            // Snapshot imutável dos componentes com variações exatas
            item.comboSnapshot = {
              comboId: comboRecord.id,
              comboName: comboRecord.name,
              comboPrice: Number(comboRecord.price),
              comboImageUrl: comboRecord.imageUrl || null,
              quantity: item.quantity,
              items: snapshotItems,
            };
          } else if (item.productId) {
            // Validação e resolução rigorosa de produto convencional
            const prod = await this.prisma.product.findUnique({
              where: { id: item.productId },
              include: {
                items: {
                  include: {
                    options: {
                      include: { option: true },
                    },
                  },
                },
              },
            });

            if (!prod) {
              throw new BadRequestException(
                `Produto "${item.productName}" não encontrado.`,
              );
            }

            if (!prod.items || prod.items.length === 0) {
              throw new BadRequestException(
                `Produto "${item.productName}" não possui estoque cadastrado.`,
              );
            }

            // Preço promocional só vale nas formas de pagamento permitidas pela loja
            const promoPrice = prod.promotionalPrice
              ? Number(prod.promotionalPrice)
              : 0;
            const regularPrice = prod.price ? Number(prod.price) : 0;
            if (
              orderPaymentMethod &&
              promoPrice > 0 &&
              regularPrice > promoPrice &&
              Math.abs(Number(item.price) - promoPrice) < 0.005 &&
              !promoPaymentMethods
                .map((m) => String(m).toLowerCase())
                .includes(orderPaymentMethod)
            ) {
              throw new BadRequestException(
                `O preço promocional de "${prod.title}" não é válido para a forma de pagamento escolhida.`,
              );
            }

            // Montagem: o snapshot que a cozinha imprime nunca vem cru do cliente.
            // Sem isCustomized ele é descartado; com isCustomized é refeito a partir do banco.
            let customizedPrices: number[] | null = null;
            if (item.isCustomized) {
              const customResult = await resolveCustomizedAllowedPrices(
                prod,
                item,
                this.prisma,
                storeId,
              );
              customizedPrices = customResult.allowedPrices;
              item.customizationSnapshot = customResult.sanitizedSnapshot;
            } else {
              item.customizationSnapshot = undefined;
            }

            // Pedido da loja: o preço do item tem que ser um preço que o catálogo pratica (regular, promocional ou da oferta "Peça também")
            if (options.publicOrder) {
              let allowedPrices = productAllowedPrices(prod);
              if (customizedPrices) {
                allowedPrices = customizedPrices;
              } else if (item.isOrderBump && item.orderBumpId) {
                const bump = await this.prisma.orderBump.findUnique({
                  where: { id: item.orderBumpId },
                });
                // O preço da oferta só vale se a regra está ativa, é desta loja, é deste produto e o
                // gatilho (produto/categoria) foi cumprido pelos itens do pedido. Senão vale o preço
                // normal do catálogo e o pedido é recusado abaixo, como qualquer preço adulterado.
                if (
                  bump &&
                  orderBumpUsable(bump, prod.id, storeId) &&
                  orderBumpTriggerMet(
                    bump,
                    await this.productsForBumpTrigger(
                      (data.items as any[]) ?? [],
                      bump.triggerType === 'CATEGORY',
                    ),
                  )
                ) {
                  allowedPrices = orderBumpAllowedPrices(prod, bump);
                }
              }
              if (!unitPriceMatches(item.price, allowedPrices)) {
                throw new BadRequestException(
                  `O preço de "${prod.title}" mudou. Atualize o carrinho e tente de novo.`,
                );
              }
            }

            let resolvedPi: any = null;

            if (item.productItemId) {
              resolvedPi = prod.items.find(
                (pi: any) => pi.id === item.productItemId,
              );
            }

            if (!resolvedPi && item.variation && item.variation.trim() !== '') {
              const targetVar = item.variation.trim().toLowerCase();
              resolvedPi = prod.items.find((pi: any) => {
                const optVals = (pi.options || [])
                  .map((o: any) => o.option?.value?.trim()?.toLowerCase())
                  .filter(Boolean);
                const joined = optVals.join(' - ');
                return (
                  joined === targetVar ||
                  optVals.includes(targetVar) ||
                  targetVar.includes(joined)
                );
              });

              if (!resolvedPi) {
                throw new BadRequestException(
                  `A opção "${item.variation}" do produto "${prod.title}" não está mais disponível no catálogo.`,
                );
              }
            } else if (
              !resolvedPi &&
              prod.items.length === 1 &&
              (!prod.items[0].options || prod.items[0].options.length === 0)
            ) {
              resolvedPi = prod.items[0];
            } else if (!resolvedPi && prod.items.length === 1) {
              resolvedPi = prod.items[0];
            }

            if (!resolvedPi && prod.items.length > 1) {
              throw new BadRequestException(
                `Por favor, selecione a variação desejada para o produto "${prod.title}".`,
              );
            }

            if (resolvedPi) {
              item.productItemId = resolvedPi.id;
              if (resolvedPi.stock < (item.quantity || 1)) {
                throw new BadRequestException(
                  `Estoque insuficiente para "${prod.title}${item.variation ? ' - ' + item.variation : ''}". Disponível: ${resolvedPi.stock}, Solicitado: ${item.quantity}`,
                );
              }
            }
          }
        }
      }

      // Pedido da loja: o total dos itens é recalculado aqui (preços já conferidos); o do cliente só é aceito se bater
      let publicItemsSum = 0;
      // Frete que o navegador mandou, antes de qualquer ajuste do servidor (o frete grátis por valor mínimo zera `data.freight` logo abaixo)
      const publicClientFreight = Number(data.freight) || 0;
      if (options.publicOrder) {
        publicItemsSum = round2(
          (data.items || []).reduce(
            (acc: number, item: any) =>
              acc +
              round2((Number(item.price) || 0) * (Number(item.quantity) || 1)),
            0,
          ),
        );
        if (
          Math.abs((Number(data.itemsTotal) || 0) - publicItemsSum) >
          TOTAL_TOLERANCE
        ) {
          throw new BadRequestException(
            'O preço de algum item mudou. Atualize o carrinho e tente de novo.',
          );
        }
        data.itemsTotal = publicItemsSum;

        if (storeSettings?.minOrderEnabled && storeSettings?.minOrderValue) {
          const minOrderVal = Number(storeSettings.minOrderValue);
          if (
            !isNaN(minOrderVal) &&
            minOrderVal > 0 &&
            publicItemsSum + TOTAL_TOLERANCE < minOrderVal
          ) {
            const formattedMin = minOrderVal.toFixed(2).replace('.', ',');
            throw new BadRequestException(
              `O valor mínimo do pedido é R$ ${formattedMin}.`,
            );
          }
        }
      }

      // Se a loja tem regra de isenção de taxa (frete grátis) a partir de um valor
      try {
        const settings = await this.settingsRepository.get();
        if (settings?.freeShippingEnabled && settings?.freeShippingMinValue) {
          const minVal = Number(settings.freeShippingMinValue);
          if (
            !isNaN(minVal) &&
            minVal > 0 &&
            (Number(data.itemsTotal) || 0) >= minVal
          ) {
            data.freight = 0;
          }
        }
      } catch (err) {
        // Ignora erro ao buscar settings
      }

      if (data.couponTitle) {
        let nonPromoTotal =
          (data as any).nonPromoItemsTotal !== undefined
            ? Number((data as any).nonPromoItemsTotal)
            : undefined;

        if (
          nonPromoTotal === undefined &&
          data.items &&
          Array.isArray(data.items)
        ) {
          nonPromoTotal = data.items.reduce((acc: number, item: any) => {
            const isPromo =
              item.isPromo ||
              item.isPromotional ||
              (item.oldPrice !== undefined && item.oldPrice > 0);
            if (isPromo) return acc;
            return (
              acc + (Number(item.price) || 0) * (Number(item.quantity) || 1)
            );
          }, 0);
        }

        const { coupon, discountAmount } =
          await this.validateCouponUseCase.execute({
            title: data.couponTitle,
            orderTotal: Number(data.itemsTotal) || 0,
            nonPromoItemsTotal: nonPromoTotal,
          });

        couponId = coupon.id;
        if (coupon.type === 'FREE_SHIPPING') {
          freeShippingByCoupon = true;
          couponFreightDiscountValue =
            Number(data.freight) > 0 ? Number(data.freight) : 0;
        } else {
          couponDiscountValue = discountAmount;
        }
      }

      // Pedido da loja: o frete é o que o SERVIDOR calcula (mesma regra do navegador); o enviado só passa se bater
      if (options.publicOrder) {
        if (!this.publicFreight || !storeSettings) {
          throw new BadRequestException(
            'Não foi possível conferir o frete agora. Tente novamente.',
          );
        }
        const verified = await this.publicFreight.resolve({
          settings: storeSettings,
          order: data as any,
          itemsTotal: publicItemsSum,
          freeShippingByCoupon,
          clientFreight: publicClientFreight,
        });
        data.freight = verified.freight;
      }

      const order = new Order({
        ...data,
        storeId: storeId || data.storeId,
        couponDiscount: couponDiscountValue,
        couponFreightDiscount: couponFreightDiscountValue,
        couponId: couponId,
        status: data.status || undefined,
        paymentDate: data.paymentStatus === 'PAID' ? new Date() : undefined,
        // Pix na maquininha: Pix não pago nunca fica `online` (seria tratado como já pago)
        paymentType:
          pixTerminalPaymentType(data, storeSettings) ?? data.paymentType,
      });

      // Recalcular o totalOrder para garantir a precisão no backend
      const itemsTotal = Number(order.itemsTotal) || 0;
      const freight = Number(order.freight) > 0 ? Number(order.freight) : 0;
      const installmentSurcharge = Number(order.installmentSurcharge) || 0;
      const receiptSurcharge = Number(order.receiptSurcharge) || 0;
      const paymentDiscount = Number(order.paymentDiscount) || 0;
      const receiptDiscount = Number(order.receiptDiscount) || 0;
      const cDiscount = Number(order.couponDiscount) || 0;
      const cFDiscount = Number(order.couponFreightDiscount) || 0;

      // Mantemos suporte aos campos legados se ainda chegarem
      const calculatedTotal =
        Math.round(
          (itemsTotal +
            freight +
            installmentSurcharge +
            receiptSurcharge -
            paymentDiscount -
            receiptDiscount -
            cDiscount -
            cFDiscount) *
            100,
        ) / 100;

      if (options.publicOrder) {
        // O total gravado (e cobrado nos gateways) é o do servidor, nunca o enviado pelo navegador
        const loyaltyCap = await this.publicLoyaltyCap(
          storeId,
          order.customerPhone,
          (data as any).redeemedReward?.rewardType,
          publicItemsSum,
          Number(order.receiptDiscount) || 0,
        );
        const verified = assertPublicOrderTotals({
          itemsSum: publicItemsSum,
          clientItemsTotal: publicItemsSum,
          clientTotal: data.totalOrder,
          freight: Number(order.freight) || 0,
          installmentSurcharge: Number(order.installmentSurcharge) || 0,
          receiptSurcharge: Number(order.receiptSurcharge) || 0,
          paymentDiscount: Number(order.paymentDiscount) || 0,
          receiptDiscount: Number(order.receiptDiscount) || 0,
          couponDiscount: couponDiscountValue,
          couponFreightDiscount: couponFreightDiscountValue,
          paymentIsPix: orderPaymentMethod.includes('pix'),
          pixDiscountPercent: pixDiscountPercent(storeSettings?.paymentRules),
          loyaltyCap,
        });
        order.itemsTotal = verified.itemsTotal;
        order.totalOrder = verified.totalOrder;
        order.totalReceived = verified.totalOrder;
      } else {
        order.totalOrder =
          data.totalOrder !== undefined ? data.totalOrder : calculatedTotal;
      }
      const savedOrder =
        await this.ordersRepository.saveWithStockDecrement(order);

      if (couponId) {
        const coupon = await this.couponsRepository.findById(couponId);
        if (coupon) {
          await this.couponsRepository.update(couponId, {
            currentUses: coupon.currentUses + 1,
          });
        }
      }

      // Processa ou vincula recompensa/brinde/desconto de fidelidade resgatado ao pedido
      try {
        const cleanPhone = (savedOrder.customerPhone || '').replace(/\D/g, '');
        const loyaltyReward = (data as any).redeemedReward;

        if (loyaltyReward && loyaltyReward.rewardType && cleanPhone) {
          // O cliente selecionou uma recompensa no carrinho: efetiva o resgate AGORA vinculado a este pedido!
          const card = await this.prisma.loyaltyCard.findFirst({
            where: {
              storeId: savedOrder.storeId || storeId,
              customerPhone: { contains: cleanPhone.slice(-8) },
            },
          });

          if (card) {
            const program = await this.prisma.loyaltyProgram.findUnique({
              where: { storeId: savedOrder.storeId || storeId },
            });

            const rType = loyaltyReward.rewardType;
            const rTitle =
              loyaltyReward.rewardTitle ||
              program?.rewardText ||
              'Brinde Fidelidade';
            const isPointsDiscount = rType === 'POINTS_DISCOUNT';
            const isCashback = rType === 'CASHBACK';

            // Cria o registro de redenção já com o orderId
            await this.prisma.loyaltyRewardRedemption.create({
              data: {
                storeId: savedOrder.storeId || storeId || '',
                loyaltyCardId: card.id,
                orderId: savedOrder.id,
                customerPhone: cleanPhone,
                customerName: card.customerName || savedOrder.customerName,
                rewardType: rType,
                rewardTitle: rTitle,
                status:
                  isPointsDiscount || isCashback
                    ? 'DELIVERED'
                    : 'PENDING_DELIVERY',
              },
            });

            // Ao resgatar benefícios descartáveis (produto grátis, desconto por pontos, cashback), zera tudo no cartão.
            // Para PROGRESSIVE_DISCOUNT, é acumulativo: NÃO zera os pedidos do cliente!
            let updatedCard = card;
            if (rType !== 'PROGRESSIVE_DISCOUNT') {
              updatedCard = await this.prisma.loyaltyCard.update({
                where: { id: card.id },
                data: {
                  status: 'REDEEMED',
                  currentStamps: 0,
                  pointsBalance: 0,
                  cashbackBalance: 0,
                  totalCompleted: card.totalCompleted + 1,
                  startedAt: null,
                  expiresAt: null,
                },
              });
            }

            // Registra a transação detalhada correspondente
            if (isPointsDiscount) {
              await this.prisma.loyaltyTransaction.create({
                data: {
                  storeId: savedOrder.storeId || storeId || '',
                  loyaltyCardId: card.id,
                  orderId: savedOrder.id,
                  type: 'USE_POINTS',
                  pointsAmount: card.pointsBalance,
                  stampsCount: card.currentStamps,
                  description: `Desconto por pontos resgatado no Pedido #${savedOrder.id.slice(-6).toUpperCase()}: ${rTitle}`,
                },
              });
            } else if (isCashback) {
              await this.prisma.loyaltyTransaction.create({
                data: {
                  storeId: savedOrder.storeId || storeId || '',
                  loyaltyCardId: card.id,
                  orderId: savedOrder.id,
                  type: 'USE_CASHBACK',
                  cashbackAmount: card.cashbackBalance,
                  description: `Saldo de cashback resgatado no Pedido #${savedOrder.id.slice(-6).toUpperCase()}: ${rTitle}`,
                },
              });
            } else if (rType === 'PROGRESSIVE_DISCOUNT') {
              await this.prisma.loyaltyTransaction.create({
                data: {
                  storeId: savedOrder.storeId || storeId || '',
                  loyaltyCardId: card.id,
                  orderId: savedOrder.id,
                  type: 'USE_DISCOUNT',
                  stampsCount: card.currentStamps,
                  description: `Desconto progressivo aplicado no Pedido #${savedOrder.id.slice(-6).toUpperCase()}: ${rTitle}`,
                },
              });
            } else {
              // Brinde / Produto grátis
              await this.prisma.loyaltyTransaction.create({
                data: {
                  storeId: savedOrder.storeId || storeId || '',
                  loyaltyCardId: card.id,
                  orderId: savedOrder.id,
                  type: 'REDEEM_REWARD',
                  stampsCount: card.currentStamps,
                  description: `Recompensa resgatada no Pedido #${savedOrder.id.slice(-6).toUpperCase()}: ${rTitle}`,
                },
              });
            }

            // Notifica via socket
            try {
              this.eventsGateway.server.emit('loyalty.reward_redeemed', {
                storeId: savedOrder.storeId || storeId,
                customerName:
                  card.customerName || savedOrder.customerName || 'Cliente',
                customerPhone: cleanPhone,
                rewardTitle: rTitle,
                rewardType: rType,
                orderId: savedOrder.id,
                createdAt: new Date(),
              });
              this.eventsGateway.server.emit('loyalty.card_updated', {
                storeId: savedOrder.storeId || storeId,
                cardId: card.id,
                customerPhone: cleanPhone,
              });
              this.eventsGateway.server.emit('loyalty.refresh', {
                storeId: savedOrder.storeId || storeId,
              });
            } catch (wsErr) {
              console.error(
                '[Loyalty] Erro ao emitir notificação de resgate:',
                wsErr,
              );
            }
          }
        } else if (cleanPhone) {
          // Fallback para resgates que possam ter sido registrados anteriormente sem orderId
          const recentRedemption =
            await this.prisma.loyaltyRewardRedemption.findFirst({
              where: {
                customerPhone: { contains: cleanPhone.slice(-8) },
                orderId: null,
              },
              orderBy: { createdAt: 'desc' },
            });

          if (recentRedemption) {
            await this.prisma.loyaltyRewardRedemption.update({
              where: { id: recentRedemption.id },
              data: { orderId: savedOrder.id },
            });
          }
        }
      } catch (err) {
        console.error(
          '[Loyalty] Erro ao processar resgate de fidelidade no pedido:',
          err,
        );
      }

      // Disparar Notificação Push
      try {
        const admins = await this.usersRepository.findAll();
        const tokens: string[] = [];
        const webSubscriptions: any[] = [];
        admins.forEach((u) => {
          if (u.expoPushToken) {
            tokens.push(...u.expoPushToken.split(',').filter(Boolean));
          }
          if (u.webPushSubscription) {
            if (Array.isArray(u.webPushSubscription)) {
              webSubscriptions.push(...u.webPushSubscription);
            } else {
              webSubscriptions.push(u.webPushSubscription as any);
            }
          }
        });
        console.log(
          `[Push Notification] Found ${tokens.length} expo tokens and ${webSubscriptions.length} web subs to send notifications.`,
        );
        if (tokens.length > 0 || webSubscriptions.length > 0) {
          const formatter = new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          });
          const formattedValue = formatter.format(
            Number(savedOrder.totalOrder || 0),
          );
          this.pushNotificationService
            .sendNotifications(
              tokens,
              `(${formattedValue}) Oba! Chegou pedido 🤩`,
              `Pedido nº #${savedOrder.orderNumber} - ${savedOrder.customerName}`,
              { orderId: savedOrder.id },
              webSubscriptions,
            )
            .catch((e) => console.error(e));
        }
      } catch (err) {
        console.error('Erro ao buscar tokens para notificação', err);
      }

      // Avaliação de Transição de Estado de Estoque (Máquina de Estados Anti-Spam)
      try {
        const rawProductIds = (savedOrder.items || []).map((i) => i.productId);
        const uniqueProductIds = Array.from(
          new Set(rawProductIds.filter(Boolean)),
        ) as string[];

        for (const prodId of uniqueProductIds) {
          const product = await this.prisma.product.findUnique({
            where: { id: prodId },
            include: { items: true },
          });

          if (!product) continue;

          const totalStock = product.items.reduce(
            (acc, item) => acc + item.stock,
            0,
          );
          // Estoque mínimo: 7 dias de cobertura (mínimo 3 unidades)
          const minStock =
            product.minStock ??
            Math.max(3, Math.ceil((product.dailyRunRate ?? 0) * 7));
          const previousState = product.stockAlertState || 'OK';

          let newState = 'OK';
          if (totalStock === 0) {
            newState = 'OUT_OF_STOCK';
          } else if (
            product.coverageDays !== null &&
            product.coverageDays <= 3
          ) {
            newState = 'CRITICAL';
          } else if (totalStock <= minStock) {
            newState = 'LOW_STOCK';
          }

          // Só notifica se HOUVE TRANSIÇÃO DE ESTADO
          if (newState !== previousState && newState !== 'OK') {
            const isOutOfStock = newState === 'OUT_OF_STOCK';
            const alertTitle = isOutOfStock
              ? `🔴 Esgotou: ${product.title}`
              : `⚠️ Estoque Crítico: ${product.title}`;
            const alertBody = isOutOfStock
              ? 'O estoque deste produto acabou de zerar.'
              : `Restam apenas ${totalStock} un (mínimo: ${minStock}). ${
                  product.coverageDays !== null && product.coverageDays < 999
                    ? `Cobertura estimada: ${product.coverageDays} dias.`
                    : 'Sem histórico de vendas recentes.'
                }`;

            const admins = await this.usersRepository.findAll();
            const alertTokens: string[] = [];
            const alertWebSubs: unknown[] = [];
            admins.forEach((u) => {
              if (u.expoPushToken)
                alertTokens.push(...u.expoPushToken.split(',').filter(Boolean));
              if (u.webPushSubscription) {
                if (Array.isArray(u.webPushSubscription))
                  alertWebSubs.push(...u.webPushSubscription);
                else alertWebSubs.push(u.webPushSubscription);
              }
            });

            if (alertTokens.length > 0 || alertWebSubs.length > 0) {
              this.pushNotificationService
                .sendNotifications(
                  alertTokens,
                  alertTitle,
                  alertBody,
                  { screen: 'ProductDetails', productId: product.id },
                  alertWebSubs,
                )
                .catch((e) =>
                  console.error('[StockAlert Push] Erro ao enviar:', e),
                );
            }

            await this.prisma.product.update({
              where: { id: product.id },
              data: {
                stockAlertState: newState,
                lastStockAlertAt: new Date(),
              },
            });
          } else if (newState === 'OK' && previousState !== 'OK') {
            await this.prisma.product.update({
              where: { id: product.id },
              data: {
                stockAlertState: 'OK',
              },
            });
          }
        }
      } catch (stockAlertErr) {
        console.error(
          '[StockAlert StateMachine] Erro ao verificar estado de estoque:',
          stockAlertErr,
        );
      }

      // Disparar WebSocket para impressão
      try {
        if (savedOrder.status !== 'CANCELLED') {
          const orderForPrint = {
            ...savedOrder,
            showProductPrices: data.showProductPrices,
          };
          const targetPrintStoreId = savedOrder.storeId || storeId || '1';
          this.printGateway.emitNovoPedido(targetPrintStoreId, orderForPrint);
        }
      } catch (err) {
        console.error('Erro ao emitir pedido para impressão', err);
      }

      // Disparar Eventos WebSocket (Admin e Client)
      try {
        this.eventsGateway.notifyNewOrder(savedOrder);
        // Também disparamos um evento genérico para atualizar o catálogo no front cliente
        this.eventsGateway.server.emit('products.refresh');
      } catch (err) {
        console.error('Erro ao emitir eventos websocket', err);
      }

      // Atribuição de fidelidade (selos, pontos ou cashback) se o pedido já foi criado como pago ou concluído (ex: pedido manual no admin)
      if (
        savedOrder.status === 'COMPLETED' ||
        savedOrder.paymentStatus === 'PAID'
      ) {
        this.loyaltyService
          .processOrderCompleted({
            id: savedOrder.id,
            storeId: savedOrder.storeId || storeId,
            customerPhone: savedOrder.customerPhone,
            customerName: savedOrder.customerName,
            totalOrder: savedOrder.totalOrder,
          })
          .catch((err) => {
            console.error(
              '[Loyalty] Erro ao processar fidelidade no pedido criado:',
              err,
            );
          });
      }

      if (savedOrder.status === 'COMPLETED') {
        this.loyaltyService
          .markRedemptionDeliveredByOrderId(savedOrder.id)
          .catch((err) => {
            console.error('[Loyalty] Erro ao marcar brinde entregue:', err);
          });
      }

      return savedOrder;
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  private async checkIfCustomerIsBlocked(
    customerId?: string | null,
    customerPhone?: string,
  ): Promise<void> {
    if (customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true, isBlocked: true },
      });
      if (customer?.isBlocked) {
        throw new BadRequestException(
          'Não foi possível finalizar o pedido. Este número de telefone está bloqueado para compras.',
        );
      }
    }

    if (customerPhone) {
      const cleanIncoming = customerPhone.replace(/\D/g, '');
      if (!cleanIncoming) return;

      const normIncoming =
        cleanIncoming.startsWith('55') && cleanIncoming.length > 11
          ? cleanIncoming.substring(2)
          : cleanIncoming;

      const last8 =
        normIncoming.length >= 8 ? normIncoming.slice(-8) : normIncoming;

      const blockedCandidates = await this.prisma.customer.findMany({
        where: {
          isBlocked: true,
          OR: [
            { phone: customerPhone },
            { phone: cleanIncoming },
            { phone: normIncoming },
            { phone: { contains: last8 } },
          ],
        },
        select: { id: true, phone: true },
      });

      const isBlocked = blockedCandidates.some((c) => {
        const cleanCandidate = (c.phone || '').replace(/\D/g, '');
        const normCandidate =
          cleanCandidate.startsWith('55') && cleanCandidate.length > 11
            ? cleanCandidate.substring(2)
            : cleanCandidate;

        if (normCandidate === normIncoming) return true;
        if (normCandidate.length === 10 && normIncoming.length === 11) {
          return (
            normCandidate.slice(0, 2) === normIncoming.slice(0, 2) &&
            normCandidate.slice(2) === normIncoming.slice(3)
          );
        }
        if (normCandidate.length === 11 && normIncoming.length === 10) {
          return (
            normCandidate.slice(0, 2) === normIncoming.slice(0, 2) &&
            normCandidate.slice(3) === normIncoming.slice(2)
          );
        }
        return false;
      });

      if (isBlocked) {
        throw new BadRequestException(
          'Não foi possível finalizar o pedido. Este número de telefone está bloqueado para compras.',
        );
      }
    }
  }

  /**
   * Produtos do pedido (e, se a oferta pede, a categoria de cada um) para conferir o gatilho do
   * "Peça também". Só busca categoria no banco quando o gatilho da oferta é por categoria.
   * Inclui produtos avulsos e componentes de combos legítimos presentes no pedido.
   * Componentes de combo são obtidos exclusivamente no banco de dados via Prisma (nunca do payload do cliente).
   */
  private async productsForBumpTrigger(
    items: Array<{
      productId?: string | null;
      comboId?: string | null;
      isCombo?: boolean;
      isOrderBump?: boolean;
      orderBumpId?: string | null;
    }>,
    withCategories: boolean,
  ): Promise<
    Array<{ productId: string; categoryId?: string | null; isOrderBump?: boolean }>
  > {
    const directItems = items.filter(
      (i) => !i?.isCombo && !i?.comboId && i?.productId,
    );
    const directIds = directItems.map((i) => i.productId as string);

    const comboIds = [
      ...new Set(
        items
          .filter((i) => i?.isCombo || i?.comboId)
          .map((i) => i?.comboId || (i?.isCombo ? i?.productId : null))
          .filter((id): id is string => !!id),
      ),
    ];

    const comboComponentIds: string[] = [];
    if (comboIds.length > 0) {
      try {
        const comboRecords = await this.prisma.combo.findMany({
          where: { id: { in: comboIds } },
          include: { items: { select: { productId: true } } },
        });
        for (const c of comboRecords) {
          for (const ci of c.items || []) {
            if (ci?.productId) comboComponentIds.push(ci.productId);
          }
        }
      } catch {
        // Fallback silencioso
      }
    }

    const allEntries: Array<{ productId: string; isOrderBump?: boolean }> = [
      ...directItems.map((i) => ({
        productId: i.productId as string,
        isOrderBump: Boolean(i.isOrderBump || i.orderBumpId),
      })),
      ...comboComponentIds.map((productId) => ({
        productId,
        isOrderBump: false,
      })),
    ];

    const ids = [...new Set([...directIds, ...comboComponentIds])];
    if (!withCategories || ids.length === 0) {
      return allEntries;
    }
    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, categoryId: true },
    });
    const categoryById = new Map(rows.map((r) => [r.id, r.categoryId]));
    return allEntries.map((entry) => ({
      ...entry,
      categoryId: categoryById.get(entry.productId) ?? null,
    }));
  }

  /** Teto do desconto de fidelidade para o pedido da loja (0 se não houver benefício real que o justifique). */
  private async publicLoyaltyCap(
    storeId: string | undefined,
    phone: string,
    rewardType: string | undefined,
    itemsSum: number,
    receiptDiscount: number,
  ): Promise<number> {
    if (receiptDiscount <= 0.01) return 0;
    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (!storeId || !rewardType || cleanPhone.length < 8) return 0;
    const [program, card] = await Promise.all([
      this.prisma.loyaltyProgram.findUnique({ where: { storeId } }),
      this.prisma.loyaltyCard.findFirst({
        where: { storeId, customerPhone: { contains: cleanPhone.slice(-8) } },
      }),
    ]);
    return loyaltyDiscountCap({
      rewardType,
      itemsTotal: itemsSum,
      program,
      card,
    });
  }

  async isCustomerBlocked(
    customerId?: string | null,
    customerPhone?: string,
  ): Promise<boolean> {
    try {
      await this.checkIfCustomerIsBlocked(customerId, customerPhone);
      return false;
    } catch {
      return true;
    }
  }
}
