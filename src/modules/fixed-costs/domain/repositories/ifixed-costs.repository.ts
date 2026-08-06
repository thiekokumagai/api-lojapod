import { FixedCost } from '../entities/fixed-cost.entity';
import { CashTransaction } from '../entities/cash-transaction.entity';

export abstract class IFixedCostsRepository {
  abstract findAll(): Promise<FixedCost[]>;
  abstract findById(id: string): Promise<FixedCost | null>;
  abstract create(data: {
    name: string;
    value: number;
    repeats: boolean;
    type: string;
    installmentsCount?: number | null;
  }): Promise<FixedCost>;
  abstract update(
    id: string,
    data: {
      name?: string;
      value?: number;
      repeats?: boolean;
      type?: string;
      installmentsCount?: number | null;
    },
  ): Promise<FixedCost>;
  abstract delete(id: string): Promise<FixedCost>;

  abstract createTransaction(data: {
    cashRegisterId: string | null;
    type: string;
    amount: number;
    description: string;
    fixedCostId?: string | null;
    category?: string | null;
  }): Promise<CashTransaction>;

  abstract findTransactionById(id: string): Promise<CashTransaction | null>;
  abstract deleteTransaction(id: string): Promise<CashTransaction>;

  abstract findActiveCashRegister(): Promise<{ id: string } | null>;
}
