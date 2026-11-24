import { Injectable, BadRequestException, Optional } from '@nestjs/common';
import { IProductsRepository } from '../repositories/iproducts.repository';
import { TenantContextService } from '../../../tenant/tenant-context.service';
import { assertSoldByWeightRules } from '../utils/sold-by-weight';

@Injectable()
export class CreateProductUseCase {
  constructor(
    private readonly productsRepository: IProductsRepository,
    @Optional() private readonly tenantContextService?: TenantContextService,
  ) {}

  async execute(dto: {
    title: string;
    description?: string;
    descriptionFormated?: string;
    categoryId: string;
    price?: any;
    promotionalPrice?: any;
    costPrice?: any;
    createdAt?: string;
    isVisible?: boolean;
    isFeatured?: boolean;
    isCustomizable?: boolean;
    servesCount?: number | null;
    isSoldByWeight?: boolean;
    tareWeightGrams?: number | null;
  }) {
    if (dto.isSoldByWeight) {
      const storeId = this.tenantContextService?.getStoreId();
      assertSoldByWeightRules({
        isSoldByWeight: true,
        isCustomizable: !!dto.isCustomizable,
        businessType: storeId ? await this.productsRepository.findStoreBusinessType(storeId) : null,
      });
    }

    const categoryExists = await this.productsRepository.checkCategoryExists(
      dto.categoryId,
    );
    if (!categoryExists) {
      throw new BadRequestException('Categoria inválida');
    }

    const product = await this.productsRepository.create({
      title: dto.title.trim(),
      description: dto.description,
      descriptionFormated: dto.descriptionFormated,
      categoryId: dto.categoryId,
      price: dto.price,
      promotionalPrice: dto.promotionalPrice,
      costPrice: dto.costPrice,
      createdAt: dto.createdAt,
      isVisible: dto.isVisible,
      isFeatured: dto.isFeatured,
      isCustomizable: dto.isCustomizable,
      servesCount: dto.servesCount,
      isSoldByWeight: dto.isSoldByWeight,
      tareWeightGrams: dto.tareWeightGrams,
    });

    return this.productsRepository.findById(product.id);
  }
}
