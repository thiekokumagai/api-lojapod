import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { CreateStoreDto } from '../../infrastructure/dtos/create-store.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async createStore(dto: CreateStoreDto) {
    const subdomainNormalized = dto.subdomain.trim().toLowerCase();

    const existingStore = await this.prisma.store.findUnique({
      where: { subdomain: subdomainNormalized },
    });

    if (existingStore) {
      throw new ConflictException(`Já existe uma loja cadastrada com o subdomínio "${subdomainNormalized}"`);
    }

    const store = await this.prisma.store.create({
      data: {
        subdomain: subdomainNormalized,
        title: dto.title.trim(),
        adminEmail: dto.adminEmail.trim().toLowerCase(),
      },
    });

    // Criar as configurações iniciais da loja
    await this.prisma.storeSettings.create({
      data: {
        storeId: store.id,
        storeName: store.title,
      },
    });

    // Criar o usuário Admin da loja se senha fornecida
    if (dto.password) {
      const hashedPassword = await bcrypt.hash(dto.password, 10);
      await this.prisma.user.upsert({
        where: { email: dto.adminEmail.trim().toLowerCase() },
        update: {
          storeId: store.id,
          role: 'ADMIN',
          password: hashedPassword,
        },
        create: {
          name: `Admin - ${store.title}`,
          email: dto.adminEmail.trim().toLowerCase(),
          password: hashedPassword,
          role: 'ADMIN',
          storeId: store.id,
        },
      });
    }

    return store;
  }

  async listStores() {
    return this.prisma.store.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            products: true,
            orders: true,
            customers: true,
          },
        },
      },
    });
  }

  async getStoreBySubdomain(subdomain: string) {
    const store = await this.prisma.store.findUnique({
      where: { subdomain: subdomain.toLowerCase() },
      include: {
        storeSettings: true,
      },
    });

    if (!store) {
      throw new NotFoundException(`Loja com subdomínio "${subdomain}" não encontrada`);
    }

    return store;
  }

  async getStoreById(id: string) {
    const store = await this.prisma.store.findUnique({
      where: { id },
      include: {
        storeSettings: true,
      },
    });

    if (!store) {
      throw new NotFoundException('Loja não encontrada');
    }

    return store;
  }
}
