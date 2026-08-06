/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { Injectable, Logger } from '@nestjs/common';
import { VendizapService } from '../../infrastructure/services/vendizap.service';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class ImportProductVariationsUseCase {
  private readonly logger = new Logger(ImportProductVariationsUseCase.name);

  constructor(
    private readonly vendizapService: VendizapService,
    private readonly prisma: PrismaService,
  ) {}

  async execute() {
    this.logger.log('Starting product variations import from Vendizap');

    // Check for an incomplete job
    let job = await this.prisma.importJob.findFirst({
      where: { type: 'PRODUCT_VARIATIONS', status: 'RUNNING' },
    });

    let skip = 0;
    const limit = 20;

    if (job) {
      skip = job.lastSkip;
      this.logger.log(`Resuming previous variations import job from skip ${skip}`);
    } else {
      job = await this.prisma.importJob.create({
        data: {
          type: 'PRODUCT_VARIATIONS',
          status: 'RUNNING',
          lastSkip: 0,
          totalFetched: 0,
        },
      });
    }

    let hasMore = true;

    try {
      while (hasMore) {
        this.logger.log(`Fetching ${limit} local products for variations (skip: ${skip})`);
        
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
            const vendizapProduct = await this.vendizapService.getProductById(
              product.externalId,
            );
            
            // A API do Vendizap retorna as variações dentro de estoque.combinacoes
            const combinacoes = vendizapProduct.estoque?.combinacoes || [];
            const estoqueSimples = vendizapProduct.estoque?._produto;

            if (combinacoes && combinacoes.length > 0) {
              for (const comb of combinacoes) {
                const combinacaoKeys = Object.keys(comb.combinacao || {});
                if (combinacaoKeys.length === 0) continue;

                const rawTitulo = combinacaoKeys[0]; // Ex: "TEOR DE NICOTINA"
                const valorOpcao = comb.combinacao[rawTitulo]; // Ex: "35mg"
                const estoque = comb.quantidade || 0;


                // Mapeamento amigável para coincidir com a variação "Nicotina" já criada localmente
                let tituloVariacao = rawTitulo;
                if (tituloVariacao.toUpperCase().includes('NICOTINA')) {
                  tituloVariacao = 'Nicotina';
                }

                // 1. Encontrar ou criar a "Variation" (Ex: "Nicotina")
                let variation = await this.prisma.variation.findFirst({
                  where: { title: tituloVariacao },
                });

                if (!variation) {
                  variation = await this.prisma.variation.create({
                    data: { title: tituloVariacao },
                  });
                }

                // 2. Encontrar ou criar a "VariationOption" (Ex: "3mg")
                let option = await this.prisma.variationOption.findFirst({
                  where: {
                    variationId: variation.id,
                    value: valorOpcao,
                  },
                });

                if (!option) {
                  // Descobre a última ordem para adicionar no fim
                  const lastOption = await this.prisma.variationOption.findFirst({
                    where: { variationId: variation.id },
                    orderBy: { order: 'desc' },
                  });
                  
                  option = await this.prisma.variationOption.create({
                    data: {
                      variationId: variation.id,
                      value: valorOpcao,
                      order: lastOption ? lastOption.order + 1 : 1,
                    },
                  });
                }

                // 3. Vincular a variação ao produto (ProductVariation)
                const productVariationExists = await this.prisma.productVariation.findUnique({
                  where: {
                    productId_variationId: {
                      productId: product.id,
                      variationId: variation.id,
                    },
                  },
                });

                if (!productVariationExists) {
                  await this.prisma.productVariation.create({
                    data: {
                      productId: product.id,
                      variationId: variation.id,
                    },
                  });
                }

                // 4. Criar o item de estoque e gerar um hash (ProductItem)
                const hash = `${option.id}`; // O hash baseia-se na combinação de opções (neste caso apenas 1)
                
                let productItem = await this.prisma.productItem.findUnique({
                  where: {
                    productId_hash: {
                      productId: product.id,
                      hash: hash,
                    },
                  },
                });

                if (!productItem) {
                  productItem = await this.prisma.productItem.create({
                    data: {
                      productId: product.id,
                      hash: hash,
                      stock: estoque,

                    },
                  });
                } else {
                  // Atualizar o estoque se já existir
                  await this.prisma.productItem.update({
                    where: { id: productItem.id },
                    data: { stock: estoque },
                  });
                }

                // 5. Vincular a opção ao item (ProductItemOption)
                const itemOptionExists = await this.prisma.productItemOption.findUnique({
                  where: {
                    itemId_optionId: {
                      itemId: productItem.id,
                      optionId: option.id,
                    },
                  },
                });

                if (!itemOptionExists) {
                  await this.prisma.productItemOption.create({
                    data: {
                      itemId: productItem.id,
                      optionId: option.id,
                    },
                  });
                }
              }
              
              this.logger.log(
                `Imported ${combinacoes.length} variations for product ${product.externalId}`,
              );
            } else if (estoqueSimples !== undefined) {
              // Produto simples, sem variações
              let productItem = await this.prisma.productItem.findFirst({
                where: {
                  productId: product.id,
                  hash: `simple_${product.id}`,
                },
              });

              if (!productItem) {
                productItem = await this.prisma.productItem.create({
                  data: {
                    productId: product.id,
                    hash: `simple_${product.id}`,
                    stock: estoqueSimples,

                  },
                });
              } else {
                await this.prisma.productItem.update({
                  where: { id: productItem.id },
                  data: { 
                    stock: estoqueSimples, 

                  },
                });
              }
              
              this.logger.log(
                `Updated simple stock to ${estoqueSimples} for product ${product.externalId}`,
              );
            }
          } catch (error) {
            this.logger.error(
              `Failed to import variations for product ${product.externalId}`,
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

      this.logger.log('Finished product variations import');
    } catch (error) {
      await this.prisma.importJob.update({
        where: { id: job.id },
        data: { status: 'FAILED' },
      });
      this.logger.error('Variations import process failed and was marked as FAILED', error);
      throw error;
    }
  }
}
