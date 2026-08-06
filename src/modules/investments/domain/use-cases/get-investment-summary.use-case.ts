import { Injectable } from '@nestjs/common';
import {
  IInvestmentsRepository,
  InvestmentSummary,
} from '../repositories/iinvestments.repository';

@Injectable()
export class GetInvestmentSummaryUseCase {
  constructor(private readonly investmentsRepository: IInvestmentsRepository) {}

  async execute(): Promise<InvestmentSummary> {
    return await this.investmentsRepository.getSummary();
  }
}
