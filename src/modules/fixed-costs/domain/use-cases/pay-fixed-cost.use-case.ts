import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CashTransaction } from '../entities/cash-transaction.entity';
import { IFixedCostsRepository } from '../repositories/ifixed-costs.repository';

export interface PayFixedCostInput {
  fixedCostId: string;
  amount: number;
  cashRegisterId?: string;
  description?: string;
}

@Injectable()
export class PayFixedCostUseCase {
  constructor(private readonly repository: IFixedCostsRepository) {}

  async execute(input: PayFixedCostInput): Promise<CashTransaction> {
    const fixedCost = await this.repository.findById(input.fixedCostId);
    if (!fixedCost) {
      throw new NotFoundException(
        `FixedCost with ID ${input.fixedCostId} not found`,
      );
    }

    let registerId = input.cashRegisterId;
    if (!registerId) {
      const activeRegister = await this.repository.findActiveCashRegister();
      if (!activeRegister) {
        throw new BadRequestException(
          'Nenhum caixa ativo encontrado para este pagamento',
        );
      }
      registerId = activeRegister.id;
    }

    const description = input.description || `Pagamento: ${fixedCost.name}`;

    const tx = await this.repository.createTransaction({
      cashRegisterId: registerId,
      type: 'OUTFLOW',
      amount: input.amount,
      description,
      fixedCostId: fixedCost.id,
    });

    return tx;
  }
}
