import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { IProductsRepository } from '../repositories/iproducts.repository';
import { TenantContextService } from '../../../tenant/tenant-context.service';
import { assertSoldByWeightRules } from '../utils/sold-by-weight';

import { EventsGateway } from '../../../events/events.gateway';

import { CombosService } from '../../../combos/infrastructure/services/combos.service';

@Injectable()
export class UpdateProductUseCase {
  constructor(
    private readonly productsRepository: IProductsRepository,
    private readonly eventsGateway: EventsGateway,
    private readonly combosService: CombosService,
    @Optional() private readonly tenantContextService?: TenantContextService,
  ) {}

  async execute(
    id: string,
    dto: {
      title?: string;
      description?: string;
      descriptionFormated?: string;
      categoryId?: string;
      price?: any;
      promotionalPrice?: any;
      costPrice?: any;
      isVisible?: boolean;
      isFeatured?: boolean;
      isCustomizable?: boolean;
      servesCount?: number | null;
      isSoldByWeight?: boolean;
      tareWeightGrams?: number | null;
    },
  ) {
    const existing = await this.productsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Produto não encontrado');
    }

    const finalSoldByWeight = dto.isSoldByWeight ?? existing.isSoldByWeight ?? false;
    if (finalSoldByWeight) {
      const storeId = existing.storeId ?? this.tenantContextService?.getStoreId();
      assertSoldByWeightRules({
        isSoldByWeight: true,
        isCustomizable: dto.isCustomizable ?? existing.isCustomizable ?? false,
        businessType: storeId ? await this.productsRepository.findStoreBusinessType(storeId) : null,
      });
    }

    if (dto.categoryId && dto.categoryId !== existing.categoryId) {
      const categoryExists = await this.productsRepository.checkCategoryExists(
        dto.categoryId,
      );
      if (!categoryExists) {
        throw new BadRequestException('Categoria inválida');
      }
    }

    await this.productsRepository.update(id, {
      title: dto.title?.trim(),
      description: dto.description,
      descriptionFormated: dto.descriptionFormated,
      categoryId: dto.categoryId,
      price: dto.price,
      promotionalPrice: dto.promotionalPrice,
      costPrice: dto.costPrice,
      isVisible: dto.isVisible,
      isFeatured: dto.isFeatured,
      isCustomizable: dto.isCustomizable,
      servesCount: dto.servesCount,
      isSoldByWeight: dto.isSoldByWeight,
      tareWeightGrams: dto.tareWeightGrams,
    });

    // Se o produto foi desativado (isVisible: false), desativa combos que dependam dele
    if (dto.isVisible === false) {
      try {
        await this.combosService.checkAndDeactivateAffectedCombos(id);
      } catch (err) {
        // Loga erro mas não quebra o fluxo
        console.error('Erro ao desativar combos afetados pelo produto:', err);
      }
    }

    const updatedProduct = await this.productsRepository.findById(id);
    
    // Se a visibilidade foi alterada ou algo importante que afete o catálogo
    this.eventsGateway.notifyCatalogRefresh(updatedProduct?.storeId);

    return updatedProduct;
  }
}
