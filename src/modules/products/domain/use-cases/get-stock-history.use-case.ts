import { Injectable } from '@nestjs/common';
import { IProductsRepository } from '../repositories/iproducts.repository';

@Injectable()
export class GetStockHistoryUseCase {
  constructor(private readonly productsRepository: IProductsRepository) {}

  async execute(productId: string) {
    return this.productsRepository.getStockHistory(productId);
  }
}
