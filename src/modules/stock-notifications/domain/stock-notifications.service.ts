import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { CreateStockNotificationDto } from '../infrastructure/dtos/create-stock-notification.dto';

@Injectable()
export class StockNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async createForStore(dto: CreateStockNotificationDto) {
    const storeId = this.tenantContextService.getStoreId();

    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: { id: true, storeId: true },
    });

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    const effectiveStoreId = storeId || product.storeId;

    // Check if store allows stock notifications
    if (effectiveStoreId) {
      const settings = await this.prisma.storeSettings.findFirst({
        where: { storeId: effectiveStoreId },
        select: { enableStockAlertNotification: true },
      });
      if (settings && settings.enableStockAlertNotification === false) {
        throw new BadRequestException('Avisos de estoque desativados para esta loja');
      }
    }

    const notification = await this.prisma.stockNotificationRequest.create({
      data: {
        storeId: effectiveStoreId,
        productId: dto.productId,
        productItemId: dto.productItemId || null,
        customerName: dto.customerName.trim(),
        customerPhone: dto.customerPhone.trim(),
        status: 'PENDING',
      },
      include: {
        product: {
          select: { id: true, title: true, images: { take: 1, select: { url: true } } },
        },
        productItem: {
          include: {
            options: {
              include: {
                option: {
                  include: {
                    variation: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return notification;
  }

  async listAllForAdmin(filters?: { status?: string; productId?: string }) {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) {
      throw new BadRequestException('Contexto de loja não informado');
    }

    const where: any = { storeId };
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.productId) {
      where.productId = filters.productId;
    }

    const records = await this.prisma.stockNotificationRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            isVisible: true,
            images: { take: 1, select: { url: true } },
            items: {
              select: {
                id: true,
                stock: true,
              },
            },
          },
        },
        productItem: {
          include: {
            options: {
              include: {
                option: {
                  include: {
                    variation: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return records.map((record) => {
      let currentStock = 0;
      if (record.productItem) {
        currentStock = record.productItem.stock;
      } else if (record.product?.items) {
        currentStock = record.product.items.reduce((acc, curr) => acc + curr.stock, 0);
      }

      const variationName = record.productItem?.options
        ?.map((opt) => opt.option.value)
        .join(' / ') || null;

      return {
        id: record.id,
        storeId: record.storeId,
        productId: record.productId,
        productTitle: record.product.title,
        productImage: record.product.images?.[0]?.url || null,
        productItemId: record.productItemId,
        variationName,
        customerName: record.customerName,
        customerPhone: record.customerPhone,
        status: record.status,
        notifiedAt: record.notifiedAt,
        createdAt: record.createdAt,
        currentStock,
        isAvailable: currentStock > 0,
      };
    });
  }

  async markAsNotified(id: string) {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) {
      throw new BadRequestException('Contexto de loja não informado');
    }

    const notification = await this.prisma.stockNotificationRequest.findFirst({
      where: { id, storeId },
    });

    if (!notification) {
      throw new NotFoundException('Solicitação não encontrada');
    }

    return this.prisma.stockNotificationRequest.update({
      where: { id },
      data: {
        status: 'NOTIFIED',
        notifiedAt: new Date(),
      },
    });
  }

  async delete(id: string) {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) {
      throw new BadRequestException('Contexto de loja não informado');
    }

    const notification = await this.prisma.stockNotificationRequest.findFirst({
      where: { id, storeId },
    });

    if (!notification) {
      throw new NotFoundException('Solicitação não encontrada');
    }

    return this.prisma.stockNotificationRequest.delete({
      where: { id },
    });
  }
}
