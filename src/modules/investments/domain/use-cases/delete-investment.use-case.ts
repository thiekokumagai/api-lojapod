import { Injectable } from '@nestjs/common';
import { IInvestmentsRepository } from '../repositories/iinvestments.repository';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class DeleteInvestmentUseCase {
  constructor(
    private readonly investmentsRepository: IInvestmentsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(id: string): Promise<void> {
    const tx = await this.prisma.investmentTransaction.findUnique({
      where: { id },
    });

    if (tx) {
      const descriptionToMatch = tx.description || 'Transferência para Investimento';

      await this.prisma.cashTransaction.deleteMany({
        where: {
          amount: tx.amount,
          description: descriptionToMatch,
          type: 'OUTFLOW',
          category: 'INVESTMENT',
        },
      });
      // Try with "GENERAL" too, just in case it was created before we fixed the category
      await this.prisma.cashTransaction.deleteMany({
        where: {
          amount: tx.amount,
          description: descriptionToMatch,
          type: 'OUTFLOW',
          category: 'GENERAL',
        },
      });
    }

    await this.investmentsRepository.delete(id);
  }
}
