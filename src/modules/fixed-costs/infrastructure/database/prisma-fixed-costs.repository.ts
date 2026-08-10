import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { FixedCost } from '../../domain/entities/fixed-cost.entity';
import { CashTransaction } from '../../domain/entities/cash-transaction.entity';
import { IFixedCostsRepository } from '../../domain/repositories/ifixed-costs.repository';

@Injectable()
export class PrismaFixedCostsRepository implements IFixedCostsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private mapFixedCost(record: any, paidInstallments?: number): FixedCost {
    const paid = paidInstallments ?? 0;
    return {
      id: record.id,
      name: record.name,
      value: Number(record.value),
      repeats: record.repeats,
      type: record.type,
      installmentsCount: record.installmentsCount,
      paidInstallments: paid,
      currentInstallment: paid + 1,
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
    const activeRegister = await this.findActiveCashRegister();
    const records = await this.prisma.fixedCost.findMany({
      include: {
        transactions: {
          where: { type: 'OUTFLOW' },
          select: { id: true, cashRegisterId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result: FixedCost[] = [];

    for (const record of records) {
      const outflows = record.transactions || [];
      const paidCount = outflows.length;

      // Se for parcelado e todas as parcelas foram quitadas, oculta definitivamente
      if (
        record.repeats &&
        record.type === 'INSTALLMENTS' &&
        record.installmentsCount &&
        paidCount >= record.installmentsCount
      ) {
        continue;
      }

      // Se houver caixa ativo aberto, oculta se já tiver registrado pagamento (OUTFLOW) neste caixa
      if (activeRegister) {
        const paidInCurrentRegister = outflows.some(
          (t) => t.cashRegisterId === activeRegister.id,
        );
        if (paidInCurrentRegister) {
          continue;
        }
      }

      result.push(this.mapFixedCost(record, paidCount));
    }

    return result;
  }

  async findById(id: string): Promise<FixedCost | null> {
    const record = await this.prisma.fixedCost.findUnique({
      where: { id },
      include: {
        transactions: {
          where: { type: 'OUTFLOW' },
          select: { id: true, cashRegisterId: true },
        },
      },
    });
    if (!record) return null;
    const paidCount = record.transactions ? record.transactions.length : 0;
    return this.mapFixedCost(record, paidCount);
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
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Campo_Grande',
    }).format(new Date());

    const registers = await this.prisma.cashRegister.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, startDate: true, endDate: true },
    });

    const active = registers.find((r) => {
      const startStr = r.startDate.toISOString().split('T')[0];
      const endStr = r.endDate.toISOString().split('T')[0];
      return todayStr >= startStr && todayStr <= endStr;
    });

    return active ? { id: active.id } : null;
  }

  async hasTransactionInRegister(
    fixedCostId: string,
    cashRegisterId: string,
  ): Promise<boolean> {
    const count = await this.prisma.cashTransaction.count({
      where: {
        fixedCostId,
        cashRegisterId,
        type: 'OUTFLOW',
      },
    });
    return count > 0;
  }
}
