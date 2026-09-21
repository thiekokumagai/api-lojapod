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
    let rawIdentifier: string | undefined;

    // 1. Verificar cabeçalho X-Store-Domain ou X-Store-Subdomain
    const headerDomain = req.headers['x-store-domain'] || req.headers['x-store-subdomain'];
    if (typeof headerDomain === 'string' && headerDomain.trim()) {
      rawIdentifier = headerDomain.trim().toLowerCase();
    }

    // 2. Verificar query parameter ?subdomain= ou ?domain=
    if (!rawIdentifier && typeof req.query.subdomain === 'string' && req.query.subdomain.trim()) {
      rawIdentifier = req.query.subdomain.trim().toLowerCase();
    }
    if (!rawIdentifier && typeof req.query.domain === 'string' && req.query.domain.trim()) {
      rawIdentifier = req.query.domain.trim().toLowerCase();
    }

    // 3. Extrair de hostname (ex: minhaloja.com.br, demo.lojapod.com ou localhost)
    if (!rawIdentifier && req.hostname) {
      rawIdentifier = req.hostname.toLowerCase();
    }

    // Fallback padrão se não fornecido
    if (!rawIdentifier) {
      rawIdentifier = 'demo';
    }

    let storeId: string | undefined;
    let isActive: boolean | undefined;
    let resolvedSubdomain: string | undefined;

    try {
      const cleanIdentifier = rawIdentifier.replace(/^www\./, '');
      const parts = cleanIdentifier.split('.');
      const firstPart = parts[0];

      const store = await this.prisma.store.findFirst({
        where: {
          OR: [
            { customDomain: cleanIdentifier },
            { customDomain: `www.${cleanIdentifier}` },
            { customDomain: rawIdentifier },
            { subdomain: cleanIdentifier },
            { subdomain: firstPart },
          ],
        },
      });

      if (store) {
        storeId = store.id;
        resolvedSubdomain = store.subdomain;
        isActive = store.isActive;
      }
    } catch (error) {
      // Ignora falha de resolução inicial durante inicializações
    }

    this.tenantContextService.run({ storeId, subdomain: resolvedSubdomain || rawIdentifier, isActive }, () => {
      next();
    });
  }
}
