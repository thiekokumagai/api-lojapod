import { Injectable, NotFoundException } from '@nestjs/common';
import { ICashRegistersRepository } from '../repositories/icash-registers.repository';

@Injectable()
export class DeleteCashRegisterUseCase {
  constructor(private readonly repo: ICashRegistersRepository) {}

  async execute(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException(`CashRegister with ID ${id} not found`);
    }
    await this.repo.delete(id);
  }
}
