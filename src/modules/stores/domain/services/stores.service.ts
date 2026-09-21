import { Injectable, ConflictException, NotFoundException, UnauthorizedException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { CreateStoreDto } from '../../infrastructure/dtos/create-store.dto';
import { MinioService } from '../../../../minio/minio.service';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { promises as dns } from 'dns';
import axios from 'axios';

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly minioService?: MinioService,
  ) {}

  async createStore(dto: CreateStoreDto) {
    let subdomainBase = dto.subdomain ? dto.subdomain.trim().toLowerCase() : '';

    if (!subdomainBase) {
      subdomainBase = dto.title
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      if (!subdomainBase) subdomainBase = 'loja';
    }

    const RESERVED_SUBDOMAINS = ['app', 'admin', 'api', 'www', 'localhost', 'superadmin'];
    let finalSubdomain = subdomainBase;

    if (RESERVED_SUBDOMAINS.includes(finalSubdomain) || await this.prisma.store.findUnique({ where: { subdomain: finalSubdomain } })) {
      if (dto.subdomain) {
        throw new ConflictException(`O subdomínio "${subdomainBase}" já está em uso ou é reservado pelo sistema.`);
      }
      finalSubdomain = `${subdomainBase}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const printToken = `PRT-${randomUUID().substring(0, 8).toUpperCase()}`;

    const store = await this.prisma.store.create({
      data: {
        subdomain: finalSubdomain,
        title: dto.title.trim(),
        adminEmail: dto.adminEmail.trim().toLowerCase(),
        printToken,
      },
    });

    await this.prisma.storeSubscription.upsert({
      where: { storeId: store.id },
      create: {
        storeId: store.id,
        monthlyFee: 150,
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      update: {},
    });

    // Criar as configurações iniciais da loja
    await this.prisma.storeSettings.upsert({
      where: { storeId: store.id },
      create: {
        storeId: store.id,
        storeName: store.title,
        phone: dto.phone ? dto.phone.trim() : undefined,
      },
      update: {
        storeName: store.title,
        ...(dto.phone ? { phone: dto.phone.trim() } : {}),
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

  async syncCloudflareDomain(domain: string, action: 'create' | 'delete') {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;

    if (!apiToken || !zoneId) {
      console.log(`[Cloudflare SSL for SaaS] Tokens não configurados em .env. Ignorando sincronização para ${domain}.`);
      return null;
    }

    try {
      const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames`;
      const headers = {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      };

      if (action === 'create') {
        const response = await axios.post(
          url,
          {
            hostname: domain,
            ssl: {
              method: 'http',
              type: 'dv',
            },
          },
          { headers },
        );
        return response.data;
      } else if (action === 'delete') {
        // Buscar o hostname_id antes de deletar
        const listRes = await axios.get(`${url}?hostname=${domain}`, { headers });
        const hostnames = listRes.data?.result;
        if (hostnames && hostnames.length > 0) {
          const hostnameId = hostnames[0].id;
          await axios.delete(`${url}/${hostnameId}`, { headers });
        }
      }
    } catch (err: any) {
      console.error(`[Cloudflare SSL for SaaS] Erro ao sincronizar ${domain}:`, err.response?.data || err.message);
    }
  }

  async updateStore(id: string, dto: { title?: string; subdomain?: string; customDomain?: string | null; adminEmail?: string; password?: string }) {
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

    // Tratamento do Domínio Próprio (Custom Domain)
    if (dto.customDomain !== undefined) {
      if (dto.customDomain === null || dto.customDomain.trim() === '') {
        if (store.customDomain) {
          await this.syncCloudflareDomain(store.customDomain, 'delete');
        }
        updateData.customDomain = null;
      } else {
        const cleanDomain = dto.customDomain
          .trim()
          .toLowerCase()
          .replace(/^https?:\/\//, '')
          .replace(/\/.*$/, '')
          .replace(/^www\./, '');

        if (!cleanDomain || cleanDomain.includes(' ')) {
          throw new ConflictException('Formato de domínio inválido. Insira apenas o domínio (ex: minhaloja.com.br)');
        }

        if (cleanDomain !== store.customDomain) {
          const existingDomain = await this.prisma.store.findFirst({
            where: {
              OR: [
                { customDomain: cleanDomain },
                { customDomain: `www.${cleanDomain}` },
                { subdomain: cleanDomain },
              ],
              NOT: { id },
            },
          });

          if (existingDomain) {
            throw new ConflictException(`O domínio "${cleanDomain}" já está em uso por outra loja.`);
          }

          if (store.customDomain) {
            await this.syncCloudflareDomain(store.customDomain, 'delete');
          }

          updateData.customDomain = cleanDomain;
          await this.syncCloudflareDomain(cleanDomain, 'create');
        }
      }
    }

    if (dto.adminEmail && dto.adminEmail.trim()) {
      updateData.adminEmail = dto.adminEmail.trim().toLowerCase();
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
        subscription: true,
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

  async getStoreBySubdomain(identifier: string) {
    const raw = identifier.toLowerCase().trim();
    const clean = raw.replace(/^www\./, '');
    const parts = clean.split('.');
    const firstPart = parts[0];

    const store = await this.prisma.store.findFirst({
      where: {
        OR: [
          { customDomain: clean },
          { customDomain: `www.${clean}` },
          { customDomain: raw },
          { subdomain: clean },
          { subdomain: firstPart },
        ],
      },
      include: {
        storeSettings: true,
      },
    });

    if (!store) {
      throw new NotFoundException(`Loja com subdomínio ou domínio "${identifier}" não encontrada`);
    }

    return store;
  }

  async verifyDomainDns(id: string) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store || !store.customDomain) {
      return {
        hasDomain: false,
        isConfigured: false,
        message: 'Nenhum domínio próprio cadastrado para esta loja.',
      };
    }

    const domain = store.customDomain;
    let isConfigured = false;
    let records: string[] = [];
    let recordType = 'DESCONHECIDO';

    try {
      try {
        const cnames = await dns.resolveCname(domain);
        if (cnames && cnames.length > 0) {
          records = cnames;
          recordType = 'CNAME';
          isConfigured = true;
        }
      } catch (e) {
        const ips = await dns.resolve4(domain);
        if (ips && ips.length > 0) {
          records = ips;
          recordType = 'A';
          isConfigured = true;
        }
      }

      return {
        hasDomain: true,
        domain,
        isConfigured,
        recordType,
        records,
        message: isConfigured
          ? `O DNS do domínio ${domain} foi verificado e encontrado registros (${recordType}: ${records.join(', ')}).`
          : `O DNS de ${domain} ainda não foi detectado apontando para o servidor. Pode levar alguns minutos para a propagação.`,
      };
    } catch (err: any) {
      return {
        hasDomain: true,
        domain,
        isConfigured: false,
        recordType: 'ERRO',
        records: [],
        message: `Não foi possível resolver o DNS para ${domain}. Verifique se o registro CNAME ou A foi criado no seu provedor de domínio (Registro.br, Cloudflare, etc).`,
      };
    }
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

    const cleanToken = token.trim();

    const store = await this.prisma.store.findFirst({
      where: {
        OR: [
          { printToken: { equals: cleanToken, mode: 'insensitive' } },
          { printToken: { equals: cleanToken.toUpperCase(), mode: 'insensitive' } },
        ],
      },
    });

    if (!store) {
      throw new UnauthorizedException('Token de impressão inválido. Verifique o token no Painel Admin.');
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

    // Limpa todos os arquivos da loja no MinIO (logos, favicons, banners, imagens de produtos/categorias)
    if (this.minioService) {
      await this.minioService.deleteFolder(id).catch((err) => {
        console.error(`[StoresService] Erro ao deletar arquivos da loja ${id} no MinIO:`, err);
      });
    }

    await this.prisma.store.delete({
      where: { id },
    });

    return { success: true, message: 'Loja excluída com sucesso' };
  }
}
