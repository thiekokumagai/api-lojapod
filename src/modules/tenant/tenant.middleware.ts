import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    let subdomain: string | undefined;

    // 1. Verificar cabeçalho X-Store-Subdomain
    const headerSubdomain = req.headers['x-store-subdomain'];
    if (typeof headerSubdomain === 'string' && headerSubdomain.trim()) {
      subdomain = headerSubdomain.trim().toLowerCase();
    }

    // 2. Verificar query parameter ?subdomain=
    if (!subdomain && typeof req.query.subdomain === 'string' && req.query.subdomain.trim()) {
      subdomain = req.query.subdomain.trim().toLowerCase();
    }

    // 3. Extrair de hostname (ex: demo.lojapod.com ou demo.localhost)
    if (!subdomain && req.hostname) {
      const parts = req.hostname.split('.');
      if (parts.length > 1 && parts[0] !== 'www' && parts[0] !== 'localhost' && parts[0] !== 'api') {
        subdomain = parts[0].toLowerCase();
      }
    }

    // Fallback padrão se não fornecido
    if (!subdomain) {
      subdomain = 'demo';
    }

    let storeId: string | undefined;
    let isActive: boolean | undefined;

    try {
      const store = await this.prisma.store.findUnique({
        where: { subdomain },
      });
      if (store) {
        storeId = store.id;
        isActive = store.isActive;
      }
    } catch (error) {
      // Ignora falha de resolução inicial durante inicializações
    }

    this.tenantContextService.run({ storeId, subdomain, isActive }, () => {
      next();
    });
  }
}
