import { Injectable, NotFoundException } from '@nestjs/common';
import { IProductsRepository } from '../repositories/iproducts.repository';
import { CombosService } from '../../../combos/infrastructure/services/combos.service';

@Injectable()
export class DeleteProductUseCase {
  constructor(
    private readonly productsRepository: IProductsRepository,
    private readonly combosService: CombosService,
  ) {}

  async execute(id: string): Promise<string[]> {
    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    try {
      await this.combosService.checkAndDeactivateAffectedCombos(id);
    } catch (err) {
      console.error('Erro ao desativar combos afetados pelo produto:', err);
    }

    const imageUrls = await this.productsRepository.softDelete(id);
    
    const urlsToDelete: string[] = [];
    for (const url of imageUrls) {
      const count = await this.productsRepository.countImagesByUrl(url);
      if (count === 0) {
        urlsToDelete.push(url);
      }
    }
    
    return urlsToDelete;
  }
}
