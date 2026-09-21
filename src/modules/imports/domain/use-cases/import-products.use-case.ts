/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { Injectable, Logger } from '@nestjs/common';
import { VendizapService } from '../../infrastructure/services/vendizap.service';
import { ImageMigrationService } from '../../infrastructure/services/image-migration.service';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class ImportProductsUseCase {
  private readonly logger = new Logger(ImportProductsUseCase.name);

  constructor(
    private readonly vendizapService: VendizapService,
    private readonly imageMigrationService: ImageMigrationService,
    private readonly prisma: PrismaService,
  ) {}

  async execute(storeId: string) {
    this.logger.log('Starting products import from Vendizap');
    // First ensure we have a default category if items don't map well
    let defaultCategory = await this.prisma.category.findFirst({
      where: { storeId, externalId: 'DEFAULT' },
    });
    if (!defaultCategory) {
      defaultCategory = await this.prisma.category.create({
        data: { storeId, title: 'Importados', externalId: 'DEFAULT' },
      });
    }

    // Check for an incomplete job
    let job = await this.prisma.importJob.findFirst({
      where: { storeId, type: 'PRODUCTS', status: 'RUNNING' },
    });

    let skip = 0;
    const limit = 50;

    if (job) {
      skip = job.lastSkip; // Retoma do último skip salvo
      this.logger.log(`Resuming previous import job from skip ${skip}`);
    } else {
      job = await this.prisma.importJob.create({
        data: {
          storeId,
          type: 'PRODUCTS',
          status: 'RUNNING',
          lastSkip: 0,
          totalFetched: 0,
        },
      });
    }

    let hasMore = true;

    try {
      while (hasMore) {
        this.logger.log(`Fetching products with skip ${skip} and limit ${limit}`);
        const data = await this.vendizapService.getProducts(skip, limit, storeId);
        const products = Array.isArray(data) ? data : data.data || [];

        if (products.length === 0) {
          hasMore = false;
          break;
        }

        for (const item of products) {
          try {
            // Find mapping category
            let categoryId = defaultCategory.id;
            
            // A API de listagem do Vendizap não retorna as categorias.
            // Precisamos buscar os detalhes do produto para mapear a categoria corretamente.
            let detailedItem;
            try {
              detailedItem = await this.vendizapService.getProductById(item.id, storeId);
            } catch (err) {
              this.logger.warn(`Could not fetch details for product ${item.id}, using default category`);
            }
            
            let externalCatId;
            if (detailedItem) {
              externalCatId = detailedItem.id_categoria || detailedItem.category_id || detailedItem.categoria_id || (detailedItem.categorias && detailedItem.categorias.length > 0 ? detailedItem.categorias[0].id : undefined);
            } else {
              externalCatId = item.id_categoria || item.category_id || item.categoria_id || (item.categorias && item.categorias.length > 0 ? item.categorias[0].id : undefined);
            }
            
            if (externalCatId) {
              const mappedCat = await this.prisma.category.findUnique({
                where: { externalId: externalCatId.toString() },
              });
              if (mappedCat) {
                categoryId = mappedCat.id;
              }
            }
            
            if (categoryId === defaultCategory.id && detailedItem?.categorias_old && detailedItem.categorias_old.length > 0) {
              const categoryName = detailedItem.categorias_old[0];
              const mappedCat = await this.prisma.category.findFirst({
                where: { storeId, title: categoryName },
              });
              if (mappedCat) categoryId = mappedCat.id;
            }

            const dtString = item.dt_cadastro ? item.dt_cadastro.replace(' ', 'T') : undefined;
            const dtAlteracaoString = item.dt_alteracao ? item.dt_alteracao.replace(' ', 'T') : undefined;

            const product = await this.prisma.product.upsert({
              where: { externalId: item.id.toString() },
              update: {
                title: item.descricao || item.title || item.name || 'Sem Título',
                categoryId: categoryId,
                price: item.preco || item.price || 0,
                description: item.detalhesFormatado || item.description || '',
                isVisible: item.exibir ?? true,
                ...(dtString ? { createdAt: new Date(dtString) } : {}),
                ...(dtAlteracaoString ? { updatedAt: new Date(dtAlteracaoString) } : {}),
              },
              create: {
                storeId,
                externalId: item.id.toString(),
                title: item.descricao || item.title || item.name || 'Sem Título',
                categoryId: categoryId,
                price: item.preco || item.price || 0,
                description: item.detalhesFormatado || item.description || '',
                isVisible: item.exibir ?? true,
                ...(dtString ? { createdAt: new Date(dtString) } : {}),
                ...(dtAlteracaoString ? { updatedAt: new Date(dtAlteracaoString) } : {}),
              },
            });

            // Upsert images
            let imagesToMigrate: any[] = [];
            if (item.foto) imagesToMigrate.push(item.foto);
            if (item.images && item.images.length > 0) {
              imagesToMigrate = item.images.map((img: any) => img.url || img);
            }

            if (imagesToMigrate.length > 0) {
              const crypto = require('crypto');
              for (const img of imagesToMigrate) {
                const imgUrl = typeof img === 'string' ? img : img.url;
                const imgId = typeof img === 'string' ? null : img.id?.toString();
                if (!imgUrl) continue;

                const hash = crypto.createHash('md5').update(imgUrl).digest('hex');
                const expectedFileName = `products/${hash}.webp`;

                const existing = await this.prisma.productImage.findFirst({
                  where: { url: expectedFileName, productId: product.id }
                });

                if (existing) {
                  continue; // se ja existe imagem nao altera no banco e nem sobe no minio
                }

                const migratedUrl = await this.imageMigrationService.migrateImage(
                  imgUrl,
                  `stores/${storeId}/products`,
                );
                if (migratedUrl) {
                  await this.prisma.productImage.create({
                    data: {
                      externalId: imgId,
                      url: migratedUrl,
                      productId: product.id,
                    },
                  });
                }
              }
            }
          } catch (error) {
            this.logger.error(`Failed to import product ${item.id}`, error);
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

      this.logger.log('Finished products import');
    } catch (error) {
      await this.prisma.importJob.update({
        where: { id: job.id },
        data: { status: 'FAILED' },
      });
      this.logger.error('Import process failed and was marked as FAILED', error);
      throw error;
    }
  }
}
