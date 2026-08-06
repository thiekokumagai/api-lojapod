import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  Customer,
  CustomerAddress,
} from '../../domain/entities/customer.entity';
import {
  ICustomersRepository,
  CustomerFilters,
  PaginatedCustomers,
} from '../../domain/repositories/icustomers.repository';

@Injectable()
export class PrismaCustomersRepository implements ICustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private mapToDomain(record: any): Customer {
    return new Customer({
      id: record.id,
      name: record.name,
      phone: record.phone,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      addresses:
        record.addresses?.map((addr: any) => new CustomerAddress(addr)) || [],
      orders: record.orders || [],
    });
  }

  async findMany(filters: CustomerFilters): Promise<PaginatedCustomers> {
    const where: any = {};
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search, mode: 'insensitive' } },
      ];

      const cleanSearch = filters.search.replace(/\D/g, '');
      if (cleanSearch.length > 0) {
        where.OR.push({ phone: { contains: cleanSearch, mode: 'insensitive' } });
        
        let f1 = cleanSearch;
        if (cleanSearch.length >= 2) f1 = '(' + cleanSearch.substring(0, 2) + (cleanSearch.length > 2 ? ') ' + cleanSearch.substring(2) : '');
        if (cleanSearch.length >= 7) f1 = f1.substring(0, 10) + '-' + f1.substring(10);
        where.OR.push({ phone: { contains: f1, mode: 'insensitive' } });

        let f2 = cleanSearch;
        if (cleanSearch.length >= 5) f2 = cleanSearch.substring(0, 5) + '-' + cleanSearch.substring(5);
        where.OR.push({ phone: { contains: f2, mode: 'insensitive' } });

        let f3 = cleanSearch;
        if (cleanSearch.length >= 4) f3 = cleanSearch.substring(0, 4) + '-' + cleanSearch.substring(4);
        where.OR.push({ phone: { contains: f3, mode: 'insensitive' } });
      }
    }
    const page = filters.page ? Math.max(1, Number(filters.page)) : 1;
    const limit = filters.limit ? Math.max(1, Number(filters.limit)) : 10;
    const skip = (page - 1) * limit;

    const total = await this.prisma.customer.count({ where });
    const records = await this.prisma.customer.findMany({
      where,
      include: { addresses: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    return {
      data: records.map((record: any) => this.mapToDomain(record)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string): Promise<Customer | null> {
    const record = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        addresses: true,
        orders: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!record) return null;
    return this.mapToDomain(record);
  }

  async create(data: { name: string; phone: string }): Promise<Customer> {
    if (data.phone) {
      const cleanPhone = data.phone.replace(/\D/g, '');
      if (cleanPhone) {
        const existing = await this.prisma.customer.findFirst({
          where: {
            OR: [
              { phone: data.phone },
              { phone: cleanPhone },
            ],
          },
        });
        if (existing) {
          const existingClean = existing.phone.replace(/\D/g, '');
          if (existingClean === cleanPhone || existing.phone === data.phone) {
            throw { code: 'P2002', message: 'Telefone já cadastrado por outro cliente' };
          }
        }
      }
    }
    const record = await this.prisma.customer.create({
      data: {
        name: data.name,
        phone: data.phone,
      },
      include: { addresses: true },
    });
    return this.mapToDomain(record);
  }

  async update(id: string, data: Partial<Customer>): Promise<Customer> {
    if (data.phone) {
      const cleanPhone = data.phone.replace(/\D/g, '');
      if (cleanPhone) {
        const existing = await this.prisma.customer.findFirst({
          where: {
            id: { not: id },
            OR: [
              { phone: data.phone },
              { phone: cleanPhone },
            ],
          },
        });
        if (existing) {
          const existingClean = existing.phone.replace(/\D/g, '');
          if (existingClean === cleanPhone || existing.phone === data.phone) {
            throw { code: 'P2002', message: 'Telefone já cadastrado por outro cliente' };
          }
        }
      }
    }
    const record = await this.prisma.customer.update({
      where: { id },
      data: {
        name: data.name,
        phone: data.phone,
      },
      include: { addresses: true },
    });
    return this.mapToDomain(record);
  }

  async addAddress(id: string, address: any): Promise<Customer> {
    // Verifica se já existe um endereço com o mesmo CEP e número para não duplicar
    const existingAddress = await this.prisma.customerAddress.findFirst({
      where: {
        customerId: id,
        cep: address.cep,
        number: address.number,
      },
    });

    // Sempre remove o default dos outros endereços
    await this.prisma.customerAddress.updateMany({
      where: { customerId: id },
      data: { isDefault: false },
    });

    if (existingAddress) {
      // Se existir, apenas atualiza para ser o padrão
      await this.prisma.customerAddress.update({
        where: { id: existingAddress.id },
        data: { isDefault: true },
      });
    } else {
      // Se não existir, cria o novo como padrão
      await this.prisma.customerAddress.create({
        data: {
          customerId: id,
          street: address.street,
          number: address.number,
          neighborhood: address.neighborhood,
          city: address.city,
          state: address.state,
          cep: address.cep,
          complement: address.complement,
          isDefault: true, // Sempre o novo cadastrado será o padrão
        },
      });
    }

    const record = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        addresses: true,
        orders: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!record) throw new Error('Customer not found');
    return this.mapToDomain(record);
  }

  async updateAddress(customerId: string, addressId: string, data: any): Promise<Customer> {
    await this.prisma.customerAddress.update({
      where: { id: addressId },
      data: {
        street: data.street,
        number: data.number,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
        cep: data.cep,
        complement: data.complement,
      },
    });

    const record = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        addresses: true,
        orders: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!record) throw new Error('Customer not found');
    return this.mapToDomain(record);
  }
}
