import { InvestmentTransaction } from '../entities/investment-transaction.entity';

export interface InvestmentSummary {
  totalBalance: number;
  totalEntries: number;
  totalOutflows: number;
}

export abstract class IInvestmentsRepository {
  abstract create(data: {
    type: 'ENTRY' | 'OUTFLOW';
    amount: number;
    description?: string;
  }): Promise<InvestmentTransaction>;
  abstract findAll(): Promise<InvestmentTransaction[]>;
  abstract getSummary(): Promise<InvestmentSummary>;
  abstract delete(id: string): Promise<void>;
}
