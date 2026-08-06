import { Injectable, NotFoundException } from '@nestjs/common';
import { ICashRegistersRepository } from '../repositories/icash-registers.repository';
import { CashRegister } from '../entities/cash-register.entity';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class UpdateCashRegisterUseCase {
  constructor(
    private readonly repo: ICashRegistersRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    id: string,
    data: Partial<CashRegister> & { initialValue?: number },
  ): Promise<CashRegister> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException(`CashRegister with ID ${id} not found`);
    }

    const { initialValue, ...cashRegisterData } = data;

    if (initialValue !== undefined) {
      const initialTx = await this.prisma.cashTransaction.findFirst({
        where: {
          cashRegisterId: id,
          description: 'Caixa Inicial',
          category: 'Banco'
        }
      });

      if (initialTx) {
        if (initialValue > 0) {
          await this.prisma.cashTransaction.update({
            where: { id: initialTx.id },
            data: { amount: initialValue }
          });
        } else {
          await this.prisma.cashTransaction.delete({
            where: { id: initialTx.id }
          });
        }
      } else if (initialValue > 0) {
        await this.prisma.cashTransaction.create({
          data: {
            cashRegisterId: id,
            type: 'ENTRY',
            category: 'Banco',
            amount: initialValue,
            description: 'Caixa Inicial',
          }
        });
      }
    }

    return await this.repo.update(id, cashRegisterData);
  }
}
