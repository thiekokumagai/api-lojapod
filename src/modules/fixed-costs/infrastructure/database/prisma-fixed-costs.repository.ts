import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { FixedCost } from '../../domain/entities/fixed-cost.entity';
import { CashTransaction } from '../../domain/entities/cash-transaction.entity';
import { IFixedCostsRepository } from '../../domain/repositories/ifixed-costs.repository';

@Injectable()
export class PrismaFixedCostsRepository implements IFixedCostsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private mapFixedCost(record: any): FixedCost {
    return {
      id: record.id,
      name: record.name,
      value: Number(record.value),
      repeats: record.repeats,
      type: record.type,
      installmentsCount: record.installmentsCount,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private mapTransaction(record: any): CashTransaction {
    return {
      id: record.id,
      cashRegisterId: record.cashRegisterId,
      type: record.type,
      amount: Number(record.amount),
      description: record.description,
      date: record.date,
      fixedCostId: record.fixedCostId,
      category: record.category,
      createdAt: record.createdAt,
    };
  }

  async findAll(): Promise<FixedCost[]> {
    const records = await this.prisma.fixedCost.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.mapFixedCost(r));
  }

  async findById(id: string): Promise<FixedCost | null> {
    const record = await this.prisma.fixedCost.findUnique({
      where: { id },
    });
    return record ? this.mapFixedCost(record) : null;
  }

  async create(data: {
    name: string;
    value: number;
    repeats: boolean;
    type: string;
    installmentsCount?: number | null;
  }): Promise<FixedCost> {
    const record = await this.prisma.fixedCost.create({
      data: {
        name: data.name,
        value: data.value,
        repeats: data.repeats,
        type: data.type,
        installmentsCount: data.installmentsCount ?? null,
      },
    });
    return this.mapFixedCost(record);
  }

  async update(
    id: string,
    data: {
      name?: string;
      value?: number;
      repeats?: boolean;
      type?: string;
      installmentsCount?: number | null;
    },
  ): Promise<FixedCost> {
    const record = await this.prisma.fixedCost.update({
      where: { id },
      data: {
        name: data.name,
        value: data.value,
        repeats: data.repeats,
        type: data.type,
        installmentsCount:
          data.installmentsCount !== undefined
            ? data.installmentsCount
            : undefined,
      },
    });
    return this.mapFixedCost(record);
  }

  async delete(id: string): Promise<FixedCost> {
    const record = await this.prisma.fixedCost.delete({
      where: { id },
    });
    return this.mapFixedCost(record);
  }

  async createTransaction(data: {
    cashRegisterId: string | null;
    type: string;
    amount: number;
    description: string;
    fixedCostId?: string | null;
    category?: string | null;
  }): Promise<CashTransaction> {
    const record = await this.prisma.cashTransaction.create({
      data: {
        cashRegisterId: data.cashRegisterId,
        type: data.type,
        amount: data.amount,
        description: data.description,
        fixedCostId: data.fixedCostId ?? null,
        category: data.category ?? 'GENERAL',
      },
    });
    return this.mapTransaction(record);
  }

  async findTransactionById(id: string): Promise<CashTransaction | null> {
    const record = await this.prisma.cashTransaction.findUnique({
      where: { id },
    });
    return record ? this.mapTransaction(record) : null;
  }

  async deleteTransaction(id: string): Promise<CashTransaction> {
    const record = await this.prisma.cashTransaction.delete({
      where: { id },
    });
    return this.mapTransaction(record);
  }

  async findActiveCashRegister(): Promise<{ id: string } | null> {
    const today = new Date();
    return this.prisma.cashRegister.findFirst({
      where: {
        startDate: { lte: today },
        endDate: { gte: today },
      },
      select: { id: true },
    });
  }
}
