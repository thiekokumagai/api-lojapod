import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CartItemSummary, phoneKey, summarizeItems } from './cart-contact';

/** Minutos parado para o carrinho com contato entrar na lista. */
export const ABANDONED_AFTER_MINUTES = 10;
/** Dias sem atividade até o contato (nome e telefone) ser apagado. */
export const CONTACT_RETENTION_DAYS = 30;

const MAX_LIST_SIZE = 200;
const MAX_DRAFTS_READ = 500;

export interface AbandonedCartView {
  id: string;
  customerName: string;
  /**
   * Telefone completo, só dígitos (DDD + número). Só chega a quem tem a permissão
   * `abandoned_carts` (controller) e só dos carrinhos da loja logada.
   */
  customerPhone: string;
  items: CartItemSummary[];
  /** Estimativa: o valor vem do navegador do cliente. */
  totalEstimated: number;
  updatedAt: Date;
  contactedAt: Date | null;
}

@Injectable()
export class AbandonedCartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  /**
   * Carrinhos da loja com contato, parados há mais de 10 minutos (ou já chamados) e que não viraram pedido.
   * Quem comprou depois (pedido com o mesmo telefone, não cancelado) sai da lista.
   */
  async list(now: Date = new Date()): Promise<AbandonedCartView[]> {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) return [];

    const idleBefore = new Date(
      now.getTime() - ABANDONED_AFTER_MINUTES * 60 * 1000,
    );
    const keepAfter = new Date(
      now.getTime() - CONTACT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    const drafts = await this.prisma.cartDraft.findMany({
      where: {
        storeId,
        customerPhone: { not: null },
        OR: [
          { updatedAt: { lt: idleBefore, gte: keepAfter } },
          // Já chamado: continua na lista mesmo que o cliente volte a mexer no carrinho
          { contactedAt: { not: null }, updatedAt: { gte: keepAfter } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: MAX_DRAFTS_READ,
    });
    if (drafts.length === 0) return [];

    // "Chamado" vale para o telefone: se o cliente voltou em outra sessão (outro carrinho),
    // ele não reaparece como "para chamar"
    const lastContactByPhone = new Map<string, Date>();
    for (const d of drafts) {
      const key = phoneKey(d.customerPhone);
      if (!key || !d.contactedAt) continue;
      const known = lastContactByPhone.get(key);
      if (!known || d.contactedAt > known)
        lastContactByPhone.set(key, d.contactedAt);
    }

    const since = drafts.reduce((oldest, d) => {
      const captured = d.contactCapturedAt ?? d.createdAt;
      return captured < oldest ? captured : oldest;
    }, drafts[0].contactCapturedAt ?? drafts[0].createdAt);
    const orders = await this.prisma.order.findMany({
      where: {
        storeId,
        createdAt: { gte: since },
        status: { not: 'CANCELLED' },
      },
      select: { customerPhone: true, createdAt: true },
    });

    const seenPhones = new Set<string>();
    const result: AbandonedCartView[] = [];

    for (const draft of drafts) {
      const phone = draft.customerPhone ?? '';
      const key = phoneKey(phone);
      if (!key || seenPhones.has(key)) continue; // um carrinho por telefone: o mais recente

      const capturedAt = draft.contactCapturedAt ?? draft.createdAt;
      const alreadyBought = orders.some(
        (order) =>
          order.createdAt >= capturedAt &&
          phoneKey(order.customerPhone) === key,
      );
      if (alreadyBought) continue;

      seenPhones.add(key);
      result.push({
        id: draft.id,
        customerName: draft.customerName ?? '',
        customerPhone: phone,
        items: summarizeItems(draft.cartItems),
        totalEstimated: Number(draft.totalAmount),
        updatedAt: draft.updatedAt,
        contactedAt: lastContactByPhone.get(key) ?? null,
      });
      if (result.length >= MAX_LIST_SIZE) break;
    }

    return result;
  }

  /** Marca o carrinho como chamado e devolve o número inteiro para abrir o WhatsApp. */
  async markContacted(id: string): Promise<{ name: string; phone: string }> {
    const storeId = this.requireStoreId();

    const draft = await this.prisma.cartDraft.findFirst({
      where: { id, storeId, customerPhone: { not: null } },
      select: { customerName: true, customerPhone: true, updatedAt: true },
    });
    if (!draft?.customerPhone) {
      throw new NotFoundException('Carrinho não encontrado.');
    }

    // Marca como chamado SEM mexer em `updatedAt` (o Prisma o atualizaria sozinho): os 10 minutos
    // parado e os 30 dias de retenção medem a atividade do carrinho, não o clique.
    const contactedAt = new Date();
    const { count } = await this.prisma.cartDraft.updateMany({
      where: { id, storeId, updatedAt: draft.updatedAt },
      data: { contactedAt, updatedAt: draft.updatedAt },
    });
    if (count === 0) {
      // O cliente mexeu no carrinho entre a leitura e a gravação: o novo `updatedAt` é real
      await this.prisma.cartDraft.updateMany({
        where: { id, storeId },
        data: { contactedAt },
      });
    }

    return { name: draft.customerName ?? '', phone: draft.customerPhone };
  }

  /** Tira o carrinho da lista apagando o contato (o carrinho anônimo continua nas métricas). */
  async dismiss(id: string): Promise<void> {
    const storeId = this.requireStoreId();

    const { count } = await this.prisma.cartDraft.updateMany({
      where: { id, storeId },
      data: {
        customerName: null,
        customerPhone: null,
        contactCapturedAt: null,
        contactedAt: null,
      },
    });
    if (count === 0) throw new NotFoundException('Carrinho não encontrado.');
  }

  /** Apaga o contato de carrinhos sem atividade há mais de 30 dias (todas as lojas). */
  async wipeExpiredContacts(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - CONTACT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    const { count } = await this.prisma.cartDraft.updateMany({
      where: { updatedAt: { lt: cutoff }, customerPhone: { not: null } },
      data: {
        customerName: null,
        customerPhone: null,
        contactCapturedAt: null,
        contactedAt: null,
      },
    });
    return count;
  }

  private requireStoreId(): string {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) throw new NotFoundException('Carrinho não encontrado.');
    return storeId;
  }
}
