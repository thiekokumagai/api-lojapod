import { Injectable, Logger } from '@nestjs/common';
import { VendizapService } from '../../infrastructure/services/vendizap.service';
import { ImageMigrationService } from '../../infrastructure/services/image-migration.service';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class ImportProductImagesUseCase {
  private readonly logger = new Logger(ImportProductImagesUseCase.name);

  constructor(
    private readonly vendizapService: VendizapService,
    private readonly imageMigrationService: ImageMigrationService,
    private readonly prisma: PrismaService,
  ) {}

  async execute() {
    this.logger.log('Starting product images import from Vendizap');

    // Check for an incomplete job
    let job = await this.prisma.importJob.findFirst({
      where: { type: 'PRODUCT_IMAGES', status: 'RUNNING' },
    });

    let skip = 0;
    const limit = 20;

    if (job) {
      skip = job.lastSkip;
      this.logger.log(`Resuming previous images import job from skip ${skip}`);
    } else {
      job = await this.prisma.importJob.create({
        data: {
          type: 'PRODUCT_IMAGES',
          status: 'RUNNING',
          lastSkip: 0,
          totalFetched: 0,
        },
      });
    }

    let hasMore = true;

    try {
      while (hasMore) {
        this.logger.log(`Fetching ${limit} local products for images (skip: ${skip})`);
        // Get products that have an externalId (imported from Vendizap)
        const products = await this.prisma.product.findMany({
          where: { externalId: { not: null } },
          select: { id: true, externalId: true },
          skip: skip,
          take: limit,
          orderBy: { id: 'asc' },
        });

        if (products.length === 0) {
          hasMore = false;
          break;
        }

        for (const product of products) {
          if (!product.externalId) continue;

          try {
            // Fetch product details to get the "imagens" array
            const vendizapProduct = await this.vendizapService.getProductById(
              product.externalId,
            );
            const images =
              vendizapProduct.imagens || vendizapProduct.images || [];

            if (images && images.length > 0) {
              for (const img of images) {
                // "img" is just the URL string according to the user's snippet
                const imgUrl = typeof img === 'string' ? img : img.url;
                if (!imgUrl) continue;

                const crypto = require('crypto');
                const hash = crypto.createHash('md5').update(imgUrl).digest('hex');
                const expectedFileName = `products/${hash}.webp`;

                // Check if image already exists for this product in DB before migrating
                const existing = await this.prisma.productImage.findFirst({
                  where: { url: expectedFileName, productId: product.id },
                });

                if (existing) {
                  continue; // Skip migration entirely, already in DB
                }

                const migratedUrl =
                  await this.imageMigrationService.migrateImage(
                    imgUrl,
                    'products',
                  );

                if (migratedUrl) {
                  await this.prisma.productImage.create({
                    data: {
                      url: migratedUrl,
                      productId: product.id,
                    },
                  });
                }
              }
              this.logger.log(
                `Imported ${images.length} images for product ${product.externalId}`,
              );
            }
          } catch (error) {
            this.logger.error(
              `Failed to import images for product ${product.externalId}`,
              error.message,
            );
          }
        }

        skip += limit;

        // Save progress to database
        await this.prisma.importJob.update({
          where: { id: job.id },
          data: {
            lastSkip: skip,
            totalFetched: { increment: products.length },
          },
        });

        if (products.length < limit) {
          hasMore = false;
        }
      }

      await this.prisma.importJob.update({
        where: { id: job.id },
        data: { status: 'COMPLETED' },
      });

      this.logger.log('Finished product images import');
    } catch (error) {
      await this.prisma.importJob.update({
        where: { id: job.id },
        data: { status: 'FAILED' },
      });
      this.logger.error('Images import process failed and was marked as FAILED', error);
      throw error;
    }
  }
}
