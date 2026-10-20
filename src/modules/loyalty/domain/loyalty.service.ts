import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { UpdateLoyaltyProgramDto } from '../application/dto/update-loyalty-program.dto';
import { ManualAdjustStampDto } from '../application/dto/manual-adjust-stamp.dto';
import { getZonedStartAndEndDates } from '../../../common/utils/date.utils';
import { EventsGateway } from '../../events/events.gateway';

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);
  private readonly TIMEZONE = 'America/Campo_Grande';

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  private cleanPhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  /**
   * Retorna a data e hora atual no fuso da loja (America/Campo_Grande)
   */
  getNowInStoreTimezone(): Date {
    const nowStr = new Date().toLocaleString('en-US', { timeZone: this.TIMEZONE });
    return new Date(nowStr);
  }

  /**
   * Calcula a data de expiração para as 23:59:59.999 no fuso da loja
   */
  calculateExpirationDate(validityDays: number, fromDate?: Date): Date {
    const baseDate = fromDate || new Date();
    const targetDate = new Date(baseDate.getTime() + validityDays * 24 * 60 * 60 * 1000);
    const { endOfDay } = getZonedStartAndEndDates(targetDate, targetDate, this.TIMEZONE);
    return endOfDay;
  }

  /**
   * Verifica se uma data já expirou levando em consideração o fuso da loja
   */
  isDateExpired(expiresAt: Date | null | undefined): boolean {
    if (!expiresAt) return false;
    return new Date().getTime() > new Date(expiresAt).getTime();
  }

  /**
   * Obtém as configurações do programa de fidelidade da loja atual
   */
  async getProgram() {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) return null;

    let program = await this.prisma.loyaltyProgram.findUnique({
      where: { storeId },
    });

    if (!program) {
      program = await this.prisma.loyaltyProgram.create({
        data: {
          storeId,
          isActive: false,
          type: 'FREE_PRODUCT',
          stampsRequired: 10,
          minOrderValue: 0,
          validityDays: 30,
          rewardText: 'Ganhe 1 Produto ou Desconto Especial',
          pointsPerReal: 1.0,
          pointsRedemptionValue: 0.05,
          cashbackPercent: 5.0,
        },
      });
    }

    return program;
  }

  /**
   * Atualiza as configurações do programa de fidelidade
   */
  async updateProgram(dto: UpdateLoyaltyProgramDto) {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) throw new Error('Store ID required');

    return this.prisma.loyaltyProgram.upsert({
      where: { storeId },
      create: {
        storeId,
        isActive: dto.isActive ?? false,
        type: dto.type ?? 'FREE_PRODUCT',
        stampsRequired: dto.stampsRequired ?? 10,
        minOrderValue: dto.minOrderValue ?? 0,
        validityDays: dto.validityDays ?? 30,
        rewardText: dto.rewardText ?? 'Ganhe 1 Produto ou Desconto Especial',
        rewardCouponCode: dto.rewardCouponCode,
        rewardDiscount: dto.rewardDiscount,
        pointsPerReal: dto.pointsPerReal ?? 1.0,
        pointsRedemptionValue: dto.pointsRedemptionValue ?? 0.05,
        minPointsToRedeem: dto.minPointsToRedeem ?? 0,
        cashbackPercent: dto.cashbackPercent ?? 5.0,
        progressiveTiers: dto.progressiveTiers ?? null,
      },
      update: {
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.stampsRequired !== undefined ? { stampsRequired: dto.stampsRequired } : {}),
        ...(dto.minOrderValue !== undefined ? { minOrderValue: dto.minOrderValue } : {}),
        ...(dto.validityDays !== undefined ? { validityDays: dto.validityDays } : {}),
        ...(dto.rewardText !== undefined ? { rewardText: dto.rewardText } : {}),
        ...(dto.rewardCouponCode !== undefined ? { rewardCouponCode: dto.rewardCouponCode } : {}),
        ...(dto.rewardDiscount !== undefined ? { rewardDiscount: dto.rewardDiscount } : {}),
        ...(dto.pointsPerReal !== undefined ? { pointsPerReal: dto.pointsPerReal } : {}),
        ...(dto.pointsRedemptionValue !== undefined ? { pointsRedemptionValue: dto.pointsRedemptionValue } : {}),
        ...(dto.minPointsToRedeem !== undefined ? { minPointsToRedeem: dto.minPointsToRedeem } : {}),
        ...(dto.cashbackPercent !== undefined ? { cashbackPercent: dto.cashbackPercent } : {}),
        ...(dto.progressiveTiers !== undefined ? { progressiveTiers: dto.progressiveTiers } : {}),
      },
    });
  }

  /**
   * Obtém o cartão de fidelidade do cliente pelo telefone (e atualiza status expirado se necessário)
   */
  async getCustomerCard(phone?: string) {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) return null;

    const program = await this.getProgram();

    const cleanPhone = phone ? this.cleanPhone(phone) : '';
    if (!cleanPhone || cleanPhone.length < 8) {
      return {
        card: null,
        program,
      };
    }

    let card = await this.prisma.loyaltyCard.findFirst({
      where: {
        storeId,
        customerPhone: {
          contains: cleanPhone.slice(-8), // flexibilidade para matching
        },
      },
      include: {
        redemptions: {
          where: { status: 'PENDING_DELIVERY' },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (card) {
      // Lazy Check de expiração
      if (card.status === 'ACTIVE' && card.expiresAt && this.isDateExpired(card.expiresAt)) {
        card = await this.prisma.loyaltyCard.update({
          where: { id: card.id },
          data: {
            status: 'EXPIRED',
            currentStamps: 0,
            pointsBalance: 0,
            cashbackBalance: 0,
          },
          include: {
            redemptions: {
              where: { status: 'PENDING_DELIVERY' },
              orderBy: { createdAt: 'desc' },
            },
          },
        });

        await this.prisma.loyaltyTransaction.create({
          data: {
            storeId,
            loyaltyCardId: card.id,
            type: 'EXPIRED',
            stampsCount: 0,
            description: 'Ciclo do cartão expirou por ultrapassar a data limite de validade.',
          },
        });
      }

      // Sincroniza totalCompleted com o total de resgates concluídos (DELIVERED)
      const deliveredCount = await this.prisma.loyaltyRewardRedemption.count({
        where: { loyaltyCardId: card.id, status: 'DELIVERED' },
      });
      if (deliveredCount > 0 && card.totalCompleted !== deliveredCount) {
        card = {
          ...card,
          totalCompleted: deliveredCount,
        };
      }
    }

    return {
      card,
      program,
    };
  }

  /**
   * Atribui selos, pontos ou cashback por pedido pago/concluído
   */
  async processOrderCompleted(order: {
    id: string;
    storeId?: string | null;
    customerPhone: string;
    customerName?: string;
    totalOrder: any;
  }) {
    if (!order.storeId || !order.customerPhone) return;

    const program = await this.prisma.loyaltyProgram.findUnique({
      where: { storeId: order.storeId },
    });

    if (!program || !program.isActive) {
      return;
    }

    const orderAmount = Number(order.totalOrder || 0);
    const minOrderVal = Number(program.minOrderValue || 0);
    if (orderAmount < minOrderVal) {
      this.logger.log(`Pedido ${order.id} abaixo do valor mínimo para pontuar no programa de fidelidade.`);
      return;
    }

    const cleanPhone = this.cleanPhone(order.customerPhone);

    // Evita duplicidade de pontuação para o mesmo pedido ativo
    const existingTx = await this.prisma.loyaltyTransaction.findFirst({
      where: {
        storeId: order.storeId,
        orderId: order.id,
        type: { in: ['EARN_STAMP', 'EARN_POINTS', 'EARN_CASHBACK'] },
      },
    });

    if (existingTx) {
      return;
    }

    // Se este pedido já contém um resgate de brinde/recompensa descartável (ex: produto grátis ou pontos), não pontua novo selo.
    // Mas se for PROGRESSIVE_DISCOUNT, é acumulativo: este pedido CONTA como mais um pedido realizado!
    const orderRedemption = await this.prisma.loyaltyRewardRedemption.findFirst({
      where: {
        storeId: order.storeId,
        orderId: order.id,
      },
    });

    if (orderRedemption && orderRedemption.rewardType !== 'PROGRESSIVE_DISCOUNT') {
      this.logger.log(`Pedido ${order.id} contém resgate de recompensa descartável (${orderRedemption.rewardTitle}). Não pontuará nova fidelidade.`);
      return;
    }

    let card = await this.prisma.loyaltyCard.findUnique({
      where: {
        storeId_customerPhone: {
          storeId: order.storeId,
          customerPhone: cleanPhone,
        },
      },
    });

    if (!card) {
      const phoneVariations = [
        cleanPhone,
        cleanPhone.replace(/^55/, ''),
        cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`,
      ];
      card = await this.prisma.loyaltyCard.findFirst({
        where: {
          storeId: order.storeId,
          customerPhone: { in: phoneVariations },
        },
      });
    }

    const now = new Date();
    const newExpiresAt = this.calculateExpirationDate(program.validityDays, now);

    // Cálculos dependendo do tipo de programa
    const pointsToAdd = Math.round(orderAmount * Number(program.pointsPerReal || 1));
    const cashbackToAdd = Math.round(orderAmount * (Number(program.cashbackPercent || 5) / 100) * 100) / 100;

    const hasFreeProductReward = program.type === 'FREE_PRODUCT' || program.type === 'HYBRID';

    if (!card) {
      const isCompleted = hasFreeProductReward && 1 >= program.stampsRequired;
      card = await this.prisma.loyaltyCard.create({
        data: {
          storeId: order.storeId,
          customerPhone: cleanPhone,
          customerName: order.customerName,
          currentStamps: 1,
          pointsBalance: pointsToAdd,
          cashbackBalance: cashbackToAdd,
          totalCompleted: isCompleted ? 1 : 0,
          startedAt: now,
          expiresAt: newExpiresAt,
          status: isCompleted ? 'COMPLETED' : 'ACTIVE',
        },
      });
    } else {
      const isCardExpired = card.status === 'EXPIRED' || (card.expiresAt && this.isDateExpired(card.expiresAt));

      // Se o cartão anterior expirou ou foi resgatado, este pedido inicia um NOVO ciclo (1 selo)
      const baseStamps = isCardExpired || card.status === 'REDEEMED' ? 0 : card.currentStamps;
      const basePoints = isCardExpired ? 0 : Number(card.pointsBalance);
      const baseCashback = isCardExpired ? 0 : Number(card.cashbackBalance);

      const newStamps = baseStamps + 1;
      const newPoints = basePoints + pointsToAdd;
      const newCashback = baseCashback + cashbackToAdd;
      const isCompleted = hasFreeProductReward && newStamps >= program.stampsRequired;

      card = await this.prisma.loyaltyCard.update({
        where: { id: card.id },
        data: {
          currentStamps: newStamps,
          pointsBalance: newPoints,
          cashbackBalance: newCashback,
          totalCompleted: isCompleted ? card.totalCompleted + 1 : card.totalCompleted,
          status: isCompleted ? 'COMPLETED' : 'ACTIVE',
          customerName: order.customerName || card.customerName,
          startedAt: isCardExpired || !card.startedAt ? now : card.startedAt,
          expiresAt: isCardExpired || !card.expiresAt ? newExpiresAt : card.expiresAt,
        },
      });
    }

    // Registra transação
    await this.prisma.loyaltyTransaction.create({
      data: {
        storeId: order.storeId,
        loyaltyCardId: card.id,
        orderId: order.id,
        type:
          program.type === 'CASHBACK'
            ? 'EARN_CASHBACK'
            : program.type === 'POINTS_DISCOUNT'
            ? 'EARN_POINTS'
            : 'EARN_STAMP',
        stampsCount: 1,
        pointsAmount: pointsToAdd,
        cashbackAmount: cashbackToAdd,
        description: `Pontuação referente ao Pedido #${order.id.slice(-6).toUpperCase()}`,
      },
    });

    try {
      this.eventsGateway.server.emit('loyalty.card_updated', {
        storeId: order.storeId,
        cardId: card.id,
        customerPhone: cleanPhone,
      });
      this.eventsGateway.server.emit('loyalty.refresh', {
        storeId: order.storeId,
      });
    } catch (wsErr) {
      this.logger.error('[Loyalty] Erro ao emitir evento de fidelidade processada via socket', wsErr);
    }
  }

  /**
   * Resgate de recompensa / brinde (com aviso em tempo real pro dono da loja)
   */
  async redeemReward(customerPhone: string, payload?: { rewardType?: string; rewardTitle?: string; orderId?: string }) {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) throw new Error('Store ID required');

    const cleanPhone = this.cleanPhone(customerPhone);
    const card = await this.prisma.loyaltyCard.findUnique({
      where: {
        storeId_customerPhone: {
          storeId,
          customerPhone: cleanPhone,
        },
      },
    });

    if (!card) {
      throw new Error('Cartão de fidelidade não encontrado para este telefone.');
    }

    const program = await this.getProgram();
    const rewardTitle = payload?.rewardTitle || program?.rewardText || 'Brinde Fidelidade';
    const rewardType = payload?.rewardType || program?.type || 'FREE_PRODUCT';

    const isPointsDiscount = rewardType === 'POINTS_DISCOUNT';
    const isCashback = rewardType === 'CASHBACK';

    if (isPointsDiscount) {
      const minPoints = (program as any)?.minPointsToRedeem || 0;
      if (minPoints > 0 && Number(card.pointsBalance) < minPoints) {
        throw new Error(`Saldo insuficiente para resgatar desconto. Mínimo necessário: ${minPoints} pontos.`);
      }
    }

    // Cria registro de resgate para registrar o benefício resgatado/utilizado no pedido
    const redemption = await this.prisma.loyaltyRewardRedemption.create({
      data: {
        storeId,
        loyaltyCardId: card.id,
        orderId: payload?.orderId || null,
        customerPhone: cleanPhone,
        customerName: card.customerName,
        rewardType,
        rewardTitle,
        status: (isPointsDiscount || isCashback) ? 'DELIVERED' : 'PENDING_DELIVERY',
      },
    });

    // Ao resgatar benefícios de consumo (produto grátis, desconto por pontos, cashback), zera tudo no cartão para iniciar novo ciclo.
    // Para PROGRESSIVE_DISCOUNT, é acumulativo: NÃO zera os pedidos do cliente!
    let updated = card;
    if (rewardType !== 'PROGRESSIVE_DISCOUNT') {
      updated = await this.prisma.loyaltyCard.update({
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

    if (isPointsDiscount) {
      await this.prisma.loyaltyTransaction.create({
        data: {
          storeId,
          loyaltyCardId: card.id,
          type: 'USE_POINTS',
          pointsAmount: card.pointsBalance,
          description: `Desconto por pontos resgatado: ${rewardTitle}`,
        },
      });
    } else if (isCashback) {
      await this.prisma.loyaltyTransaction.create({
        data: {
          storeId,
          loyaltyCardId: card.id,
          type: 'USE_CASHBACK',
          cashbackAmount: card.cashbackBalance,
          description: `Saldo de cashback resgatado: ${rewardTitle}`,
        },
      });
    } else if (rewardType === 'PROGRESSIVE_DISCOUNT') {
      await this.prisma.loyaltyTransaction.create({
        data: {
          storeId,
          loyaltyCardId: card.id,
          type: 'USE_DISCOUNT',
          stampsCount: card.currentStamps,
          description: `Desconto progressivo aplicado: ${rewardTitle}`,
        },
      });
    } else {
      await this.prisma.loyaltyTransaction.create({
        data: {
          storeId,
          loyaltyCardId: card.id,
          type: 'REDEEM_REWARD',
          stampsCount: card.currentStamps,
          description: `Recompensa resgatada: ${rewardTitle}`,
        },
      });
    }

    // 🔔 NOTIFICAÇÃO EM TEMPO REAL VIA WEBSOCKET PARA O ADMIN
    try {
      this.eventsGateway.server.emit('loyalty.reward_redeemed', {
        id: redemption.id,
        storeId,
        customerName: card.customerName || 'Cliente',
        customerPhone: cleanPhone,
        rewardTitle,
        rewardType,
        orderId: payload?.orderId,
        createdAt: redemption.createdAt,
      });
      this.logger.log(`[Loyalty] Alerta emitido para o lojista: resgate de brinde de ${cleanPhone}`);
    } catch (wsErr) {
      this.logger.error('[Loyalty] Erro ao emitir evento de resgate via socket', wsErr);
    }

    return {
      success: true,
      redemption,
      rewardText: rewardTitle,
      rewardCouponCode: program?.rewardCouponCode,
      rewardDiscount: program?.rewardDiscount,
      card: updated,
    };
  }

  /**
   * Reverte fidelidade quando um pedido é cancelado:
   * 1. Se o pedido usou um resgate (brinde, desconto de pontos ou cashback), cancela o resgate e devolve o saldo/selos ao cliente.
   * 2. Se o pedido pontuou selos/pontos/cashback, deduz a pontuação gerada por este pedido.
   */
  async revertOrderLoyalty(orderId: string) {
    try {
      this.logger.log(`[Loyalty] Revertendo fidelidade do pedido cancelado: ${orderId}`);

      // 1. Verificar se houve resgate associado a este pedido
      const redemption = await this.prisma.loyaltyRewardRedemption.findFirst({
        where: {
          orderId,
          status: { in: ['PENDING_DELIVERY', 'DELIVERED'] },
        },
        include: {
          loyaltyCard: true,
        },
      });

      if (redemption && redemption.loyaltyCard) {
        const card = redemption.loyaltyCard;
        const program = await this.prisma.loyaltyProgram.findUnique({
          where: { storeId: redemption.storeId },
        });

        // Marca resgate como CANCELLED
        await this.prisma.loyaltyRewardRedemption.update({
          where: { id: redemption.id },
          data: { status: 'CANCELLED' },
        });

        // Reverte estado do cartão conforme o tipo de recompensa
        if (redemption.rewardType === 'POINTS_DISCOUNT') {
          // Busca a transação de USE_POINTS para saber exatamente quantos pontos foram usados
          const useTx = await this.prisma.loyaltyTransaction.findFirst({
            where: {
              loyaltyCardId: card.id,
              type: 'USE_POINTS',
            },
            orderBy: { createdAt: 'desc' },
          });

          const restoredPoints = useTx?.pointsAmount ? Number(useTx.pointsAmount) : 0;
          const newPointsBalance = Number(card.pointsBalance) + restoredPoints;

          // Se for HYBRID, também restaura os selos salvos na transação ou mantém o que o cliente tinha
          const stampsToRestore = (program?.type === 'HYBRID' && useTx?.stampsCount)
            ? Math.max(card.currentStamps, useTx.stampsCount)
            : card.currentStamps;

          await this.prisma.loyaltyCard.update({
            where: { id: card.id },
            data: {
              pointsBalance: newPointsBalance,
              currentStamps: stampsToRestore,
              status: 'ACTIVE',
              totalCompleted: Math.max(0, card.totalCompleted - 1),
            },
          });

          await this.prisma.loyaltyTransaction.create({
            data: {
              storeId: redemption.storeId,
              loyaltyCardId: card.id,
              orderId,
              type: 'REFUND_REWARD',
              pointsAmount: restoredPoints,
              stampsCount: stampsToRestore > card.currentStamps ? stampsToRestore - card.currentStamps : 0,
              description: `Estorno de pontos por cancelamento do Pedido #${orderId.slice(-6).toUpperCase()}`,
            },
          });
        } else if (redemption.rewardType === 'CASHBACK') {
          const useTx = await this.prisma.loyaltyTransaction.findFirst({
            where: {
              loyaltyCardId: card.id,
              type: 'USE_CASHBACK',
            },
            orderBy: { createdAt: 'desc' },
          });

          const restoredCashback = useTx?.cashbackAmount ? Number(useTx.cashbackAmount) : 0;
          const newCashbackBalance = Number(card.cashbackBalance) + restoredCashback;

          await this.prisma.loyaltyCard.update({
            where: { id: card.id },
            data: {
              cashbackBalance: newCashbackBalance,
              status: 'ACTIVE',
              totalCompleted: Math.max(0, card.totalCompleted - 1),
            },
          });

          await this.prisma.loyaltyTransaction.create({
            data: {
              storeId: redemption.storeId,
              loyaltyCardId: card.id,
              orderId,
              type: 'REFUND_REWARD',
              cashbackAmount: restoredCashback,
              description: `Estorno de cashback por cancelamento do Pedido #${orderId.slice(-6).toUpperCase()}`,
            },
          });
        } else if (redemption.rewardType === 'PROGRESSIVE_DISCOUNT') {
          // Desconto progressivo é acumulativo (não subtraiu nem zerou pedidos na aplicação do desconto).
          // Apenas registra o cancelamento do benefício para histórico
          await this.prisma.loyaltyTransaction.create({
            data: {
              storeId: redemption.storeId,
              loyaltyCardId: card.id,
              orderId,
              type: 'REFUND_REWARD',
              stampsCount: 0,
              description: `Estorno de desconto progressivo por cancelamento do Pedido #${orderId.slice(-6).toUpperCase()}`,
            },
          });
        } else {
          // FREE_PRODUCT / Brinde / Selos
          // Busca a quantidade exata de selos que foram usados no momento do resgate
          const redeemTx = await this.prisma.loyaltyTransaction.findFirst({
            where: {
              loyaltyCardId: card.id,
              type: 'REDEEM_REWARD',
            },
            orderBy: { createdAt: 'desc' },
          });

          const stampsToRestore = redeemTx?.stampsCount || program?.stampsRequired || 10;
          await this.prisma.loyaltyCard.update({
            where: { id: card.id },
            data: {
              currentStamps: stampsToRestore,
              status: stampsToRestore >= (program?.stampsRequired || 10) ? 'COMPLETED' : 'ACTIVE',
              totalCompleted: Math.max(0, card.totalCompleted - 1),
              expiresAt: card.expiresAt || this.calculateExpirationDate(program?.validityDays || 30, new Date()),
            },
          });

          await this.prisma.loyaltyTransaction.create({
            data: {
              storeId: redemption.storeId,
              loyaltyCardId: card.id,
              orderId,
              type: 'REFUND_REWARD',
              stampsCount: stampsToRestore,
              description: `Estorno de recompensa por cancelamento do Pedido #${orderId.slice(-6).toUpperCase()}`,
            },
          });
        }

        this.eventsGateway.server.emit('loyalty.card_updated', {
          storeId: redemption.storeId,
          cardId: card.id,
          customerPhone: card.customerPhone,
        });
      }

      // 2. Verificar se o pedido pontuou no cartão do cliente e estornar esses pontos/selos
      const earnTransactions = await this.prisma.loyaltyTransaction.findMany({
        where: {
          orderId,
          type: { in: ['EARN_STAMP', 'EARN_POINTS', 'EARN_CASHBACK'] },
        },
      });

      for (const earnTx of earnTransactions) {
        const card = await this.prisma.loyaltyCard.findUnique({
          where: { id: earnTx.loyaltyCardId },
        });

        if (!card) continue;

        const newStamps = Math.max(0, card.currentStamps - (earnTx.stampsCount || 0));
        const newPoints = Math.max(0, Number(card.pointsBalance) - Number(earnTx.pointsAmount || 0));
        const newCashback = Math.max(0, Number(card.cashbackBalance) - Number(earnTx.cashbackAmount || 0));

        await this.prisma.loyaltyCard.update({
          where: { id: card.id },
          data: {
            currentStamps: newStamps,
            pointsBalance: newPoints,
            cashbackBalance: newCashback,
            status: newStamps === 0 && card.status === 'COMPLETED' ? 'ACTIVE' : card.status,
          },
        });

        await this.prisma.loyaltyTransaction.create({
          data: {
            storeId: earnTx.storeId,
            loyaltyCardId: card.id,
            orderId,
            type: 'MANUAL_ADJUST',
            stampsCount: -(earnTx.stampsCount || 0),
            pointsAmount: earnTx.pointsAmount ? -Number(earnTx.pointsAmount) : undefined,
            cashbackAmount: earnTx.cashbackAmount ? -Number(earnTx.cashbackAmount) : undefined,
            description: `Estorno de pontuação por pedido pendente/cancelado #${orderId.slice(-6).toUpperCase()}`,
          },
        });

        // Remove a transação EARN original deste pedido para que não fique duplicada caso ele seja concluído novamente
        await this.prisma.loyaltyTransaction.delete({
          where: { id: earnTx.id },
        });

        this.eventsGateway.server.emit('loyalty.card_updated', {
          storeId: earnTx.storeId,
          cardId: card.id,
          customerPhone: card.customerPhone,
        });
      }

      // Emite refresh geral
      this.eventsGateway.server.emit('loyalty.refresh', { orderId });
    } catch (err) {
      this.logger.error(`[Loyalty] Erro ao reverter fidelidade do pedido ${orderId}:`, err);
    }
  }

  /**
   * Marcar brinde como entregue pelo admin
   */
  async markRedemptionDelivered(id: string) {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) throw new Error('Store ID required');

    const updated = await this.prisma.loyaltyRewardRedemption.update({
      where: { id },
      data: {
        status: 'DELIVERED',
        deliveredAt: new Date(),
      },
    });

    try {
      this.eventsGateway.server.emit('loyalty.refresh', { storeId, redemptionId: id });
      this.eventsGateway.server.emit('loyalty.reward_delivered', { storeId, redemptionId: id });
    } catch (wsErr) {
      this.logger.error('[Loyalty] Erro ao emitir evento de brinde entregue via socket', wsErr);
    }

    return updated;
  }

  /**
   * Marcar brinde como entregue automaticamente quando o pedido for concluído/entregue
   */
  async markRedemptionDeliveredByOrderId(orderId: string) {
    try {
      const res = await this.prisma.loyaltyRewardRedemption.updateMany({
        where: {
          orderId,
          status: 'PENDING_DELIVERY',
        },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
        },
      });

      if (res.count > 0) {
        this.eventsGateway.server.emit('loyalty.refresh', { orderId });
        this.eventsGateway.server.emit('loyalty.reward_delivered', { orderId });
      }
    } catch (err) {
      this.logger.error(`[Loyalty] Erro ao marcar brinde como entregue para pedido ${orderId}:`, err);
    }
  }

  /**
   * Listar resgates de brindes (para a aba de pendentes no Admin)
   */
  async listRedemptions(status?: string) {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) return [];

    return this.prisma.loyaltyRewardRedemption.findMany({
      where: {
        storeId,
        ...(status && status !== 'ALL' ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            orderNumber: true,
            totalOrder: true,
            status: true,
          },
        },
      },
    });
  }

  /**
   * Ajuste manual de selos pelo painel Admin
   */
  async manualAdjust(dto: ManualAdjustStampDto) {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) throw new Error('Store ID required');

    const cleanPhone = this.cleanPhone(dto.customerPhone);
    const program = await this.getProgram();

    let card = await this.prisma.loyaltyCard.findUnique({
      where: {
        storeId_customerPhone: {
          storeId,
          customerPhone: cleanPhone,
        },
      },
    });

    const now = new Date();
    const newExpiresAt = this.calculateExpirationDate(program?.validityDays || 30, now);

    if (!card) {
      const newStamps = Math.max(0, dto.stampsCount);
      const isCompleted = newStamps >= (program?.stampsRequired || 10);

      card = await this.prisma.loyaltyCard.create({
        data: {
          storeId,
          customerPhone: cleanPhone,
          customerName: dto.customerName,
          currentStamps: newStamps,
          totalCompleted: isCompleted ? 1 : 0,
          startedAt: now,
          expiresAt: newExpiresAt,
          status: isCompleted ? 'COMPLETED' : 'ACTIVE',
        },
      });
    } else {
      const newStamps = Math.max(0, card.currentStamps + dto.stampsCount);
      const isCompleted = newStamps >= (program?.stampsRequired || 10);

      card = await this.prisma.loyaltyCard.update({
        where: { id: card.id },
        data: {
          currentStamps: newStamps,
          customerName: dto.customerName || card.customerName,
          status: isCompleted ? 'COMPLETED' : 'ACTIVE',
          startedAt: card.startedAt || now,
          expiresAt: card.expiresAt || newExpiresAt,
        },
      });
    }

    await this.prisma.loyaltyTransaction.create({
      data: {
        storeId,
        loyaltyCardId: card.id,
        type: 'MANUAL_ADJUST',
        stampsCount: dto.stampsCount,
        description: dto.reason || 'Ajuste manual de selos realizado pelo administrador',
      },
    });

    try {
      this.eventsGateway.server.emit('loyalty.card_updated', {
        storeId,
        cardId: card.id,
        customerPhone: cleanPhone,
      });
      this.eventsGateway.server.emit('loyalty.refresh', { storeId });
    } catch (wsErr) {
      this.logger.error('[Loyalty] Erro ao emitir evento de ajuste de selos via socket', wsErr);
    }

    return card;
  }

  /**
   * Listagem de cartões de fidelidade para o painel Admin
   */
  async listCards(query?: { search?: string; status?: string; page?: number; limit?: number }) {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) return { data: [], total: 0 };

    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = { storeId };

    if (query?.status && query.status !== 'ALL') {
      where.status = query.status;
    }

    if (query?.search) {
      const s = query.search.trim();
      const numOnly = s.replace(/\D/g, '');
      where.OR = [
        { customerName: { contains: s, mode: 'insensitive' } },
        ...(numOnly ? [{ customerPhone: { contains: numOnly } }] : [{ customerPhone: { contains: s } }]),
      ];
    }

    const [total, data, program, pendingRedemptionsCount] = await Promise.all([
      this.prisma.loyaltyCard.count({ where }),
      this.prisma.loyaltyCard.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        include: {
          transactions: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          redemptions: {
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      this.getProgram(),
      this.prisma.loyaltyRewardRedemption.count({
        where: { storeId, status: 'PENDING_DELIVERY' },
      }),
    ]);

    // Assegura que totalCompleted reflita fielmente o histórico de resgates efetivados (DELIVERED)
    const enrichedData = data.map((card) => {
      const deliveredCount = Array.isArray(card.redemptions)
        ? card.redemptions.filter((r) => r.status === 'DELIVERED').length
        : 0;
      const effectiveTotalCompleted = deliveredCount > 0 ? deliveredCount : (card.totalCompleted || 0);
      return {
        ...card,
        totalCompleted: effectiveTotalCompleted,
      };
    });

    return {
      data: enrichedData,
      total,
      page,
      limit,
      program,
      pendingRedemptionsCount,
    };
  }
}
