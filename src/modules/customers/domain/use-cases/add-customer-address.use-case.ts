import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { ICustomersRepository } from '../repositories/icustomers.repository';
import { Customer } from '../entities/customer.entity';

@Injectable()
export class AddCustomerAddressUseCase {
  constructor(
    @Inject('ICustomersRepository')
    private readonly customersRepository: ICustomersRepository,
  ) {}

  async execute(id: string, addressData: any): Promise<Customer> {
    const customer = await this.customersRepository.findById(id);
    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }

    return this.customersRepository.addAddress(id, addressData);
  }
}
