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

    // Evita duplicidade
    const existingTx = await this.prisma.loyaltyTransaction.findFirst({
      where: {
        storeId: order.storeId,
        orderId: order.id,
      },
    });

    if (existingTx) {
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
      const newStamps = card.currentStamps + 1;
      const newPoints = Number(card.pointsBalance) + pointsToAdd;
      const newCashback = Number(card.cashbackBalance) + cashbackToAdd;
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
          startedAt: card.startedAt || now,
          expiresAt: card.expiresAt || newExpiresAt,
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

    let updated;
    if (isPointsDiscount) {
      // Zera o saldo de pontos utilizado e incrementa contador de resgates
      updated = await this.prisma.loyaltyCard.update({
        where: { id: card.id },
        data: {
          pointsBalance: 0,
          totalCompleted: card.totalCompleted + 1,
        },
      });

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
      // Zera o saldo de cashback utilizado e incrementa contador de resgates
      updated = await this.prisma.loyaltyCard.update({
        where: { id: card.id },
        data: {
          cashbackBalance: 0,
          totalCompleted: card.totalCompleted + 1,
        },
      });

      await this.prisma.loyaltyTransaction.create({
        data: {
          storeId,
          loyaltyCardId: card.id,
          type: 'USE_CASHBACK',
          cashbackAmount: card.cashbackBalance,
          description: `Saldo de cashback resgatado: ${rewardTitle}`,
        },
      });
    } else {
      // Atualiza cartão para resgatado, incrementa resgates e zera os selos para um novo ciclo (brinde)
      updated = await this.prisma.loyaltyCard.update({
        where: { id: card.id },
        data: {
          status: 'REDEEMED',
          currentStamps: 0,
          totalCompleted: card.totalCompleted + 1,
          startedAt: null,
          expiresAt: null,
        },
      });

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
   * Marcar brinde como entregue pelo admin
   */
  async markRedemptionDelivered(id: string) {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) throw new Error('Store ID required');

    return this.prisma.loyaltyRewardRedemption.update({
      where: { id },
      data: {
        status: 'DELIVERED',
        deliveredAt: new Date(),
      },
    });
  }

  /**
   * Marcar brinde como entregue automaticamente quando o pedido for concluído/entregue
   */
  async markRedemptionDeliveredByOrderId(orderId: string) {
    try {
      await this.prisma.loyaltyRewardRedemption.updateMany({
        where: {
          orderId,
          status: 'PENDING_DELIVERY',
        },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
        },
      });
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

    // Assegura que totalCompleted reflita fielmente o histórico de resgates se houver
    const enrichedData = data.map((card) => {
      const redemptionsCount = Array.isArray(card.redemptions) ? card.redemptions.length : 0;
      const effectiveTotalCompleted = Math.max(card.totalCompleted || 0, redemptionsCount);
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
