import { Injectable, Inject } from '@nestjs/common';
import type { ICustomersRepository } from '../repositories/icustomers.repository';
import {
  PaginatedCustomers,
  CustomerFilters,
} from '../repositories/icustomers.repository';

@Injectable()
export class ListCustomersUseCase {
  constructor(
    @Inject('ICustomersRepository')
    private readonly customersRepository: ICustomersRepository,
  ) {}

  async execute(filters: CustomerFilters): Promise<PaginatedCustomers> {
    return this.customersRepository.findMany(filters);
  }
}
