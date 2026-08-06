import { Injectable } from '@nestjs/common';
import { IInvestmentsRepository } from '../repositories/iinvestments.repository';
import { InvestmentTransaction } from '../entities/investment-transaction.entity';

@Injectable()
export class ListInvestmentTransactionsUseCase {
  constructor(private readonly investmentsRepository: IInvestmentsRepository) {}

  async execute(): Promise<InvestmentTransaction[]> {
    return await this.investmentsRepository.findAll();
  }
}
