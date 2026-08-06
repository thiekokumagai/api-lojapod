import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { CashRegister } from '../../domain/entities/cash-register.entity';
import { ICashRegistersRepository } from '../../domain/repositories/icash-registers.repository';

@Injectable()
export class PrismaCashRegistersRepository implements ICashRegistersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private mapToDomain(record: any): CashRegister {
    return new CashRegister({
      id: record.id,
      title: record.title,
      startDate: record.startDate,
      endDate: record.endDate,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      initialValue: record.transactions?.[0]?.amount ? Number(record.transactions[0].amount) : undefined,
    });
  }

  async create(data: Partial<CashRegister>): Promise<CashRegister> {
    const record = await this.prisma.cashRegister.create({
      data: {
        title: data.title!,
        startDate: data.startDate!,
        endDate: data.endDate!,
      },
    });
    return this.mapToDomain(record);
  }

  async update(id: string, data: Partial<CashRegister>): Promise<CashRegister> {
    const record = await this.prisma.cashRegister.update({
      where: { id },
      data: {
        title: data.title,
        startDate: data.startDate,
        endDate: data.endDate,
      },
    });
    return this.mapToDomain(record);
  }

  async findById(id: string): Promise<CashRegister | null> {
    const record = await this.prisma.cashRegister.findUnique({
      where: { id },
      include: {
        transactions: {
          where: { description: 'Caixa Inicial', category: 'Banco' },
          take: 1,
        }
      }
    });
    if (!record) return null;
    return this.mapToDomain(record);
  }

  async findAll(): Promise<CashRegister[]> {
    const records = await this.prisma.cashRegister.findMany({
      orderBy: { startDate: 'desc' },
      include: {
        transactions: {
          where: { description: 'Caixa Inicial', category: 'Banco' },
          take: 1,
        }
      }
    });
    return records.map((record) => this.mapToDomain(record));
  }

  async delete(id: string): Promise<void> {
    await this.prisma.cashRegister.delete({ where: { id } });
  }
}
