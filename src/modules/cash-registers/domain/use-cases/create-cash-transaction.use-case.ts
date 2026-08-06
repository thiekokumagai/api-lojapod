import { Injectable, NotFoundException } from '@nestjs/common';
import { ICashRegistersRepository } from '../repositories/icash-registers.repository';
import { PrismaService } from '../../../../../prisma/prisma.service';

export interface CreateCashTransactionInput {
  cashRegisterId: string;
  type: 'ENTRY' | 'OUTFLOW';
  amount: number;
  description: string;
  category?: string;
}

@Injectable()
export class CreateCashTransactionUseCase {
  constructor(
    private readonly cashRegistersRepo: ICashRegistersRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(input: CreateCashTransactionInput): Promise<any> {
    const register = await this.cashRegistersRepo.findById(
      input.cashRegisterId,
    );
    if (!register) {
      throw new NotFoundException(
        `CashRegister with ID ${input.cashRegisterId} not found`,
      );
    }

    const tx = await this.prisma.cashTransaction.create({
      data: {
        cashRegisterId: input.cashRegisterId,
        type: input.type,
        amount: input.amount,
        description: input.description,
        category: input.category || 'GENERAL',
      },
    });

    return {
      ...tx,
      amount: Number(tx.amount),
    };
  }
}
