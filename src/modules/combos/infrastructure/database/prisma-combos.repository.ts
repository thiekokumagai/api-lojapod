import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { TenantContextService } from '../../../tenant/tenant-context.service';
import { ICombosRepository, ComboFilters } from '../../domain/repositories/icombos.repository';
import { Combo, ComboItemEntity } from '../../domain/entities/combo.entity';

@Injectable()
export class PrismaCombosRepository implements ICombosRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  private mapToEntity(record: any): Combo {
    let originalPrice = 0;
    let minComboStock = 999999;

    const items: ComboItemEntity[] = (record.items || []).map((ci: any) => {
      const p = ci.product;
      const pi = ci.productItem;
      const promo = p?.promotionalPrice ? Number(p.promotionalPrice) : 0;
      const normal = p?.price ? Number(p.price) : 0;
      const productPrice = promo > 0 ? promo : normal;
      originalPrice += productPrice * ci.quantity;

      // Calcular estoque disponível para este item específico
      let itemStock = 0;
      if (pi) {
        itemStock = pi.stock ?? 0;
      } else if (p && p.items && p.items.length > 0) {
        // Se não tiver productItemId específico, pega a soma ou o item correspondente
        itemStock = p.items.reduce((sum: number, it: any) => sum + (it.stock ?? 0), 0);
      }

      const availableCombosForThisItem = ci.quantity > 0 ? Math.floor(itemStock / ci.quantity) : 0;
      if (availableCombosForThisItem < minComboStock) {
        minComboStock = availableCombosForThisItem;
      }

      let mainImg = null;
      if (p?.images && p.images.length > 0) {
        const foundMain = p.images.find((img: any) => img.isMain) || p.images[0];
        mainImg = foundMain.url;
      }

      return {
        id: ci.id,
        comboId: ci.comboId,
        productId: ci.productId,
        productItemId: ci.productItemId,
        quantity: ci.quantity,
        variation: ci.variation,
        productName: p?.title || 'Produto',
        productPrice,
        productCostPrice: p?.costPrice ? Number(p.costPrice) : 0,
        productImage: mainImg,
        currentStock: itemStock,
      };
    });

    if (items.length === 0) {
      minComboStock = 0;
    }

    // Se tiver limite total de vendas, não pode ultrapassar
    if (record.maxTotalSales !== null && record.maxTotalSales !== undefined) {
      const remainingSales = Math.max(0, record.maxTotalSales - (record.totalSold || 0));
      minComboStock = Math.min(minComboStock, remainingSales);
    }

    const price = Number(record.price);
    let discountPercentage = 0;
    if (originalPrice > price && originalPrice > 0) {
      discountPercentage = Math.round(((originalPrice - price) / originalPrice) * 100);
    }

