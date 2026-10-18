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

  private static readonly PRODUCT_INCLUDE = {
    category: true,
    images: true,
    variations: {
      include: {
        variation: {
          include: {
            options: {
              orderBy: { value: 'asc' as const },
            },
          },
        },
      },
    },
    items: {
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
  };

  private static readonly COMBO_INCLUDE = {
    category: true,
    items: {
      include: {
        product: {
          include: PrismaCombosRepository.PRODUCT_INCLUDE,
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
    },
  };

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
        // Se não tiver productItemId específico, pega a soma de estoque das variações
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
        product: p,
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

  /**
   * Valida as regras de negócio de produtos e variações do combo:
   * 1. Todos os produtos existem e pertencem à loja
   * 2. Se o combo for ativo:
   *    - Nenhum produto pode estar invisível (isVisible: false) ou deletado
   *    - Se productItemId for especificado: deve pertencer ao produto e ter estoque > 0
   *    - Se productItemId for nulo mas produto possui variações: produto deve ter pelo menos uma variação com estoque > 0
   */
  private async validateComboItems(
    storeId: string,
    items: Array<{ productId: string; productItemId?: string | null; quantity: number; variation?: string | null }>,
    isActive: boolean,
  ): Promise<void> {
    const productIds = items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        storeId,
        deletedAt: null,
      },
      include: {
        items: true,
      },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('Todos os produtos do combo devem existir e pertencer à sua loja.');
    }

    // Validar se cada productItemId especificado realmente pertence ao respectivo productId
    for (const item of items) {
      const prod = products.find((p) => p.id === item.productId);
      if (!prod) continue;

      if (item.productItemId) {
        const itemBelongs = prod.items.some((pi) => pi.id === item.productItemId);
        if (!itemBelongs) {
          throw new BadRequestException(
            `A variação selecionada não pertence ao produto "${prod.title}".`,
          );
        }
      }
    }

    // Se o combo estiver sendo ativado, valida disponibilidade de todos os produtos e variações
    if (isActive) {
      for (const item of items) {
        const prod = products.find((p) => p.id === item.productId);
        if (!prod || prod.isVisible === false) {
          throw new BadRequestException(
            `O produto "${prod?.title || item.productId}" está desativado. Não é possível ativar o combo.`,
          );
        }

        if (item.productItemId) {
          const pi = prod.items.find((pItem) => pItem.id === item.productItemId);
          if (!pi || (pi.stock ?? 0) < item.quantity) {
            throw new BadRequestException(
              `A variação específica de "${prod.title}" não possui estoque suficiente. Não é possível ativar o combo.`,
            );
          }
        } else if (prod.items && prod.items.length > 0) {
          const hasAvailableVariation = prod.items.some((pItem) => (pItem.stock ?? 0) >= item.quantity);
          if (!hasAvailableVariation) {
            throw new BadRequestException(
              `O produto "${prod.title}" não possui nenhuma variação com estoque suficiente disponível. Não é possível ativar o combo.`,
            );
          }
        }
      }
    }
  }

  async create(
    combo: Partial<Combo>,
    items: Array<{ productId: string; productItemId?: string | null; quantity: number; variation?: string | null }>,
  ): Promise<Combo> {
    const storeId = this.tenantContextService.getStoreId() || combo.storeId;
    if (!storeId) {
      throw new BadRequestException('storeId não informado no contexto.');
    }

    const isActive = combo.isActive ?? true;
    await this.validateComboItems(storeId, items, isActive);

    const record = await this.prisma.combo.create({
      data: {
        storeId,
        name: combo.name!,
        description: combo.description,
        imageUrl: combo.imageUrl,
        categoryId: combo.categoryId || null,
        price: combo.price!,
        isActive,
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
      include: PrismaCombosRepository.COMBO_INCLUDE,
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

    const targetIsActive = combo.isActive !== undefined ? combo.isActive : existing.isActive;
    const targetItems = items || existing.items.map((i) => ({
      productId: i.productId,
      productItemId: i.productItemId,
      quantity: i.quantity,
      variation: i.variation,
    }));

    await this.validateComboItems(existing.storeId, targetItems, targetIsActive);

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
        include: PrismaCombosRepository.COMBO_INCLUDE,
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
      include: PrismaCombosRepository.COMBO_INCLUDE,
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
      include: PrismaCombosRepository.COMBO_INCLUDE,
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
      include: PrismaCombosRepository.COMBO_INCLUDE,
    });

    // Mapeia e retorna os combos com estoque calculado (inclusive combos com stock 0 para permitir avise-me)
    return records.map((r) => this.mapToEntity(r));
  }

  async incrementTotalSold(id: string, quantity: number): Promise<void> {
    await this.prisma.combo.update({
      where: { id },
      data: {
        totalSold: { increment: quantity },
      },
    });
  }

  /**
   * Desativação automática de combos afetados pela desativação, exclusão ou esgotamento
   * de um produto ou de suas variações vinculadas.
   * Conforme especificação:
   * 1. Respeita a configuração `autoHideOutOfStock`:
   *    - Se autoHideOutOfStock for false: NÃO desativa o combo por simples falta de estoque.
   *      O combo permanece ativo para permitir "Avise-me quando chegar", mas bloqueia venda.
   *    - Se um produto obrigatório for explicitamente desativado (isVisible: false) ou deletado,
   *      o combo continua sendo desativado.
   * 2. Quando autoHideOutOfStock for true (ou default):
   *    - Se um produto obrigatório estiver desativado/deletado -> combo é desativado
   *    - Se uma variação específica vinculada estiver desativada/zerada -> combo é desativado
   *    - Se um produto com variação aberta não tiver nenhuma variação disponível -> combo é desativado
   * 3. Reativação NÃO é automática (manual pelo lojista).
   */
  async checkAndDeactivateAffectedCombos(productId: string): Promise<void> {
    const affectedCombos = await this.prisma.combo.findMany({
      where: {
        isActive: true,
        items: {
          some: { productId },
        },
      },
      include: PrismaCombosRepository.COMBO_INCLUDE,
    });

    if (affectedCombos.length === 0) return;

    for (const combo of affectedCombos) {
      let shouldDeactivate = false;

      // Verifica configuração da loja para autoHideOutOfStock
      let autoHide = true;
      if (combo.storeId) {
        const settings = await this.prisma.storeSettings.findFirst({
          where: { storeId: combo.storeId },
          select: { autoHideOutOfStock: true },
        });
        if (settings && settings.autoHideOutOfStock === false) {
          autoHide = false;
        }
      }

      for (const item of combo.items) {
        const prod = item.product;
        // Produto desativado ou deletado: SEMPRE desativa o combo
        if (!prod || prod.isVisible === false || prod.deletedAt !== null) {
          shouldDeactivate = true;
          break;
        }

        // Se autoHide estiver desabilitado, não desativa o combo apenas por falta de estoque
        if (!autoHide) {
          continue;
        }

        if (item.productItemId) {
          // Variação específica vinculada ao combo
          const pi = prod.items?.find((pItem: any) => pItem.id === item.productItemId);
          if (!pi || (pi.stock ?? 0) < item.quantity) {
            shouldDeactivate = true;
            break;
          }
        } else if (prod.items && prod.items.length > 0) {
          // Variação aberta: precisa de pelo menos uma variação com estoque disponível
          const hasAvailable = prod.items.some((pItem: any) => (pItem.stock ?? 0) >= item.quantity);
          if (!hasAvailable) {
            shouldDeactivate = true;
            break;
          }
        } else {
          // Produto simples sem itens com estoque
          const totalStock = (prod.items || []).reduce((sum: number, itm: any) => sum + (itm.stock ?? 0), 0);
          if (totalStock < item.quantity) {
            shouldDeactivate = true;
            break;
          }
        }
      }

      if (shouldDeactivate) {
        await this.prisma.combo.update({
          where: { id: combo.id },
          data: { isActive: false },
        });
      }
    }
  }
}
