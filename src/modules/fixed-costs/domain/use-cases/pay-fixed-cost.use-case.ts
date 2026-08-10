import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
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

    // Verificar se esta conta fixa já foi paga no caixa especificado
    const alreadyPaid = await this.repository.hasTransactionInRegister(
      fixedCost.id,
      registerId,
    );
    if (alreadyPaid) {
      throw new ConflictException('Esta conta fixa já foi paga neste caixa');
    }

    // Para contas do tipo INSTALLMENTS, verificar se todas as parcelas já foram quitadas
    if (
      fixedCost.repeats &&
      fixedCost.type === 'INSTALLMENTS' &&
      fixedCost.installmentsCount &&
      (fixedCost.paidInstallments ?? 0) >= fixedCost.installmentsCount
    ) {
      throw new BadRequestException(
        'Esta conta fixa parcelada já teve todas as parcelas quitadas',
      );
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
