import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import type { ICustomersRepository } from '../repositories/icustomers.repository';
import { Customer } from '../entities/customer.entity';

@Injectable()
export class UpdateCustomerUseCase {
  constructor(
    @Inject('ICustomersRepository')
    private readonly customersRepository: ICustomersRepository,
  ) {}

  async execute(id: string, data: Partial<Customer>): Promise<Customer> {
    const customer = await this.customersRepository.findById(id);
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }
    try {
      return await this.customersRepository.update(id, data);
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new BadRequestException('Este número de telefone já está cadastrado em outro cliente.');
      }
      throw new BadRequestException('Erro ao atualizar cliente: ' + (error.message || 'Erro desconhecido'));
    }
  }
}
