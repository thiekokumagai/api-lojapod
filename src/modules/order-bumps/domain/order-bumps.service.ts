import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { CreateOrderBumpDto } from '../dto/create-order-bump.dto';
import { UpdateOrderBumpDto } from '../dto/update-order-bump.dto';
import { GetOrderBumpSuggestionsDto } from '../dto/get-order-bump-suggestions.dto';

@Injectable()
export class OrderBumpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  private getStoreId(): string {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) {
      throw new BadRequestException('Contexto de loja não informado');
    }
    return storeId;
  }

  /**
   * Listar todas as regras de Order Bump para o painel admin
   */
  async listAllForAdmin() {
    const storeId = this.getStoreId();

    return (this.prisma as any).orderBump.findMany({
      where: { storeId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: {
        triggerProduct: {
          select: {
            id: true,
            title: true,
            price: true,
            images: { take: 1, select: { url: true } },
          },
        },
        triggerCategory: {
          select: {
            id: true,
            title: true,
          },
        },
        suggestedProduct: {
          select: {
            id: true,
            title: true,
            price: true,
            promotionalPrice: true,
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
      },
    });
  }

  /**
   * Criar nova regra de Order Bump
   */
  async create(dto: CreateOrderBumpDto) {
    const storeId = this.getStoreId();

    // Validação da existência do produto sugerido
    const suggested = await this.prisma.product.findFirst({
      where: { id: dto.suggestedProductId, storeId, deletedAt: null },
    });
    if (!suggested) {
      throw new NotFoundException('Produto sugerido não encontrado na loja');
    }

    // Se for gatilho por produto, valida se existe
    if (dto.triggerType === 'PRODUCT' && dto.triggerProductId) {
      const trigger = await this.prisma.product.findFirst({
        where: { id: dto.triggerProductId, storeId, deletedAt: null },
      });
      if (!trigger) {
        throw new NotFoundException('Produto de gatilho não encontrado na loja');
      }
    }

    // Se for gatilho por categoria, valida se existe
    if (dto.triggerType === 'CATEGORY' && dto.triggerCategoryId) {
      const cat = await this.prisma.category.findFirst({
        where: { id: dto.triggerCategoryId, storeId, deletedAt: null },
      });
      if (!cat) {
        throw new NotFoundException('Categoria de gatilho não encontrada na loja');
      }
    }

    return (this.prisma as any).orderBump.create({
      data: {
        storeId,
        title: dto.title || 'Peça também',
        isActive: dto.isActive !== undefined ? dto.isActive : true,
        priority: dto.priority || 0,
        triggerType: dto.triggerType,
        triggerProductId: dto.triggerType === 'PRODUCT' ? dto.triggerProductId : null,
        triggerCategoryId: dto.triggerType === 'CATEGORY' ? dto.triggerCategoryId : null,
        suggestedProductId: dto.suggestedProductId,
        customPrice: dto.customPrice !== undefined ? dto.customPrice : null,
        discountPercent: dto.discountPercent !== undefined ? dto.discountPercent : null,
      },
      include: {
        suggestedProduct: {
          select: {
            id: true,
            title: true,
            price: true,
            images: { take: 1, select: { url: true } },
          },
        },
        triggerProduct: {
          select: {
            id: true,
            title: true,
          },
        },
        triggerCategory: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });
  }

  /**
   * Atualizar regra de Order Bump
   */
  async update(id: string, dto: UpdateOrderBumpDto) {
    const storeId = this.getStoreId();

    const existing = await (this.prisma as any).orderBump.findFirst({
      where: { id, storeId },
    });
    if (!existing) {
      throw new NotFoundException('Regra de Order Bump não encontrada');
    }

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.triggerType !== undefined) {
      data.triggerType = dto.triggerType;
      data.triggerProductId = dto.triggerType === 'PRODUCT' ? dto.triggerProductId : null;
      data.triggerCategoryId = dto.triggerType === 'CATEGORY' ? dto.triggerCategoryId : null;
    } else {
      if (dto.triggerProductId !== undefined) data.triggerProductId = dto.triggerProductId;
      if (dto.triggerCategoryId !== undefined) data.triggerCategoryId = dto.triggerCategoryId;
    }
    if (dto.suggestedProductId !== undefined) data.suggestedProductId = dto.suggestedProductId;
    if (dto.customPrice !== undefined) data.customPrice = dto.customPrice;
    if (dto.discountPercent !== undefined) data.discountPercent = dto.discountPercent;

    return (this.prisma as any).orderBump.update({
      where: { id },
      data,
      include: {
        suggestedProduct: {
          select: {
            id: true,
            title: true,
            price: true,
            images: { take: 1, select: { url: true } },
          },
        },
        triggerProduct: {
          select: {
            id: true,
            title: true,
          },
        },
        triggerCategory: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });
  }

  /**
   * Ativar / Desativar rápido
   */
  async toggleActive(id: string) {
    const storeId = this.getStoreId();
    const existing = await (this.prisma as any).orderBump.findFirst({
      where: { id, storeId },
    });
    if (!existing) {
      throw new NotFoundException('Regra de Order Bump não encontrada');
    }

    return (this.prisma as any).orderBump.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });
  }

  /**
   * Deletar regra de Order Bump
   */
  async delete(id: string) {
    const storeId = this.getStoreId();
    const existing = await (this.prisma as any).orderBump.findFirst({
      where: { id, storeId },
    });
    if (!existing) {
      throw new NotFoundException('Regra de Order Bump não encontrada');
    }

    return (this.prisma as any).orderBump.delete({
      where: { id },
    });
  }

  /**
   * Sugestões inteligentes para o cliente na sacola (Storefront)
   */
  async getSuggestionsForStore(dto: GetOrderBumpSuggestionsDto) {
    const storeId = this.getStoreId();
    const inCartProductIds = dto.productIds || [];

    // Se o cliente informou os produtos, buscamos suas categorias no banco
    let inCartCategoryIds = dto.categoryIds || [];
    if (inCartProductIds.length > 0 && inCartCategoryIds.length === 0) {
      const cartProducts = await this.prisma.product.findMany({
        where: { id: { in: inCartProductIds }, storeId },
        select: { categoryId: true },
      });
      inCartCategoryIds = [...new Set(cartProducts.map((p) => p.categoryId).filter(Boolean))];
    }

    // Buscar regras ativas da loja
    const activeRules = await (this.prisma as any).orderBump.findMany({
      where: { storeId, isActive: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: {
        suggestedProduct: {
          include: {
            images: { take: 2, select: { url: true } },
            category: { select: { id: true, title: true } },
            variations: {
              include: {
                variation: {
                  include: {
                    options: true,
                  },
                },
              },
            },
            items: {
              where: { stock: { gt: 0 } },
              select: {
                id: true,
                stock: true,
                options: {
                  select: {
                    option: {
                      select: {
                        id: true,
                        value: true,
                        variation: {
                          select: {
                            id: true,
                            title: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const suggestions: any[] = [];
    const seenProductIds = new Set<string>(inCartProductIds); // Não sugerir produtos que já estão no carrinho

    for (const rule of activeRules) {
      const product = rule.suggestedProduct;
      if (!product || !product.isVisible || product.deletedAt) continue;
      if (seenProductIds.has(product.id)) continue;

      // Verificar se o produto possui estoque disponível
      const totalAvailableStock = product.items.reduce(
        (sum: number, it: any) => sum + (it.stock || 0),
        0,
      );
      if (totalAvailableStock <= 0) continue;

      // Verificar se atende ao gatilho
      let isTriggerMatched = false;
      if (rule.triggerType === 'ALL') {
        isTriggerMatched = true;
      } else if (rule.triggerType === 'PRODUCT' && rule.triggerProductId) {
        isTriggerMatched = inCartProductIds.includes(rule.triggerProductId);
      } else if (rule.triggerType === 'CATEGORY' && rule.triggerCategoryId) {
        isTriggerMatched = inCartCategoryIds.includes(rule.triggerCategoryId);
      }

      if (!isTriggerMatched) continue;

      // Calcular o preço final com o desconto do Order Bump se houver
      const originalPrice = Number(product.promotionalPrice || product.price || 0);
      let bumpPrice = originalPrice;

      if (rule.customPrice !== null && rule.customPrice !== undefined && Number(rule.customPrice) > 0) {
        bumpPrice = Number(rule.customPrice);
      } else if (rule.discountPercent !== null && rule.discountPercent !== undefined && Number(rule.discountPercent) > 0) {
        const discountVal = (originalPrice * Number(rule.discountPercent)) / 100;
        bumpPrice = Math.max(0, originalPrice - discountVal);
      }

      seenProductIds.add(product.id);

      suggestions.push({
        bumpId: rule.id,
        sectionTitle: rule.title || 'Peça também',
        product: {
          id: product.id,
          title: product.title,
          price: bumpPrice,
          originalPrice: originalPrice,
          hasDiscount: bumpPrice < originalPrice,
          discountPercent: rule.discountPercent ? Number(rule.discountPercent) : null,
          imageUrl: product.images?.[0]?.url || null,
          totalStock: totalAvailableStock,
          hasVariations: (product.variations?.length || 0) > 0 || product.items.length > 1 || product.items.some((it: any) => it.options?.length > 0),
          variations: product.variations || [],
          items: product.items,
        },
      });

      if (suggestions.length >= 6) break; // Limite de 6 itens para manter a sacola limpa
    }

    if (suggestions.length > 0) {
      const bumpIds = suggestions.map((s) => s.bumpId);
      (this.prisma as any).orderBump
        .updateMany({
          where: { id: { in: bumpIds } },
          data: { viewsCount: { increment: 1 } },
        })
        .catch((err: any) => console.error('Erro ao incrementar viewsCount do order bump:', err));
    }

    return suggestions;
  }
}
