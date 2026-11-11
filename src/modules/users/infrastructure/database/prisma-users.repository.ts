import { Injectable } from '@nestjs/common';
import { IUsersRepository } from '../../domain/repositories/iusers.repository';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { StoreUser, User } from '../../domain/entities/user.entity';
import { STAFF_ROLE } from '../../../auth/permissions/screen-permissions';

const storeUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  permissions: true,
  createdAt: true,
} as const;

@Injectable()
export class PrismaUsersRepository implements IUsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<User[]> {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async create(data: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    return this.prisma.user.create({
      data,
    });
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<User> {
    return this.prisma.user.delete({
      where: { id },
    });
  }

  async listByStore(storeId: string): Promise<StoreUser[]> {
    return this.prisma.user.findMany({
      where: { storeId },
      select: storeUserSelect,
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findStoreUser(id: string, storeId: string): Promise<StoreUser | null> {
    // findFirst para que o filtro por loja seja aplicado (findUnique não filtra por storeId)
    return this.prisma.user.findFirst({
      where: { id, storeId },
      select: storeUserSelect,
    });
  }

  async createStoreUser(data: {
    name: string;
    email: string;
    password: string;
    storeId: string;
    permissions: string[];
  }): Promise<StoreUser> {
    return this.prisma.user.create({
      data: { ...data, role: STAFF_ROLE },
      select: storeUserSelect,
    });
  }

  async updateStoreUser(
    id: string,
    data: { name?: string; email?: string; password?: string; permissions?: string[] },
  ): Promise<StoreUser> {
    return this.prisma.user.update({
      where: { id },
      data,
      select: storeUserSelect,
    });
  }
}
