import { Injectable, BadRequestException } from '@nestjs/common';
import { IInvestmentsRepository } from '../repositories/iinvestments.repository';
import { InvestmentTransaction } from '../entities/investment-transaction.entity';

interface ExecuteInput {
  amount: number;
  description: string;
}

@Injectable()
export class RegisterPurchaseUseCase {
  constructor(private readonly investmentsRepository: IInvestmentsRepository) {}

  async execute({
    amount,
    description,
  }: ExecuteInput): Promise<InvestmentTransaction> {
    if (amount <= 0) {
      throw new BadRequestException(
        'O valor da compra deve ser maior que zero.',
      );
    }
    if (!description || description.trim() === '') {
      throw new BadRequestException('A descrição da compra é obrigatória.');
    }

    // Cria a saída no módulo de investimento
    return await this.investmentsRepository.create({
      type: 'OUTFLOW',
      amount,
      description,
    });
  }
}
