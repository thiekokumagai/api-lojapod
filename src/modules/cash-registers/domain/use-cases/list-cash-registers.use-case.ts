import { Injectable } from '@nestjs/common';
import { ICashRegistersRepository } from '../repositories/icash-registers.repository';
import { CashRegister } from '../entities/cash-register.entity';

@Injectable()
export class ListCashRegistersUseCase {
  constructor(private readonly repo: ICashRegistersRepository) {}

  async execute(): Promise<CashRegister[]> {
    return await this.repo.findAll();
  }
}
