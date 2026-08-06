import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import type { ICustomersRepository } from '../repositories/icustomers.repository';
import { Customer } from '../entities/customer.entity';

@Injectable()
export class CreateCustomerUseCase {
  constructor(
    @Inject('ICustomersRepository')
    private readonly customersRepository: ICustomersRepository,
  ) {}

  async execute(data: { name: string; phone: string }): Promise<Customer> {
    try {
      return await this.customersRepository.create(data);
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new BadRequestException('Telefone já cadastrado por outro cliente.');
      }
      throw new BadRequestException('Erro ao criar cliente: ' + error.message);
    }
  }
}
