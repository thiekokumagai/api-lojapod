import { Injectable, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { CreateStoreDto } from '../../infrastructure/dtos/create-store.dto';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

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

    const printToken = `PRT-${randomUUID().substring(0, 8).toUpperCase()}`;

    const store = await this.prisma.store.create({
      data: {
        subdomain: subdomainNormalized,
        title: dto.title.trim(),
        adminEmail: dto.adminEmail.trim().toLowerCase(),
        printToken,
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

  async validatePrintToken(token: string) {
    if (!token || !token.trim()) {
      throw new UnauthorizedException('Token de impressão não informado');
    }

    const store = await this.prisma.store.findUnique({
      where: { printToken: token.trim() },
    });

    if (!store) {
      throw new UnauthorizedException('Token de impressão inválido');
    }

    return {
      success: true,
      storeId: store.id,
      storeName: store.title,
      subdomain: store.subdomain,
      printToken: store.printToken,
    };
  }

  async getPrintTokenForStore(storeId: string) {
    let store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      throw new NotFoundException('Loja não encontrada');
    }

    // Se a loja não tem um printToken gerado ainda, gera um
    if (!store.printToken) {
      const printToken = `PRT-${randomUUID().substring(0, 8).toUpperCase()}`;
      store = await this.prisma.store.update({
        where: { id: storeId },
        data: { printToken },
      });
    }

    return {
      printToken: store.printToken,
    };
  }

  async rotatePrintToken(storeId: string) {
    const printToken = `PRT-${randomUUID().substring(0, 8).toUpperCase()}`;
    const store = await this.prisma.store.update({
      where: { id: storeId },
      data: { printToken },
    });

    return {
      printToken: store.printToken,
    };
  }
}
