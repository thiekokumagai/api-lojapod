import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { normalizeName, normalizePhone } from './cart-contact';
import { SlidingWindowLimiter } from './sliding-window-limiter';

/** Carrinhos maiores que isso não são gravados (o JSON vem do navegador). */
const MAX_CART_ITEMS = 100;

@Injectable()
export class AnalyticsService {
  // Freio do endpoint público de contato: por sessão e por telefone (em memória, por instância)
  private readonly contactBySession = new SlidingWindowLimiter(
    60,
    60 * 60 * 1000,
  );
  private readonly contactByPhone = new SlidingWindowLimiter(
    30,
    60 * 60 * 1000,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService
  ) {}

  /**
   * Registra a sessão da loja atual. Devolve `null` (sem gravar nada) quando a loja não foi
   * identificada ou quando o `sessionId` já pertence a outra loja: uma sessão nunca muda de loja.
   */
  async trackSession(sessionId: string) {
    const now = new Date();
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) return null;

    // findUnique não passa pelo filtro automático de loja, então enxerga o dono real da sessão
    const owner = await this.prisma.storeSession.findUnique({
      where: { sessionId },
      select: { storeId: true },
    });
    if (owner?.storeId && owner.storeId !== storeId) return null;

    const session = await this.prisma.storeSession.upsert({
      where: { sessionId },
      create: { sessionId, startedAt: now, lastHeartbeatAt: now, storeId },
      update: { lastHeartbeatAt: now, storeId }
    });

    const diffSeconds = Math.floor((now.getTime() - session.startedAt.getTime()) / 1000);
    
    if (session.durationSeconds !== diffSeconds) {
      return this.prisma.storeSession.update({
        where: { sessionId },
        data: { durationSeconds: diffSeconds }
      });
    }

    return session;
  }

  async trackCart(sessionId: string, cartItems: any[], totalAmount: number) {
    // O rascunho é da loja dona da sessão: sessão de outra loja ou sem loja não grava nem apaga nada
    const session = await this.trackSession(sessionId);
    if (!session) return;
    if (
      cartItems !== undefined &&
      cartItems !== null &&
      (!Array.isArray(cartItems) || cartItems.length > MAX_CART_ITEMS)
    ) {
      return;
    }
    const storeId = this.tenantContextService.getStoreId();

    if (!cartItems || cartItems.length === 0) {
      const existing = await this.prisma.cartDraft.findUnique({ where: { sessionId } });
      if (existing) {
        await this.prisma.cartDraft.delete({ where: { sessionId } });
      }
      return;
    }

    return this.prisma.cartDraft.upsert({
      where: { sessionId },
      create: {
        sessionId,
        cartItems: cartItems as any,
        totalAmount,
        storeId
      },
      update: {
        cartItems: cartItems as any,
        totalAmount,
        storeId
      }
    });
  }

  /**
   * Guarda nome e telefone que o cliente informou no checkout no carrinho (rascunho) da sessão,
   * para a loja chamar no WhatsApp. Nunca revela o resultado: quem chama sempre recebe o mesmo retorno.
   * Não grava nada sem loja identificada, de sessão de outra loja, sem carrinho ou acima do limite.
   */
  async saveContact(
    sessionId: string,
    name: string,
    phone: string,
  ): Promise<void> {
    const cleanName = normalizeName(name);
    const digits = normalizePhone(phone);
    if (!cleanName || !digits) return;

    if (
      !this.contactBySession.allow(`s:${sessionId}`) ||
      !this.contactByPhone.allow(`p:${digits}`)
    ) {
      return;
    }

    const session = await this.trackSession(sessionId);
    if (!session) return;
    const storeId = this.tenantContextService.getStoreId();

    // findUnique não passa pelo filtro de loja; confere o dono do rascunho
    const draft = await this.prisma.cartDraft.findUnique({
      where: { sessionId },
      select: { storeId: true, customerName: true, customerPhone: true },
    });
    if (!draft) return;
    if (draft.storeId && draft.storeId !== storeId) return;
    if (draft.customerName === cleanName && draft.customerPhone === digits) {
      return;
    }

    await this.prisma.cartDraft.update({
      where: { sessionId },
      data: {
        storeId,
        customerName: cleanName,
        customerPhone: digits,
        contactCapturedAt: new Date(),
        // Telefone novo no mesmo carrinho: volta a ser um contato ainda não chamado
        ...(draft.customerPhone !== digits && { contactedAt: null }),
      },
    });
  }
}
