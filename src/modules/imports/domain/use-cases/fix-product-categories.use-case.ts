/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { Injectable, Logger } from '@nestjs/common';
import { VendizapService } from '../../infrastructure/services/vendizap.service';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class FixProductCategoriesUseCase {
  private readonly logger = new Logger(FixProductCategoriesUseCase.name);

  constructor(
    private readonly vendizapService: VendizapService,
    private readonly prisma: PrismaService,
  ) {}

  async execute() {
    this.logger.log('Starting product categories fix using single product endpoint from Vendizap');

    // Fetch all products that have an externalId mapped
    const products = await this.prisma.product.findMany({
      where: { externalId: { not: null } },
      select: { id: true, externalId: true, title: true, categoryId: true },
    });

    this.logger.log(`Found ${products.length} products to verify categories`);

    let updatedCount = 0;

    for (const product of products) {
      if (!product.externalId) continue;

      try {
        const vendizapProductData = await this.vendizapService.getProductById(product.externalId);
        
        // Single product endpoint might return data inside a 'data' property or directly
        const item = vendizapProductData.data || vendizapProductData;
        
        if (!item) {
           this.logger.warn(`No data found for product ${product.externalId} on single endpoint`);
           continue;
        }

        const externalCatId = item.id_categoria || item.category_id || item.categoria_id || (item.categorias && item.categorias.length > 0 ? item.categorias[0].id : undefined);

        if (externalCatId) {
          const mappedCat = await this.prisma.category.findUnique({
            where: { externalId: externalCatId.toString() },
          });

          if (mappedCat && mappedCat.id !== product.categoryId) {
             await this.prisma.product.update({
               where: { id: product.id },
               data: { categoryId: mappedCat.id }
             });
             this.logger.log(`Updated product ${product.title} (ID: ${product.id}) to Category ID: ${mappedCat.id}`);
             updatedCount++;
          }
        } else {
           this.logger.debug(`No valid category info returned for product ${product.externalId}`);
        }

      } catch (error) {
        this.logger.error(`Failed to fetch/update category for product ${product.externalId} (${product.title})`, error.message);
      }
    }

    this.logger.log(`Finished fixing product categories. Updated ${updatedCount} products.`);
    return {
      totalAnalyzed: products.length,
      totalUpdated: updatedCount
    };
  }
}
