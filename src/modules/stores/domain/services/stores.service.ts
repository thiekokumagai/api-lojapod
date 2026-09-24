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

  private normalizeDomain(domain: string): string {
    return domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/^www\./, '');
  }

  async connectDomain(storeId: string, rawDomain: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      throw new NotFoundException('Loja não encontrada.');
    }

    const hostname = this.normalizeDomain(rawDomain);
    if (!hostname || hostname.includes(' ')) {
      throw new ConflictException('Formato de domínio inválido. Exemplo correto: minhaloja.com.br');
    }

    // Verificar se domínio já está cadastrado em outra loja
    const existing = await this.prisma.storeDomain.findFirst({
      where: { hostname, NOT: { storeId } },
    });
    if (existing) {
      throw new ConflictException(`O domínio "${hostname}" já está cadastrado em outra loja.`);
    }

    // Se a loja já possui um StoreDomain cadastrado (diferente ou igual)
    const currentDomain = await this.prisma.storeDomain.findUnique({ where: { storeId } });
    if (currentDomain) {
      if (currentDomain.hostname === hostname) {
        // Retornar os dados já salvos
        return {
          id: currentDomain.id,
          domain: currentDomain.hostname,
          status: currentDomain.status,
          nameserver1: currentDomain.nameserver1,
          nameserver2: currentDomain.nameserver2,
        };
      }
      // Se for trocar de domínio, remove a zona anterior
      await this.removeDomain(storeId);
    }

    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

    if (!apiToken || !accountId) {
      throw new ConflictException('Integração com Cloudflare não configurada no servidor (CLOUDFLARE_API_TOKEN ou CLOUDFLARE_ACCOUNT_ID ausente).');
    }

    try {
      // 1. Criar Zona Cloudflare via API (Full setup)
      const zoneRes = await axios.post(
        'https://api.cloudflare.com/client/v4/zones',
        {
          account: { id: accountId },
          name: hostname,
          type: 'full',
        },
        {
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const zoneData = zoneRes.data?.result;
      const zoneId = zoneData?.id;
      const nameServers: string[] = zoneData?.name_servers || [];

      if (!zoneId || nameServers.length < 2) {
        throw new Error('Cloudflare não retornou os Name Servers necessários.');
      }

      // 2. Criar registros DNS na Cloudflare para a zona recém-criada
      const fallbackTarget = process.env.STORE_CNAME || 'fallback.lojapod.com';
      const headers = {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      };

      // CNAME @ -> fallbackTarget (Proxied: true)
      await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
        {
          type: 'CNAME',
          name: '@',
          content: fallbackTarget,
          proxied: true,
          ttl: 1,
        },
        { headers },
      ).catch((err) => {
        console.error('[Cloudflare DNS] Erro ao criar CNAME @:', err.response?.data || err.message);
      });

      // CNAME www -> hostname (Proxied: true)
      await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
        {
          type: 'CNAME',
          name: 'www',
          content: hostname,
          proxied: true,
          ttl: 1,
        },
        { headers },
      ).catch((err) => {
        console.error('[Cloudflare DNS] Erro ao criar CNAME www:', err.response?.data || err.message);
      });

      // 3. Salvar no banco com status inicial
      const storeDomain = await this.prisma.storeDomain.create({
        data: {
          storeId,
          hostname,
          cloudflareZoneId: zoneId,
          nameserver1: nameServers[0],
          nameserver2: nameServers[1],
          status: zoneData.status || 'pending',
        },
      });

      // Se a Cloudflare já retornar a zona como ativa no ato da criação (raro), atualiza customDomain
      if (storeDomain.status === 'active') {
        await this.prisma.store.update({
          where: { id: storeId },
          data: { customDomain: hostname },
        });
      }

      return {
        id: storeDomain.id,
        domain: storeDomain.hostname,
        status: storeDomain.status,
        nameserver1: storeDomain.nameserver1,
        nameserver2: storeDomain.nameserver2,
      };
    } catch (err: any) {
      console.error('[Cloudflare createZone] Erro:', err.response?.data || err.message);
      const errMsg = err.response?.data?.errors?.[0]?.message || err.message || 'Erro ao comunicar com Cloudflare';
      throw new ConflictException(`Erro ao criar zona Cloudflare: ${errMsg}`);
    }
  }

  async getDomainStatus(storeId: string) {
    const storeDomain = await this.prisma.storeDomain.findUnique({
      where: { storeId },
    });

    if (!storeDomain) {
      return {
        hasDomain: false,
        status: null,
      };
    }

    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (apiToken && storeDomain.cloudflareZoneId) {
      try {
        const zoneRes = await axios.get(
          `https://api.cloudflare.com/client/v4/zones/${storeDomain.cloudflareZoneId}`,
          {
            headers: { Authorization: `Bearer ${apiToken}` },
          },
        );
        const cfStatus = zoneRes.data?.result?.status;
        if (cfStatus && cfStatus !== storeDomain.status) {
          await this.prisma.storeDomain.update({
            where: { id: storeDomain.id },
            data: { status: cfStatus },
          });
          storeDomain.status = cfStatus;
        }

        // Se o status for 'active', atualiza customDomain na tabela Store para ser usado nos links e roteamento.
        // Se ainda for 'pending', garante que customDomain da Store permanece null (mantendo a URL do subdomínio lojapod).
        if (storeDomain.status === 'active') {
          await this.prisma.store.update({
            where: { id: storeId },
            data: { customDomain: storeDomain.hostname },
          });
        } else {
          await this.prisma.store.update({
            where: { id: storeId },
            data: { customDomain: null },
          });
        }
      } catch (err: any) {
        console.error('[Cloudflare getZoneStatus] Erro ao consultar Cloudflare:', err.response?.data || err.message);
      }
    }

    return {
      hasDomain: true,
      id: storeDomain.id,
      domain: storeDomain.hostname,
      status: storeDomain.status,
      nameserver1: storeDomain.nameserver1,
      nameserver2: storeDomain.nameserver2,
    };
  }

  async removeDomain(storeId: string) {
    const storeDomain = await this.prisma.storeDomain.findUnique({
      where: { storeId },
    });

    if (!storeDomain) {
      await this.prisma.store.update({
        where: { id: storeId },
        data: { customDomain: null },
      }).catch(() => {});
      return { success: true, message: 'Nenhum domínio configurado para remover.' };
    }

    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (apiToken && storeDomain.cloudflareZoneId) {
      try {
        await axios.delete(
          `https://api.cloudflare.com/client/v4/zones/${storeDomain.cloudflareZoneId}`,
          {
            headers: { Authorization: `Bearer ${apiToken}` },
          },
        );
      } catch (err: any) {
        console.error('[Cloudflare deleteZone] Erro ao deletar zona:', err.response?.data || err.message);
      }
    }

    await this.prisma.storeDomain.delete({
      where: { id: storeDomain.id },
    });

    await this.prisma.store.update({
      where: { id: storeId },
      data: { customDomain: null },
    });

    return { success: true, message: 'Domínio removido com sucesso.' };
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

    if (dto.adminEmail && dto.adminEmail.trim()) {
      updateData.adminEmail = dto.adminEmail.trim().toLowerCase();
    }

    const updatedStore = await this.prisma.store.update({
      where: { id },
      data: updateData,
    });

    if (updateData.title) {
      await this.prisma.storeSettings.updateMany({
        where: { storeId: id },
        data: { storeName: updateData.title },
      });
    }

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
