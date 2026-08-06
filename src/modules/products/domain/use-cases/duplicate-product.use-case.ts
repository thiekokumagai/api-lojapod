import { Injectable, NotFoundException } from '@nestjs/common';
import { IProductsRepository } from '../repositories/iproducts.repository';

@Injectable()
export class DuplicateProductUseCase {
  constructor(private readonly productsRepository: IProductsRepository) {}

  async execute(id: string) {
    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw new NotFoundException('Produto original não encontrado');
    }
    return this.productsRepository.duplicate(id);
  }
}
