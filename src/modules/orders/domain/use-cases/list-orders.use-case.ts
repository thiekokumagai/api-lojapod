import { Injectable } from '@nestjs/common';
import {
  IOrdersRepository,
  OrderFilters,
  PaginatedOrders,
} from '../repositories/iorders.repository';

@Injectable()
export class ListOrdersUseCase {
  constructor(private readonly ordersRepository: IOrdersRepository) {}

  async execute(filters: OrderFilters): Promise<PaginatedOrders> {
    return this.ordersRepository.findMany(filters);
  }
}
