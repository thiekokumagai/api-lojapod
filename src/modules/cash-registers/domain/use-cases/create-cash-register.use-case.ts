import { Injectable } from '@nestjs/common';
import { ICashRegistersRepository } from '../repositories/icash-registers.repository';
import { CashRegister } from '../entities/cash-register.entity';
import { CreateCashTransactionUseCase } from './create-cash-transaction.use-case';

@Injectable()
export class CreateCashRegisterUseCase {
  constructor(
    private readonly repo: ICashRegistersRepository,
    private readonly createTransactionUseCase: CreateCashTransactionUseCase
  ) {}

  async execute(data: {
    title: string;
    startDate: Date;
    endDate: Date;
    initialValue?: number;
  }): Promise<CashRegister> {
    const cashRegister = await this.repo.create({
      title: data.title,
      startDate: data.startDate,
      endDate: data.endDate,
    });

    if (data.initialValue && data.initialValue > 0) {
      await this.createTransactionUseCase.execute({
        cashRegisterId: cashRegister.id,
        type: 'ENTRY',
        category: 'Banco',
        amount: data.initialValue,
        description: 'Caixa Inicial',
      });
    }

    return cashRegister;
  }
}
