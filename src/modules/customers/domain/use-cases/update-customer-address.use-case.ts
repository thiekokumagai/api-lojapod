import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import type { ICustomersRepository } from '../repositories/icustomers.repository';
import { Customer } from '../entities/customer.entity';

@Injectable()
export class UpdateCustomerAddressUseCase {
  constructor(
    @Inject('ICustomersRepository')
    private readonly customersRepository: ICustomersRepository,
  ) {}

  async execute(customerId: string, addressId: string, data: any): Promise<Customer> {
    const customer = await this.customersRepository.findById(customerId);
    if (!customer) {
      throw new NotFoundException('Cliente não encontrado.');
    }

    const address = customer.addresses?.find((a) => a.id === addressId);
    if (!address) {
      throw new NotFoundException('Endereço não encontrado para este cliente.');
    }

    return this.customersRepository.updateAddress(customerId, addressId, data);
  }
}