    return new Combo({
      id: record.id,
      storeId: record.storeId,
      name: record.name,
      description: record.description,
      imageUrl: record.imageUrl,
      categoryId: record.categoryId,
      price,
      isActive: record.isActive,
      startDate: record.startDate,
      endDate: record.endDate,
      maxPerOrder: record.maxPerOrder,
      maxTotalSales: record.maxTotalSales,
      totalSold: record.totalSold || 0,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      items,
      categoryTitle: record.category?.title || null,
      originalPrice,
      discountPercentage,
      stock: minComboStock,
    });
  }

  async create(
    combo: Partial<Combo>,
    items: Array<{ productId: string; productItemId?: string | null; quantity: number; variation?: string | null }>,
  ): Promise<Combo> {
    const storeId = this.tenantContextService.getStoreId() || combo.storeId;
    if (!storeId) {
      throw new BadRequestException('storeId não informado no contexto.');
    }

    // Validar se todos os produtos pertencem à mesma loja
    const productIds = items.map((i) => i.productId);
    const count = await this.prisma.product.count({
      where: {
        id: { in: productIds },
        storeId,
      },
    });

    if (count !== productIds.length) {
      throw new BadRequestException('Todos os produtos do combo devem pertencer à sua loja.');
    }

    const record = await this.prisma.combo.create({
      data: {
        storeId,
        name: combo.name!,
        description: combo.description,
        imageUrl: combo.imageUrl,
        categoryId: combo.categoryId || null,
        price: combo.price!,
        isActive: combo.isActive ?? true,
        startDate: combo.startDate ? new Date(combo.startDate) : null,
        endDate: combo.endDate ? new Date(combo.endDate) : null,
        maxPerOrder: combo.maxPerOrder,
        maxTotalSales: combo.maxTotalSales,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            productItemId: item.productItemId || null,
            quantity: item.quantity,
            variation: item.variation || null,
          })),
        },
      },
      include: {
        category: true,
        items: {
          include: {
            product: {
              include: {
                images: true,
                items: true,
              },
            },
            productItem: true,
          },
        },
      },
    });

    return this.mapToEntity(record);
  }

  async update(
    id: string,
    combo: Partial<Combo>,
    items?: Array<{ productId: string; productItemId?: string | null; quantity: number; variation?: string | null }>,
  ): Promise<Combo> {
    const storeId = this.tenantContextService.getStoreId();
    const existing = await this.prisma.combo.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!existing || (storeId && existing.storeId !== storeId)) {
      throw new NotFoundException('Combo não encontrado.');
    }

    if (items) {
      const productIds = items.map((i) => i.productId);
      const count = await this.prisma.product.count({
        where: {
          id: { in: productIds },
          storeId: existing.storeId,
        },
      });

      if (count !== productIds.length) {
        throw new BadRequestException('Todos os produtos do combo devem pertencer à sua loja.');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (items) {
        await tx.comboItem.deleteMany({
          where: { comboId: id },
        });

        await tx.comboItem.createMany({
          data: items.map((item) => ({
            comboId: id,
            productId: item.productId,
            productItemId: item.productItemId || null,
            quantity: item.quantity,
            variation: item.variation || null,
          })),
        });
      }

      const updateData: any = {};
      if (combo.name !== undefined) updateData.name = combo.name;
      if (combo.description !== undefined) updateData.description = combo.description;
      if (combo.imageUrl !== undefined) updateData.imageUrl = combo.imageUrl;
      if (combo.categoryId !== undefined) updateData.categoryId = combo.categoryId || null;
      if (combo.price !== undefined) updateData.price = combo.price;
      if (combo.isActive !== undefined) updateData.isActive = combo.isActive;
      if (combo.startDate !== undefined) updateData.startDate = combo.startDate ? new Date(combo.startDate) : null;
      if (combo.endDate !== undefined) updateData.endDate = combo.endDate ? new Date(combo.endDate) : null;
      if (combo.maxPerOrder !== undefined) updateData.maxPerOrder = combo.maxPerOrder;
      if (combo.maxTotalSales !== undefined) updateData.maxTotalSales = combo.maxTotalSales;

      return tx.combo.update({
        where: { id },
        data: updateData,
        include: {
          category: true,
          items: {
            include: {
              product: {
                include: {
                  images: true,
                  items: true,
                },
              },
              productItem: true,
            },
          },
        },
      });
    });

    return this.mapToEntity(updated);
  }

  async delete(id: string): Promise<void> {
    const storeId = this.tenantContextService.getStoreId();
    const existing = await this.prisma.combo.findUnique({
      where: { id },
    });

    if (!existing || (storeId && existing.storeId !== storeId)) {
      throw new NotFoundException('Combo não encontrado.');
    }

    // Como OrderItem possui relação com onDelete: SetNull, pedidos anteriores não serão quebrados
    await this.prisma.combo.delete({
      where: { id },
    });
  }

  async findById(id: string): Promise<Combo | null> {
    const storeId = this.tenantContextService.getStoreId();
    const record = await this.prisma.combo.findUnique({
      where: { id },
      include: {
        category: true,
        items: {
          include: {
            product: {
              include: {
                images: true,
                items: true,
              },
            },
            productItem: true,
          },
        },
      },
    });

    if (!record) return null;
    if (storeId && record.storeId !== storeId) return null;

    return this.mapToEntity(record);
  }

  async findMany(filters: ComboFilters): Promise<Combo[]> {
    const storeId = this.tenantContextService.getStoreId();
    const where: any = {};
    if (storeId) {
      where.storeId = storeId;
    }

    if (filters.search) {
      where.name = { contains: filters.search, mode: 'insensitive' };
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }

    const records = await this.prisma.combo.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        category: true,
        items: {
          include: {
            product: {
              include: {
                images: true,
                items: true,
              },
            },
            productItem: true,
          },
        },
      },
    });

    return records.map((r) => this.mapToEntity(r));
  }

  async findStoreCombos(): Promise<Combo[]> {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) return [];

    const now = new Date();

    const records = await this.prisma.combo.findMany({
      where: {
        storeId,
        isActive: true,
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: now } }] },
          { OR: [{ endDate: null }, { endDate: { gte: now } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        category: true,
        items: {
          include: {
            product: {
              include: {
                images: true,
                items: true,
              },
            },
            productItem: true,
          },
        },
      },
    });

    // Mapeia e filtra apenas os que ainda possuem estoque disponível
    return records
      .map((r) => this.mapToEntity(r))
      .filter((combo) => (combo.stock ?? 0) > 0);
  }

  async incrementTotalSold(id: string, quantity: number): Promise<void> {
    await this.prisma.combo.update({
      where: { id },
      data: {
        totalSold: { increment: quantity },
      },
    });
  }
}
