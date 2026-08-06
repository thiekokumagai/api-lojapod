import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { IProductsRepository } from '../repositories/iproducts.repository';
import { createHash } from 'crypto';

@Injectable()
export class CreateProductItemsUseCase {
  constructor(private readonly productsRepository: IProductsRepository) {}

  private extractOptionIds(
    options: (string | { optionId: string })[] = [],
  ): string[] {
    return options.map((o) => (typeof o === 'string' ? o : o.optionId)).sort();
  }

  private generateHash(optionIds: string[]) {
    return createHash('sha256').update(optionIds.join('|')).digest('hex');
  }

  async execute(productId: string, dto: { items: any[] }) {
    const product = await this.productsRepository.findById(productId);

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    const isSimple = product.variations.length === 0;

    // =====================================================
    // PRODUTO SIMPLES
    // =====================================================
    if (isSimple) {
      if (dto.items.length !== 1) {
        throw new BadRequestException(
          'Produto simples deve possuir exatamente um item',
        );
      }

      const item = dto.items[0];

      if ((item.options ?? []).length > 0) {
        throw new BadRequestException(
          'Produto simples não aceita opções de variação',
        );
      }

      await this.productsRepository.updateSimpleItemTransaction(
        productId,
        item.stock,

      );

      return this.productsRepository.listItems(productId);
    }

    // =====================================================
    // PRODUTO COM VARIAÇÕES
    // =====================================================

    // Mapeia opções permitidas e suas variações
    const allowedOptionsMap = new Map<string, string>();
    const variationIdsByOptionId = new Map<string, string>();

    for (const productVariation of product.variations) {
      for (const option of productVariation.variation.options) {
        allowedOptionsMap.set(option.id, option.id);
        variationIdsByOptionId.set(option.id, option.variationId);
      }
    }

    // Busca itens existentes
    const existingItems =
      await this.productsRepository.findItemsByProductId(productId);

    // Hashes existentes
    const existingHashes = new Set(
      existingItems
        .filter((item) => item.hash !== `simple_${productId}`)
        .map((item) => item.hash),
    );

    // Variações existentes
    const existingVariationIds = new Set<string>();
    for (const item of existingItems) {
      for (const itemOption of item.options) {
        existingVariationIds.add(itemOption.option.variationId);
      }
    }

    // Validação dos itens recebidos
    const incomingVariationIds = new Set<string>();
    const requestHashes = new Set<string>();

    for (const item of dto.items) {
      const optionIds = this.extractOptionIds(item.options);

      if (optionIds.length === 0) {
        throw new BadRequestException(
          'Item com variação precisa ter ao menos uma opção',
        );
      }

      const hash = this.generateHash(optionIds);

      if (requestHashes.has(hash)) {
        throw new ConflictException(
          'Não pode existir duplicação de combinação de item',
        );
      }

      requestHashes.add(hash);

      for (const optionId of optionIds) {
        if (!allowedOptionsMap.has(optionId)) {
          throw new BadRequestException('Variação inválida para este produto');
        }

        const variationId = variationIdsByOptionId.get(optionId)!;
        incomingVariationIds.add(variationId);
      }

      const variationIds = optionIds.map(
        (optionId) => variationIdsByOptionId.get(optionId)!,
      );

      if (new Set(variationIds).size !== optionIds.length) {
        throw new BadRequestException(
          'Cada item deve possuir no máximo uma opção por variação',
        );
      }
    }

    // Detecta mudança estrutural nas variações
    const existingKey = [...existingVariationIds].sort().join('|');
    const incomingKey = [...incomingVariationIds].sort().join('|');

    const variationStructureChanged = existingKey !== incomingKey;

    // Se mudou a estrutura das variações, remove todos os itens
    if (variationStructureChanged) {
      existingHashes.clear();
    }

    // Itens realmente novos
    const itemsToCreate = dto.items
      .filter((item) => {
        const optionIds = this.extractOptionIds(item.options);
        const hash = this.generateHash(optionIds);
        return !existingHashes.has(hash);
      })
      .map((item) => {
        const optionIds = this.extractOptionIds(item.options);
        return {
          stock: item.stock,

          hash: this.generateHash(optionIds),
          optionIds,
        };
      });

    await this.productsRepository.replaceProductItemsTransaction(
      productId,
      variationStructureChanged,
      itemsToCreate,
    );

    return this.productsRepository.listItems(productId);
  }
}
