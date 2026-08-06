import { Injectable, BadRequestException } from '@nestjs/common';
import { IFixedCostsRepository } from '../repositories/ifixed-costs.repository';

interface Input {
  cashRegisterId: string;
  type: string;
  amount: number;
  description: string;
  category?: string;
}

@Injectable()
export class CreateCashTransactionUseCase {
  constructor(private readonly repository: IFixedCostsRepository) {}

  async execute(input: Input) {
    if (input.type !== 'ENTRY' && input.type !== 'OUTFLOW') {
      throw new BadRequestException(
        'Transaction type must be ENTRY or OUTFLOW',
      );
    }

    if (input.amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    // Verify cash register is active
    const activeCashRegister = await this.repository.findActiveCashRegister();
    if (!activeCashRegister || activeCashRegister.id !== input.cashRegisterId) {
      throw new BadRequestException(
        'Cash register is not active or does not exist',
      );
    }

    return this.repository.createTransaction({
      cashRegisterId: input.cashRegisterId,
      type: input.type,
      amount: input.amount,
      description: input.description,
      fixedCostId: null,
      category: input.category || 'GENERAL',
    } as any);
  }
}
