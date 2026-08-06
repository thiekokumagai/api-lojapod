import { Injectable, BadRequestException } from '@nestjs/common';
import { IInvestmentsRepository } from '../repositories/iinvestments.repository';
import { InvestmentTransaction } from '../entities/investment-transaction.entity';

interface ExecuteInput {
  amount: number;
  description?: string;
}

@Injectable()
export class AddInvestmentUseCase {
  constructor(private readonly investmentsRepository: IInvestmentsRepository) {}

  async execute({
    amount,
    description,
  }: ExecuteInput): Promise<InvestmentTransaction> {
    if (amount <= 0) {
      throw new BadRequestException(
        'O valor do investimento deve ser maior que zero.',
      );
    }

    // Cria a entrada no módulo de investimento
    return await this.investmentsRepository.create({
      type: 'ENTRY',
      amount,
      description: description || 'Adição de capital de investimento',
    });
  }
}
