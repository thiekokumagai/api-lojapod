import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { CreateOrderBumpDto } from '../dto/create-order-bump.dto';
import { UpdateOrderBumpDto } from '../dto/update-order-bump.dto';
import { GetOrderBumpSuggestionsDto } from '../dto/get-order-bump-suggestions.dto';
import {
  displayLocationsVisibleIn,
  maxSuggestionsFor,
  shortDescription,
} from './order-bump-display';

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

  private resolveTriggerProductIds(input: {
    triggerProductIds?: string[] | null;
    triggerProductId?: string | null;
  }): string[] {
    const raw =
      Array.isArray(input.triggerProductIds) && input.triggerProductIds.length > 0
        ? input.triggerProductIds
        : input.triggerProductId
          ? [input.triggerProductId]
          : [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const id of raw) {
      if (typeof id !== 'string') continue;
      const trimmed = id.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      result.push(trimmed);
    }
    return result;
  }

  private async validateTriggerProducts(triggerIds: string[], storeId: string): Promise<void> {
    if (triggerIds.length === 0) {
      throw new BadRequestException('Selecione pelo menos um produto de gatilho');
    }
    const found = await this.prisma.product.findMany({
      where: { id: { in: triggerIds }, storeId, deletedAt: null },
      select: { id: true },
    });
    if (found.length !== triggerIds.length) {
      throw new NotFoundException('Produto de gatilho não encontrado na loja');
    }
  }

  private resolveTriggerCategoryIds(input: {
    triggerCategoryIds?: string[] | null;
    triggerCategoryId?: string | null;
  }): string[] {
    const raw =
      Array.isArray(input.triggerCategoryIds) && input.triggerCategoryIds.length > 0
        ? input.triggerCategoryIds
        : input.triggerCategoryId
          ? [input.triggerCategoryId]
          : [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const id of raw) {
      if (typeof id !== 'string') continue;
      const trimmed = id.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      result.push(trimmed);
    }
    return result;
  }

  private async validateTriggerCategories(triggerIds: string[], storeId: string): Promise<void> {
    if (triggerIds.length === 0) {
      throw new BadRequestException('Selecione pelo menos uma categoria de gatilho');
    }
    const found = await this.prisma.category.findMany({
      where: { id: { in: triggerIds }, storeId, deletedAt: null },
      select: { id: true },
    });
    if (found.length !== triggerIds.length) {
      throw new NotFoundException('Categoria de gatilho não encontrada na loja');
    }
  }

  private async enrichRulesWithTriggerProducts<
    T extends {
      triggerProductId?: string | null;
      triggerProductIds?: string[] | null;
      triggerProduct?: any;
      triggerCategoryId?: string | null;
      triggerCategoryIds?: string[] | null;
      triggerCategory?: any;
    },
  >(
    rules: T[],
    storeId: string,
  ): Promise<
    Array<
      T & {
        triggerProductIds: string[];
        triggerProducts: any[];
        triggerCategoryIds: string[];
        triggerCategories: any[];
      }
    >
  > {
    const allIds = Array.from(
      new Set(rules.flatMap((rule) => this.resolveTriggerProductIds(rule))),
    );
    const productMap = new Map<string, any>();

    if (allIds.length > 0 && this.prisma?.product?.findMany) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: allIds }, storeId, deletedAt: null },
        select: {
          id: true,
          title: true,
          price: true,
          images: {
            take: 1,
            orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
            select: { url: true },
          },
        },
      });
      for (const prod of products) {
        productMap.set(prod.id, prod);
      }
    }

    const allCategoryIds = Array.from(
      new Set(rules.flatMap((rule) => this.resolveTriggerCategoryIds(rule))),
    );
    const categoryMap = new Map<string, any>();

    if (allCategoryIds.length > 0 && this.prisma?.category?.findMany) {
      const categories = await this.prisma.category.findMany({
        where: { id: { in: allCategoryIds }, storeId, deletedAt: null },
        select: { id: true, title: true },
      });
      for (const cat of categories) {
        categoryMap.set(cat.id, cat);
      }
    }

    return rules.map((rule) => {
      const ids = this.resolveTriggerProductIds(rule);
      const triggerProducts = ids
        .map((id) => {
          const found = productMap.get(id);
          if (found) return found;
          if (rule.triggerProduct && rule.triggerProduct.id === id) {
            return rule.triggerProduct;
          }
          return null;
        })
        .filter(Boolean);
      const catIds = this.resolveTriggerCategoryIds(rule);
      const triggerCategories = catIds
        .map((id) => {
          const found = categoryMap.get(id);
          if (found) return found;
          if (rule.triggerCategory && rule.triggerCategory.id === id) {
            return rule.triggerCategory;
          }
          return null;
        })
        .filter(Boolean);
      return {
        ...rule,
        triggerProductIds: ids,
        triggerProducts,
        triggerCategoryIds: catIds,
        triggerCategories,
      };
    });
  }


  /**
   * Listar todas as regras de Order Bump para o painel admin
   */
  async listAllForAdmin() {
    const storeId = this.getStoreId();

    const rules = await (this.prisma as any).orderBump.findMany({
      where: { storeId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: {
        triggerProduct: {
          select: {
            id: true,
            title: true,
            price: true,
            images: { take: 1, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { url: true } },
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
            images: { take: 1, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { url: true } },
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
    return this.enrichRulesWithTriggerProducts(rules, storeId);
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

    // Se for gatilho por produto, valida se todos os IDs existem na loja
    const triggerProductIds =
      dto.triggerType === 'PRODUCT' ? this.resolveTriggerProductIds(dto) : [];
    if (dto.triggerType === 'PRODUCT') {
      await this.validateTriggerProducts(triggerProductIds, storeId);
    }

    const triggerCategoryIds =
      dto.triggerType === 'CATEGORY' ? this.resolveTriggerCategoryIds(dto) : [];
    if (dto.triggerType === 'CATEGORY') {
      await this.validateTriggerCategories(triggerCategoryIds, storeId);
    }

    // Se priority não foi informado, coloca a nova regra com prioridade acima das existentes para aparecer em 1º
    let nextPriority = dto.priority;
    if (nextPriority === undefined || nextPriority === null) {
      const topExisting = await (this.prisma as any).orderBump.findFirst({
        where: { storeId },
        orderBy: { priority: 'desc' },
        select: { priority: true },
      });
      nextPriority = (topExisting?.priority ?? 0) + 1;
    }

    const created = await (this.prisma as any).orderBump.create({
      data: {
        storeId,
        title: dto.title || 'Peça também',
        isActive: dto.isActive !== undefined ? dto.isActive : true,
        priority: nextPriority,
        triggerType: dto.triggerType,
        triggerProductId: dto.triggerType === 'PRODUCT' ? (triggerProductIds[0] ?? null) : null,
        triggerProductIds: dto.triggerType === 'PRODUCT' ? triggerProductIds : [],
        triggerCategoryId: dto.triggerType === 'CATEGORY' ? (triggerCategoryIds[0] ?? null) : null,
        triggerCategoryIds: dto.triggerType === 'CATEGORY' ? triggerCategoryIds : [],
        suggestedProductId: dto.suggestedProductId,
        customPrice: dto.customPrice !== undefined ? dto.customPrice : null,
        discountPercent: dto.discountPercent !== undefined ? dto.discountPercent : null,
        // Sem informar, a oferta aparece só no carrinho, como sempre foi.
        displayLocation: dto.displayLocation ?? 'CART',
      },
      include: {
        suggestedProduct: {
          select: {
            id: true,
            title: true,
            price: true,
            images: { take: 1, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { url: true } },
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
    const [enriched] = await this.enrichRulesWithTriggerProducts([created], storeId);
    return enriched;
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
    const effectiveTriggerType = dto.triggerType ?? existing.triggerType;
    const hasTriggerProductInput =
      dto.triggerProductIds !== undefined || dto.triggerProductId !== undefined;
    const hasTriggerCategoryInput =
      dto.triggerCategoryIds !== undefined || dto.triggerCategoryId !== undefined;

    if (dto.triggerType !== undefined) {
      data.triggerType = dto.triggerType;
    }

    if (effectiveTriggerType === 'CATEGORY') {
      if (hasTriggerCategoryInput) {
        const triggerCatIds = this.resolveTriggerCategoryIds(dto);
        await this.validateTriggerCategories(triggerCatIds, storeId);
        data.triggerCategoryIds = triggerCatIds;
        data.triggerCategoryId = triggerCatIds[0] ?? null;
      } else if (dto.triggerType === 'CATEGORY') {
        const existingCatIds = this.resolveTriggerCategoryIds(existing);
        await this.validateTriggerCategories(existingCatIds, storeId);
        data.triggerCategoryIds = existingCatIds;
        data.triggerCategoryId = existingCatIds[0] ?? null;
      }
    } else if (dto.triggerType !== undefined || hasTriggerCategoryInput) {
      data.triggerCategoryIds = [];
      data.triggerCategoryId = null;
    }

    if (effectiveTriggerType === 'PRODUCT') {
      if (hasTriggerProductInput) {
        const triggerIds = this.resolveTriggerProductIds(dto);
        await this.validateTriggerProducts(triggerIds, storeId);
        data.triggerProductIds = triggerIds;
        data.triggerProductId = triggerIds[0] ?? null;
      } else if (dto.triggerType === 'PRODUCT') {
        const existingIds = this.resolveTriggerProductIds(existing);
        await this.validateTriggerProducts(existingIds, storeId);
        data.triggerProductIds = existingIds;
        data.triggerProductId = existingIds[0] ?? null;
      }
    } else if (dto.triggerType !== undefined || hasTriggerProductInput) {
      data.triggerProductIds = [];
      data.triggerProductId = null;
    }
    if (dto.suggestedProductId !== undefined) {
      const suggested = await this.prisma.product.findFirst({
        where: { id: dto.suggestedProductId, storeId, deletedAt: null },
        select: { id: true },
      });
      if (!suggested) {
        throw new NotFoundException('Produto sugerido não encontrado na loja');
      }
      data.suggestedProductId = dto.suggestedProductId;
    }
    if (dto.customPrice !== undefined) data.customPrice = dto.customPrice;
    if (dto.discountPercent !== undefined) data.discountPercent = dto.discountPercent;
    if (dto.displayLocation !== undefined) data.displayLocation = dto.displayLocation;

    const updated = await (this.prisma as any).orderBump.update({
      where: { id },
      data,
      include: {
        suggestedProduct: {
          select: {
            id: true,
            title: true,
            price: true,
            images: { take: 1, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { url: true } },
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
    const [enriched] = await this.enrichRulesWithTriggerProducts([updated], storeId);
    return enriched;
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
   * Reordenar regras de Order Bump da loja (o 1º ID recebe o maior priority)
   */
  async reorder(ids: string[]) {
    const storeId = this.getStoreId();
    const uniqueIds = [...new Set((ids ?? []).filter(Boolean))];
    if (uniqueIds.length === 0) {
      return [];
    }

    const existing = await (this.prisma as any).orderBump.findMany({
      where: { storeId, id: { in: uniqueIds } },
      select: { id: true },
    });

    if (existing.length !== uniqueIds.length) {
      throw new BadRequestException(
        'Uma ou mais regras de Order Bump não pertencem a esta loja.',
      );
    }

    const total = uniqueIds.length;
    await this.prisma.$transaction(
      uniqueIds.map((id, idx) =>
        (this.prisma as any).orderBump.update({
          where: { id },
          data: { priority: total - idx },
        }),
      ),
    );

    return this.listAllForAdmin();
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

    // Buscar regras ativas da loja que aparecem no lugar onde o cliente está (carrinho ou tela do produto)
    const activeRules = await (this.prisma as any).orderBump.findMany({
      where: {
        storeId,
        isActive: true,
        displayLocation: { in: displayLocationsVisibleIn(dto.location) },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: {
        suggestedProduct: {
          include: {
            images: { take: 2, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { url: true } },
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
      } else if (rule.triggerType === 'PRODUCT') {
        const effectiveTriggerIds = this.resolveTriggerProductIds(rule);
        isTriggerMatched = effectiveTriggerIds.some((id) => inCartProductIds.includes(id));
      } else if (rule.triggerType === 'CATEGORY') {
        const effectiveCatIds = this.resolveTriggerCategoryIds(rule);
        isTriggerMatched = effectiveCatIds.some((id) => inCartCategoryIds.includes(id));
      }

      if (!isTriggerMatched) continue;

      // Calcular o preço base real do produto (promocional ativo ou normal)
      const promo = product.promotionalPrice ? Number(product.promotionalPrice) : 0;
      const normal = product.price ? Number(product.price) : 0;
      const originalPrice = promo > 0 ? promo : normal;
      let bumpPrice = originalPrice;

      if (rule.customPrice !== null && rule.customPrice !== undefined && Number(rule.customPrice) > 0) {
        bumpPrice = Number(rule.customPrice);
      } else if (rule.discountPercent !== null && rule.discountPercent !== undefined && Number(rule.discountPercent) > 0) {
        const discountVal = (originalPrice * Number(rule.discountPercent)) / 100;
        bumpPrice = Math.max(0, originalPrice - discountVal);
      }

      bumpPrice = Math.round(bumpPrice * 100) / 100;
      const finalOriginalPrice = Math.round(originalPrice * 100) / 100;

      seenProductIds.add(product.id);

      suggestions.push({
        bumpId: rule.id,
        sectionTitle: rule.title || 'Peça também',
        triggerType: rule.triggerType || 'ALL',
        triggerProductId: this.resolveTriggerProductIds(rule)[0] ?? null,
        triggerProductIds: this.resolveTriggerProductIds(rule),
        triggerCategoryId: this.resolveTriggerCategoryIds(rule)[0] ?? null,
        triggerCategoryIds: this.resolveTriggerCategoryIds(rule),
        product: {
          id: product.id,
          title: product.title,
          price: bumpPrice,
          originalPrice: finalOriginalPrice,
          hasDiscount: bumpPrice < finalOriginalPrice,
          discountPercent: rule.discountPercent ? Number(rule.discountPercent) : null,
          imageUrl: product.images?.[0]?.url || null,
          // Descrição curta (ex.: "Lata 310ml") para a linha da oferta
          description: shortDescription(product.description),
          totalStock: totalAvailableStock,
          hasVariations: (product.variations?.length || 0) > 0 || product.items.length > 1 || product.items.some((it: any) => it.options?.length > 0),
          variations: product.variations || [],
          items: product.items,
        },
      });

      // Carrinho: 6 para manter a sacola limpa. Tela do produto: até 10, como um grupo de opções.
      if (suggestions.length >= maxSuggestionsFor(dto.location)) break;
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
