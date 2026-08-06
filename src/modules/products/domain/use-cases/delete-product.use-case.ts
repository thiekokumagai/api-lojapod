import { Injectable, NotFoundException } from '@nestjs/common';
import { IProductsRepository } from '../repositories/iproducts.repository';

@Injectable()
export class DeleteProductUseCase {
  constructor(private readonly productsRepository: IProductsRepository) {}

  async execute(id: string): Promise<string[]> {
    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
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
