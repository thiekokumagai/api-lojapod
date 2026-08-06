import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  IInvestmentsRepository,
  InvestmentSummary,
} from '../../domain/repositories/iinvestments.repository';
import { InvestmentTransaction } from '../../domain/entities/investment-transaction.entity';

@Injectable()
export class PrismaInvestmentsRepository implements IInvestmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    type: 'ENTRY' | 'OUTFLOW';
    amount: number;
    description?: string;
  }): Promise<InvestmentTransaction> {
    const raw = await this.prisma.investmentTransaction.create({
      data: {
        type: data.type,
        amount: data.amount,
        description: data.description,
      },
    });

    return new InvestmentTransaction({
      ...raw,
      description: raw.description ?? undefined,
      type: raw.type as 'ENTRY' | 'OUTFLOW',
      amount: Number(raw.amount),
    });
  }

  async findAll(): Promise<InvestmentTransaction[]> {
    const raw = await this.prisma.investmentTransaction.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return raw.map(
      (r) =>
        new InvestmentTransaction({
          ...r,
          description: r.description ?? undefined,
          type: r.type as 'ENTRY' | 'OUTFLOW',
          amount: Number(r.amount),
        }),
    );
  }

  async getSummary(): Promise<InvestmentSummary> {
    const transactions = await this.prisma.investmentTransaction.findMany();

    const totalEntries = transactions
      .filter((t) => t.type === 'ENTRY')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const totalOutflows = transactions
      .filter((t) => t.type === 'OUTFLOW')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const totalBalance = totalEntries - totalOutflows;

    return {
      totalBalance,
      totalEntries,
      totalOutflows,
    };
  }

  async delete(id: string): Promise<void> {
    await this.prisma.investmentTransaction.delete({
      where: { id },
    });
  }
}
