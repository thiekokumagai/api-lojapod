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
    const RESERVED_SUBDOMAINS = ['app', 'admin', 'api', 'www', 'localhost', 'superadmin'];

    if (RESERVED_SUBDOMAINS.includes(subdomainNormalized)) {
      throw new ConflictException(`O subdomínio "${subdomainNormalized}" é um nome reservado pelo sistema e não pode ser utilizado.`);
    }

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
        subscriptionExpiresAt: dto.subscriptionExpiresAt ? new Date(dto.subscriptionExpiresAt) : undefined,
        monthlyFee: dto.monthlyFee !== undefined ? Number(dto.monthlyFee) : undefined,
      },
    });

    // Criar as configurações iniciais da loja
    await this.prisma.storeSettings.create({
      data: {
        storeId: store.id,
        storeName: store.title,
      },
    });

    // Criar o usuário Admin da loja se senha fornecida (ou senha padrão admin123)
    const passwordToUse = dto.password?.trim() || 'admin123';
    const hashedPassword = await bcrypt.hash(passwordToUse, 10);

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

    return store;
  }

  async updateStore(id: string, dto: { title?: string; subdomain?: string; adminEmail?: string; password?: string; subscriptionExpiresAt?: string; monthlyFee?: number }) {
    const store = await this.prisma.store.findUnique({
      where: { id },
    });

    if (!store) {
      throw new NotFoundException('Loja não encontrada');
    }

    const updateData: any = {};

    if (dto.title && dto.title.trim()) {
      updateData.title = dto.title.trim();
    }

    if (dto.subdomain && dto.subdomain.trim()) {
      const subdomainNormalized = dto.subdomain.trim().toLowerCase();
      const RESERVED_SUBDOMAINS = ['app', 'admin', 'api', 'www', 'localhost', 'superadmin'];

      if (RESERVED_SUBDOMAINS.includes(subdomainNormalized)) {
        throw new ConflictException(`O subdomínio "${subdomainNormalized}" é um nome reservado pelo sistema e não pode ser utilizado.`);
      }

      if (subdomainNormalized !== store.subdomain) {
        const existingSubdomain = await this.prisma.store.findUnique({
          where: { subdomain: subdomainNormalized },
        });
        if (existingSubdomain) {
          throw new ConflictException(`O subdomínio "${subdomainNormalized}" já está em uso por outra loja`);
        }
        updateData.subdomain = subdomainNormalized;
      }
    }

    if (dto.adminEmail && dto.adminEmail.trim()) {
      updateData.adminEmail = dto.adminEmail.trim().toLowerCase();
    }

    if (dto.subscriptionExpiresAt) {
      updateData.subscriptionExpiresAt = new Date(dto.subscriptionExpiresAt);
    }
    
    if (dto.monthlyFee !== undefined) {
      updateData.monthlyFee = Number(dto.monthlyFee);
    }

    const updatedStore = await this.prisma.store.update({
      where: { id },
      data: updateData,
    });

    // 1. Atualizar StoreSettings storeName se o título mudou
    if (updateData.title) {
      await this.prisma.storeSettings.updateMany({
        where: { storeId: id },
        data: { storeName: updateData.title },
      });
    }

    // 2. Sincronizar usuário Admin da loja se e-mail ou senha foram alterados
    const adminUser = (await this.prisma.user.findFirst({
      where: { storeId: id, role: 'ADMIN' },
    })) || (await this.prisma.user.findFirst({
      where: { email: store.adminEmail },
    }));

    if (adminUser) {
      const userUpdateData: any = {};
      if (updateData.adminEmail) {
        userUpdateData.email = updateData.adminEmail;
      }
      if (updateData.title) {
        userUpdateData.name = `Admin - ${updateData.title}`;
      }
      if (dto.password && dto.password.trim()) {
        userUpdateData.password = await bcrypt.hash(dto.password.trim(), 10);
      }

      if (Object.keys(userUpdateData).length > 0) {
        await this.prisma.user.update({
          where: { id: adminUser.id },
          data: userUpdateData,
        });
      }
    }

    return updatedStore;
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

    if (!store.isActive) {
      throw new UnauthorizedException('Loja inativa. A impressora não pode ser autenticada.');
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

  async toggleActive(id: string) {
    const store = await this.prisma.store.findUnique({
      where: { id },
    });

    if (!store) {
      throw new NotFoundException('Loja não encontrada');
    }

    const updatedStore = await this.prisma.store.update({
      where: { id },
      data: { isActive: !store.isActive },
    });

    return updatedStore;
  }

  async deleteStore(id: string) {
    const store = await this.prisma.store.findUnique({
      where: { id },
    });

    if (!store) {
      throw new NotFoundException('Loja não encontrada');
    }

    await this.prisma.store.delete({
      where: { id },
    });

    return { success: true, message: 'Loja excluída com sucesso' };
  }
}
